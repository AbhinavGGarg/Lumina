"""Planner module for Pulse.

Inspects a target (URL or filesystem path), generates an architecture snapshot,
and uses an LLM to dynamically select the correct security agents.
"""

import json
import logging
import os
import re
from collections import defaultdict
from pathlib import Path

from langchain_core.messages import HumanMessage

from .llm_service import get_llm
from ..core.prompts import PLANNER_SYSTEM

# Maximum number of files to walk when fingerprinting.
_MAX_FILES_WALKED = 1000

# Valid planner agents for repository targets.
_VALID_REPO_AGENTS = ("static_c", "static", "deps_py", "deps_js", "secrets")

# Directories excluded from repo fingerprinting.
_SKIP_DIRS = {
    ".git", "node_modules", "__pycache__", "vendor", "target", "build",
    "dist", "out", ".next", ".venv", "venv", "env",
}

# Lightweight extension-to-language groups used only for architecture grounding
# (not for selecting tools).
_LANG_GROUPS: dict[str, set[str]] = {
    "python": {".py"},
    "javascript": {".js", ".mjs", ".cjs", ".jsx"},
    "typescript": {".ts", ".tsx"},
    "c/c++": {".c", ".cc", ".cpp", ".cxx", ".h", ".hpp"},
    "go": {".go"},
    "rust": {".rs"},
    "java": {".java"},
}

# ── Private helpers ───────────────────────────────────────────────────────────

def _extract_first_json_object(text: str) -> dict | None:
    """Extract the first syntactically valid JSON object from arbitrary text.

    Handles cases where the LLM wraps its JSON in prose or adds a preamble.
    Uses brace-depth tracking rather than a regex so nested objects work.
    """
    start = text.find("{")
    if start == -1:
        return None
    depth = 0
    for i, ch in enumerate(text[start:], start):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start : i + 1])
                except json.JSONDecodeError:
                    # The outer braces were found but inner JSON was invalid;
                    # keep scanning for another opening brace.
                    start = text.find("{", i + 1)
                    if start == -1:
                        return None
                    depth = 0
    return None


def _should_skip_dir(name: str) -> bool:
    return name.startswith(".") or name in _SKIP_DIRS


def _collect_repo_signals(repo_path: str) -> dict:
    """Collect observed language/dependency signals from repository contents."""
    ext_counts: dict[str, int] = defaultdict(int)
    files_checked = 0

    for dirpath, dirnames, filenames in os.walk(repo_path):
        dirnames[:] = [d for d in dirnames if not _should_skip_dir(d)]
        for fname in filenames:
            ext = Path(fname).suffix.lower()
            if ext:
                ext_counts[ext] += 1
            files_checked += 1
            if files_checked >= _MAX_FILES_WALKED:
                break
        if files_checked >= _MAX_FILES_WALKED:
            break

    root_entries = set(os.listdir(repo_path)) if os.path.isdir(repo_path) else set()
    observed_languages: list[str] = []
    for lang, exts in _LANG_GROUPS.items():
        if any(ext_counts.get(ext, 0) > 0 for ext in exts):
            observed_languages.append(lang)

    return {
        "ext_counts": dict(ext_counts),
        "observed_languages": observed_languages,
        "files_checked": files_checked,
        "has_py_deps": bool(root_entries & {"requirements.txt", "requirements.in", "Pipfile", "Pipfile.lock", "pyproject.toml", "setup.py", "setup.cfg"}),
        "has_js_deps": bool(root_entries & {"package.json", "yarn.lock", "pnpm-lock.yaml", "package-lock.json"}),
    }


def _assert_repo_accessible(repo_path: str) -> None:
    """Validate repo path is readable in the backend runtime (Docker container)."""
    if not os.path.exists(repo_path):
        raise ValueError(
            f"Repository path does not exist in backend runtime: {repo_path}. "
            "If backend runs in Docker, mount the folder under /repos or /tmp."
        )
    if not os.path.isdir(repo_path):
        raise ValueError(f"Repository target is not a directory: {repo_path}")


def _build_grounded_architecture_summary(signals: dict) -> str:
    """Create a concise architecture summary based only on observed signals."""
    langs: list[str] = signals.get("observed_languages", [])
    has_py_deps = bool(signals.get("has_py_deps"))
    has_js_deps = bool(signals.get("has_js_deps"))

    if not langs:
        base = "Repository with mixed or unclassified source files"
    elif len(langs) == 1:
        base = f"Repository primarily built with {langs[0]}"
    else:
        base = f"Repository with a mixed stack ({', '.join(langs)})"

    dep_parts: list[str] = []
    if has_js_deps:
        dep_parts.append("Node.js dependencies")
    if has_py_deps:
        dep_parts.append("Python dependencies")

    if dep_parts:
        return f"{base} and {', '.join(dep_parts)}."
    return f"{base}."


def _mentions_unobserved_stack(summary: str, signals: dict) -> bool:
    """Check whether summary mentions languages not present in observed signals."""
    text = summary.lower()
    observed = set(signals.get("observed_languages", []))

    checks = {
        "python": ["python"],
        "javascript": ["javascript", "node.js", "nodejs", "node"],
        "typescript": ["typescript"],
        "c/c++": ["c/c++", "c++", " c ", "native"],
        "go": ["go", "golang"],
        "rust": ["rust"],
        "java": ["java"],
    }

    for lang, tokens in checks.items():
        if any(tok in text for tok in tokens) and lang not in observed:
            return True
    return False


def _normalize_repo_agents(raw_agents: list[str] | tuple[str, ...] | None) -> list[str]:
    """Keep only known repo agents and preserve order."""
    if not raw_agents:
        return []

    valid = set(_VALID_REPO_AGENTS)
    normalized: list[str] = []
    seen: set[str] = set()

    for item in raw_agents:
        agent = str(item).strip()
        if agent in valid and agent not in seen:
            seen.add(agent)
            normalized.append(agent)
    return normalized


def _extract_plan_dict(text: str) -> dict | None:
    """Parse planner output from either raw JSON or JSON wrapped in prose."""
    clean = re.sub(r"^```(?:json)?\s*", "", text.strip())
    clean = re.sub(r"\s*```$", "", clean).strip()
    try:
        data = json.loads(clean)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass
    return _extract_first_json_object(text)


def _repair_plan_with_llm(raw_text: str, fingerprint: str) -> dict | None:
    """Second-pass recovery: ask the LLM to reformat content into strict JSON."""
    llm = get_llm()
    repair_prompt = (
        "You are a JSON formatter. Convert the planner output into valid JSON only. "
        "Return exactly one JSON object with keys: architecture_summary, threat_model, agents_plan. "
        "Allowed agents_plan values only: [\"static_c\", \"static\", \"deps_py\", \"deps_js\", \"secrets\"].\n\n"
        f"Repository Snapshot:\n{fingerprint}\n\n"
        f"Planner Output To Repair:\n{raw_text}"
    )
    response = llm.invoke([HumanMessage(content=repair_prompt)])
    return _extract_plan_dict(str(response.content or ""))


def _safe_repo_fallback() -> dict:
    """Broad fallback so scans still run meaningfully if planner parsing fails."""
    return {
        "architecture_summary": "Repository (fallback plan)",
        "threat_model": "Code, dependency, and secret-exposure threats across mixed stack.",
        "agents": ["static", "static_c", "deps_py", "deps_js", "secrets"],
    }


def _generate_fingerprint(repo_path: str) -> str:
    """Walk the repository and build a compact architecture fingerprint.
    
    Lists root files explicitly and aggregates file extensions per directory.
    """
    root_files = []
    dir_summaries: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    
    files_checked = 0
    for dirpath, dirnames, filenames in os.walk(repo_path):
        # Skip hidden dirs and common noise dirs.
        dirnames[:] = [d for d in dirnames if not _should_skip_dir(d)]
        
        rel_dir = os.path.relpath(dirpath, repo_path)
        is_root = (rel_dir == ".")
        
        for fname in filenames:
            ext = Path(fname).suffix.lower() or fname.lower()
            
            if is_root:
                root_files.append(fname)
            
            dir_summaries[rel_dir][ext] += 1
            
            files_checked += 1
            if files_checked >= _MAX_FILES_WALKED:
                break
        if files_checked >= _MAX_FILES_WALKED:
            break

    # Format the fingerprint output
    lines = ["Root Files:"]
    for f in sorted(root_files):
        lines.append(f"  - {f}")
        
    lines.append("\nDirectory Summary:")
    for directory, exts in sorted(dir_summaries.items()):
        total = sum(exts.values())
        ext_str = ", ".join(f"{ext}: {count}" for ext, count in sorted(exts.items()))
        dir_name = "/" if directory == "." else f"/{directory}"
        lines.append(f"  {dir_name}: {total} files ({ext_str})")
        
    return "\n".join(lines)


def _call_llm_planner(fingerprint: str, signals: dict) -> dict:
    """Pass the fingerprint to the LLM and receive a scan plan.

    Attempts LLM-driven planning first. If parsing fails, retries once with
    a dedicated JSON-repair prompt. If still failing, uses a broad safe plan.
    """
    llm = get_llm()
    prompt = f"{PLANNER_SYSTEM}\n\nRepository Snapshot:\n{fingerprint}"

    try:
        response = llm.invoke([HumanMessage(content=prompt)])
        text = str(response.content or "")

        data = _extract_plan_dict(text)
        if not data:
            logging.warning("Planner output was not valid JSON; attempting repair pass.")
            data = _repair_plan_with_llm(text, fingerprint)

        if data and isinstance(data, dict):
            raw_agents = data.get("agents_plan") or data.get("agents") or []
            agents = _normalize_repo_agents(raw_agents if isinstance(raw_agents, list) else [])
            if not agents:
                logging.warning("Planner produced no valid agents; using safe fallback agents.")
                agents = _safe_repo_fallback()["agents"]

            architecture = str(data.get("architecture_summary") or "")
            if not architecture or _mentions_unobserved_stack(architecture, signals):
                architecture = _build_grounded_architecture_summary(signals)
            threat_model = str(data.get("threat_model") or "Code and dependency security risks.")
            return {
                "architecture_summary": architecture,
                "threat_model": threat_model,
                "agents": agents,
            }

    except Exception as e:
        logging.error("LLM planner invocation failed: %s", e)

    logging.warning("LLM planner failed after recovery; using safe fallback plan.")
    return _safe_repo_fallback()


# ── Public planner API ────────────────────────────────────────────────────────

class ScanPlan:
    """Immutable result of the planning phase.

    Attributes:
        target_type: "url" or "repo"
        architecture_summary: LLM-generated tech stack description
        threat_model: LLM-generated threat assessment
        agents: Ordered list of agent node keys to execute
    """

    def __init__(
        self,
        target_type: str,
        architecture_summary: str,
        threat_model: str,
        agents: list[str],
    ) -> None:
        self.target_type = target_type
        self.architecture_summary = architecture_summary
        self.threat_model = threat_model
        
        # Ensure report is always the last agent
        if "report" not in agents:
            agents.append("report")
        self.agents = agents

    def __repr__(self) -> str:
        return (
            f"ScanPlan(target_type={self.target_type!r}, "
            f"arch={self.architecture_summary!r}, agents={self.agents})"
        )


def plan(target: str) -> ScanPlan:
    """Produce a tailored scan plan for the given target.

    For filesystem paths, generates a structural fingerprint and uses an LLM
    to architect a plan. For URLs, the full network-oriented pipeline is returned.

    Args:
        target: URL (http/https) or absolute filesystem path.

    Returns:
        ScanPlan describing target type, architecture, and agent order.
    """
    is_path = target.startswith("/") or target.startswith(".")

    if not is_path:
        # URL target -- full network scan pipeline.
        return ScanPlan(
            target_type="url",
            architecture_summary="Live Web Application",
            threat_model="Network layer threats, XSS, and SQLi.",
            agents=["recon", "sqli", "xss", "deps", "secrets", "attack_chain", "report"],
        )

    # Filesystem target -- dynamically architect a plan.
    _assert_repo_accessible(target)

    fingerprint = _generate_fingerprint(target)
    logging.info("Generated repo fingerprint:\n%s", fingerprint)

    signals = _collect_repo_signals(target)
    logging.info("Observed language signals: %s", signals.get("observed_languages", []))
    if int(signals.get("files_checked", 0)) == 0:
        raise ValueError(
            f"Repository is empty or unreadable after filtering: {target}. "
            "Ensure source files are present under /repos or /tmp in the backend container."
        )

    plan_data = _call_llm_planner(fingerprint, signals)
    
    return ScanPlan(
        target_type="repo",
        architecture_summary=plan_data["architecture_summary"],
        threat_model=plan_data["threat_model"],
        agents=plan_data["agents"],
    )

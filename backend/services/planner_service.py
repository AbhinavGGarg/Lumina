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

# ── Language detection tables ─────────────────────────────────────────────────

# Maps file extension → canonical language name.
_LANG_EXTENSIONS: dict[str, str] = {
    ".py":   "python",
    ".js":   "javascript",
    ".mjs":  "javascript",
    ".cjs":  "javascript",
    ".jsx":  "javascript",
    ".ts":   "typescript",
    ".tsx":  "typescript",
    ".c":    "c",
    ".cpp":  "c",
    ".cc":   "c",
    ".cxx":  "c",
    ".h":    "c",
    ".hpp":  "c",
    ".go":   "go",
    ".rs":   "rust",
    ".java": "java",
    ".rb":   "ruby",
    ".php":  "php",
}

# Maps language → agents that should be run for it.
_LANG_AGENT_MAP: dict[str, list[str]] = {
    "python":     ["static"],
    "javascript": ["static"],
    "typescript": ["static"],
    "c":          ["static_c"],
    "go":         ["static"],
    "rust":       ["static"],
    "java":       ["static"],
    "ruby":       ["static"],
    "php":        ["static"],
}

# Dependency files that trigger dependency-audit agents.
_PY_DEP_FILES  = {"requirements.txt", "requirements.in", "Pipfile", "Pipfile.lock",
                  "pyproject.toml", "setup.py", "setup.cfg"}
_JS_DEP_FILES  = {"package.json", "yarn.lock", "pnpm-lock.yaml", "package-lock.json"}

# ── Private helpers ───────────────────────────────────────────────────────────

def _detect_languages(repo_path: str) -> list[str]:
    """Walk the repo and return languages ordered by file count (most common first)."""
    lang_counts: dict[str, int] = defaultdict(int)
    for dirpath, dirnames, filenames in os.walk(repo_path):
        dirnames[:] = [
            d for d in dirnames
            if not d.startswith(".")
            and d not in {"node_modules", "__pycache__", "vendor", "target", "build", ".git"}
        ]
        for fname in filenames:
            ext = Path(fname).suffix.lower()
            lang = _LANG_EXTENSIONS.get(ext)
            if lang:
                lang_counts[lang] += 1
    return [lang for lang, _ in sorted(lang_counts.items(), key=lambda x: -x[1])]


def _agents_for_languages(languages: list[str], repo_path: str) -> list[str]:
    """Build a deterministic, deduplicated agent list from detected languages.

    Also inspects root-level dependency manifests to decide whether to run
    deps_py / deps_js even when the main languages were already covered.
    """
    agents: list[str] = []
    seen: set[str] = set()

    def _add(a: str) -> None:
        if a not in seen:
            seen.add(a)
            agents.append(a)

    for lang in languages:
        for agent in _LANG_AGENT_MAP.get(lang, []):
            _add(agent)

    # Check dependency manifests at repo root.
    if os.path.isdir(repo_path):
        root_entries = set(os.listdir(repo_path))
        if root_entries & _PY_DEP_FILES:
            _add("deps_py")
        if root_entries & _JS_DEP_FILES:
            _add("deps_js")

    _add("secrets")
    return agents


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


def _generate_fingerprint(repo_path: str) -> str:
    """Walk the repository and build a compact architecture fingerprint.
    
    Lists root files explicitly and aggregates file extensions per directory.
    """
    root_files = []
    dir_summaries: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    
    files_checked = 0
    for dirpath, dirnames, filenames in os.walk(repo_path):
        # Skip hidden dirs and common noise dirs.
        dirnames[:] = [
            d for d in dirnames
            if not d.startswith(".")
            and d not in {"node_modules", "__pycache__", "vendor", "target", "build"}
        ]
        
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


def _call_llm_planner(
    fingerprint: str,
    fallback_languages: list[str],
    repo_path: str,
) -> dict:
    """Pass the fingerprint to the LLM and receive a scan plan.

    Attempts LLM-driven planning first.  If the LLM response cannot be
    parsed as JSON, falls back to a fully deterministic plan derived from
    the detected languages so the scan always runs meaningful agents.
    """
    llm = get_llm()
    prompt = f"{PLANNER_SYSTEM}\n\nRepository Snapshot:\n{fingerprint}"

    try:
        response = llm.invoke([HumanMessage(content=prompt)])
        text = response.content.strip()

        # ── Attempt 1: strip markdown fences and direct-parse ──
        clean = re.sub(r"^```(?:json)?\s*", "", text)
        clean = re.sub(r"\s*```$", "", clean).strip()
        data: dict | None = None
        try:
            data = json.loads(clean)
        except json.JSONDecodeError:
            pass

        # ── Attempt 2: extract first JSON object from anywhere in the text ──
        if data is None:
            data = _extract_first_json_object(text)

        if data and isinstance(data, dict):
            # Accept either "agents_plan" or "agents" key from the LLM.
            llm_agents = data.get("agents_plan") or data.get("agents") or []
            if not isinstance(llm_agents, list) or not llm_agents:
                # LLM gave us the arch/threat info but an empty/bad agent list.
                llm_agents = _agents_for_languages(fallback_languages, repo_path)
            return {
                "architecture_summary": data.get("architecture_summary", ""),
                "threat_model":         data.get("threat_model", ""),
                "agents":               llm_agents,
            }

    except Exception as e:
        logging.error("LLM planner invocation failed: %s", e)

    # ── Full deterministic fallback ──────────────────────────────────────────
    logging.warning(
        "LLM planner parsing failed — using deterministic fallback for languages: %s",
        fallback_languages,
    )
    agents = _agents_for_languages(fallback_languages, repo_path)
    lang_str = ", ".join(fallback_languages) if fallback_languages else "mixed"
    return {
        "architecture_summary": f"Repository ({lang_str})",
        "threat_model":         "Code vulnerabilities, dependency issues, and secret exposure.",
        "agents":               agents,
    }


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
            agents=["recon", "sqli", "xss", "deps", "secrets", "report"],
        )

    # Filesystem target -- dynamically architect a plan.
    fingerprint = _generate_fingerprint(target)
    logging.info("Generated repo fingerprint:\n%s", fingerprint)

    languages = _detect_languages(target)
    logging.info("Detected languages: %s", languages)

    plan_data = _call_llm_planner(fingerprint, languages, target)
    
    return ScanPlan(
        target_type="repo",
        architecture_summary=plan_data["architecture_summary"],
        threat_model=plan_data["threat_model"],
        agents=plan_data["agents"],
    )

"""Planner module for Pulse.

Inspects a target (URL or filesystem path) and determines which scan
agents are applicable, avoiding the naive approach of running every
tool regardless of the codebase's language or type.
"""

import os
from pathlib import Path


# ── Language detection helpers ────────────────────────────────────────────────

_LANG_MARKERS: dict[str, list[str]] = {
    "python":     ["requirements.txt", "pyproject.toml", "setup.py", "Pipfile"],
    "javascript": ["package.json"],
    "go":         ["go.mod"],
    "rust":       ["Cargo.toml"],
    "java":       ["pom.xml", "build.gradle"],
    "ruby":       ["Gemfile"],
    "php":        ["composer.json"],
}

_LANG_EXTENSIONS: dict[str, list[str]] = {
    "python":     [".py"],
    "javascript": [".js", ".ts", ".jsx", ".tsx", ".mjs"],
    "go":         [".go"],
    "rust":       [".rs"],
    "java":       [".java"],
    "c":          [".c", ".h"],
    "cpp":        [".cpp", ".cc", ".cxx", ".hpp"],
    "ruby":       [".rb"],
    "php":        [".php"],
}

# Maximum number of files to walk when fingerprinting extensions.
_MAX_FILES_WALKED = 1000


def _detect_languages(repo_path: str) -> list[str]:
    """Detect programming languages present in a repository.

    Uses marker files first (fast, no filesystem walk), then falls
    back to extension sampling for up to _MAX_FILES_WALKED files.

    Args:
        repo_path: Absolute path to the repository root.

    Returns:
        Sorted list of detected language names (lower-case).
    """
    found: set[str] = set()
    root = Path(repo_path)

    # Marker-file pass -- O(1) per language.
    for lang, markers in _LANG_MARKERS.items():
        if any((root / m).exists() for m in markers):
            found.add(lang)

    # Extension sampling pass.
    ext_to_lang: dict[str, str] = {}
    for lang, exts in _LANG_EXTENSIONS.items():
        for ext in exts:
            ext_to_lang[ext] = lang

    files_checked = 0
    for dirpath, dirnames, filenames in os.walk(repo_path):
        # Skip hidden dirs and common noise dirs.
        dirnames[:] = [
            d for d in dirnames
            if not d.startswith(".")
            and d not in {"node_modules", "__pycache__", "vendor", "target", ".git"}
        ]
        for fname in filenames:
            ext = Path(fname).suffix.lower()
            if ext in ext_to_lang:
                found.add(ext_to_lang[ext])
            files_checked += 1
            if files_checked >= _MAX_FILES_WALKED:
                break
        if files_checked >= _MAX_FILES_WALKED:
            break

    return sorted(found)


# ── Public planner API ────────────────────────────────────────────────────────

class ScanPlan:
    """Immutable result of the planning phase.

    Attributes:
        target_type: "url" or "repo"
        languages: Detected languages (empty for URL targets)
        agents: Ordered list of agent node keys to execute
    """

    def __init__(
        self,
        target_type: str,
        languages: list[str],
        agents: list[str],
    ) -> None:
        self.target_type = target_type
        self.languages = languages
        self.agents = agents

    def __repr__(self) -> str:
        return (
            f"ScanPlan(target_type={self.target_type!r}, "
            f"languages={self.languages}, agents={self.agents})"
        )


def plan(target: str) -> ScanPlan:
    """Produce a tailored scan plan for the given target.

    For filesystem paths, inspects the repository to detect languages
    and returns only the agents appropriate for the detected stack.
    For URLs the full network-oriented pipeline is returned.

    Args:
        target: URL (http/https) or absolute filesystem path.

    Returns:
        ScanPlan describing target type, languages, and agent order.
    """
    is_path = target.startswith("/") or target.startswith(".")

    if not is_path:
        # URL target -- full network scan pipeline.
        return ScanPlan(
            target_type="url",
            languages=[],
            agents=["recon", "sqli", "xss", "deps", "secrets", "report"],
        )

    # Filesystem target -- inspect and build a tailored plan.
    languages = _detect_languages(target)
    agents: list[str] = []

    has_c_cpp   = bool({"c", "cpp"} & set(languages))
    has_python  = "python" in languages
    has_js      = "javascript" in languages
    has_go      = "go" in languages
    has_rust    = "rust" in languages
    has_java    = "java" in languages

    if has_c_cpp:
        agents.append("static_c")

    # semgrep + bandit cover Python; semgrep also covers JS/Go/Java.
    if has_python or has_js or has_go or has_java or has_rust:
        agents.append("static")

    # Dependency audits -- only when the relevant manifest exists.
    if has_python:
        agents.append("deps_py")

    if has_js:
        agents.append("deps_js")

    # Secrets scanning applies to any repo.
    agents.append("secrets")
    agents.append("report")

    # Fallback: at minimum run secrets + report even for unknown stacks.
    if not agents:
        agents = ["secrets", "report"]

    return ScanPlan(target_type="repo", languages=languages, agents=agents)

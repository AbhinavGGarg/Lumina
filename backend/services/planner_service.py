"""Planner module for Pulse.

Inspects a target (URL or filesystem path), generates an architecture snapshot,
and uses an LLM to dynamically select the correct security agents.
"""

import json
import logging
import os
from collections import defaultdict
from pathlib import Path

from langchain_core.messages import HumanMessage

from .llm_service import get_llm
from ..core.prompts import PLANNER_SYSTEM

# Maximum number of files to walk when fingerprinting.
_MAX_FILES_WALKED = 1000

# ── Private helpers ───────────────────────────────────────────────────────────

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


def _call_llm_planner(fingerprint: str) -> dict:
    """Pass the fingerprint to the LLM and receive a strict JSON plan."""
    llm = get_llm()
    prompt = f"{PLANNER_SYSTEM}\n\nRepository Snapshot:\n{fingerprint}"
    
    try:
        response = llm.invoke([HumanMessage(content=prompt)])
        text = response.content.strip()
        text = text.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        data = json.loads(text)
        
        return {
            "architecture_summary": data.get("architecture_summary", "Unknown architecture"),
            "threat_model": data.get("threat_model", "Unknown threats"),
            "agents": data.get("agents_plan", ["secrets", "report"]),
        }
    except Exception as e:
        logging.error("Failed to parse LLM planner output: %s", e)
        return {
            "architecture_summary": "Fallback (LLM Parsing Failed)",
            "threat_model": "Unknown",
            "agents": ["secrets", "report"],
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
            agents=["recon", "sqli", "xss", "deps", "secrets", "attack_chain", "report"],
        )

    # Filesystem target -- dynamically architect a plan.
    fingerprint = _generate_fingerprint(target)
    logging.info("Generated repo fingerprint:\n%s", fingerprint)
    
    plan_data = _call_llm_planner(fingerprint)
    
    return ScanPlan(
        target_type="repo",
        architecture_summary=plan_data["architecture_summary"],
        threat_model=plan_data["threat_model"],
        agents=plan_data["agents"],
    )

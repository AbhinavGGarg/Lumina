import json
import os
import subprocess
from langchain_core.tools import tool


@tool
def run_pip_audit(repo_path: str) -> dict:
    """Audit Python dependencies for known CVEs using pip-audit."""
    # Find requirements or pyproject.toml
    req_file = None
    for name in ("requirements.txt", "requirements-dev.txt", "pyproject.toml"):
        candidate = os.path.join(repo_path, name)
        if os.path.exists(candidate):
            req_file = candidate
            break

    if not req_file:
        return {"vulnerabilities": [], "total": 0, "error": "No Python dependency file found"}

    cmd = ["pip-audit", "-r", req_file, "--format=json"] if req_file.endswith(".txt") \
        else ["pip-audit", "--format=json"]

    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=90, cwd=repo_path)
        try:
            data = json.loads(r.stdout)
            vulns = data if isinstance(data, list) else data.get("dependencies", [])
            # Keep only entries with actual vulnerabilities
            affected = [d for d in vulns if d.get("vulns")]
            return {"vulnerabilities": affected[:30], "total": len(affected), "error": ""}
        except json.JSONDecodeError:
            return {"vulnerabilities": [], "total": 0, "error": r.stderr[:500]}
    except FileNotFoundError:
        return {"vulnerabilities": [], "total": 0, "error": "pip-audit not found — install via: pip install pip-audit"}
    except subprocess.TimeoutExpired:
        return {"vulnerabilities": [], "total": 0, "error": "pip-audit timed out after 90s"}


@tool
def run_npm_audit(repo_path: str) -> dict:
    """Audit Node.js dependencies for known CVEs using npm audit."""
    pkg_json = os.path.join(repo_path, "package.json")
    if not os.path.exists(pkg_json):
        return {"vulnerabilities": [], "total": 0, "error": "No package.json found"}

    cmd = ["npm", "audit", "--json"]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=60, cwd=repo_path)
        try:
            data = json.loads(r.stdout)
            vulns = data.get("vulnerabilities", {})
            flat = [{"name": k, **v} for k, v in list(vulns.items())[:30]]
            return {"vulnerabilities": flat, "total": data.get("metadata", {}).get("vulnerabilities", {}).get("total", len(flat)), "error": ""}
        except json.JSONDecodeError:
            return {"vulnerabilities": [], "total": 0, "error": r.stderr[:500]}
    except FileNotFoundError:
        return {"vulnerabilities": [], "total": 0, "error": "npm not found"}
    except subprocess.TimeoutExpired:
        return {"vulnerabilities": [], "total": 0, "error": "npm audit timed out after 60s"}

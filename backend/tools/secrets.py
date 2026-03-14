import json
import subprocess
from langchain_core.tools import tool


@tool
def run_trufflehog(repo_path: str) -> dict:
    """Scan a repository for hardcoded secrets, API keys, and credentials using trufflehog."""
    cmd = ["trufflehog", "filesystem", repo_path, "--json", "--no-update"]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        findings = []
        for line in r.stdout.strip().splitlines():
            if line:
                try:
                    findings.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
        # Redact actual secret values before returning
        for f in findings:
            if "Raw" in f:
                f["Raw"] = "[REDACTED]"
            if "RawV2" in f:
                f["RawV2"] = "[REDACTED]"
        return {"findings": findings[:20], "total": len(findings), "error": ""}
    except FileNotFoundError:
        return {"findings": [], "total": 0, "error": "trufflehog not found — install via: go install github.com/trufflesecurity/trufflehog/v3@latest"}
    except subprocess.TimeoutExpired:
        return {"findings": [], "total": 0, "error": "trufflehog timed out after 60s"}


@tool
def run_detect_secrets(repo_path: str) -> dict:
    """Scan a repository for secrets patterns using detect-secrets (Yelp)."""
    cmd = ["detect-secrets", "scan", repo_path]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        try:
            data = json.loads(r.stdout)
            results = data.get("results", {})
            # Flatten: {file: [{type, line_number}]}
            flat = [
                {"file": f, "line_number": s["line_number"], "type": s["type"]}
                for f, secrets in results.items()
                for s in secrets
            ]
            return {"findings": flat[:20], "total": len(flat), "error": ""}
        except json.JSONDecodeError:
            return {"findings": [], "total": 0, "error": r.stderr[:500]}
    except FileNotFoundError:
        return {"findings": [], "total": 0, "error": "detect-secrets not found — install via: pip install detect-secrets"}
    except subprocess.TimeoutExpired:
        return {"findings": [], "total": 0, "error": "detect-secrets timed out after 30s"}

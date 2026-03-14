import json
import subprocess
from langchain_core.tools import tool


@tool
def run_httpx(url: str) -> dict:
    """Probe a URL for HTTP status, page title, redirect chain, and detected tech stack."""
    cmd = [
        "httpx", "-u", url,
        "-json", "-title", "-tech-detect", "-status-code", "-silent",
    ]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        lines = []
        for line in r.stdout.strip().splitlines():
            if line:
                try:
                    lines.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
        return {"results": lines, "error": r.stderr[:500] if r.stderr else ""}
    except FileNotFoundError:
        return {"results": [], "error": "httpx not found — install via: go install github.com/projectdiscovery/httpx/cmd/httpx@latest"}
    except subprocess.TimeoutExpired:
        return {"results": [], "error": "httpx timed out after 30s"}


@tool
def run_nmap(host: str) -> dict:
    """Scan open ports and services on a host (ports 1-10000, T4 timing, service version detection)."""
    cmd = ["nmap", "-sV", "--open", "-T4", "-p", "1-10000", host]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
        return {"output": r.stdout, "error": r.stderr[:500] if r.stderr else ""}
    except FileNotFoundError:
        return {"output": "", "error": "nmap not found — install via: apt-get install nmap"}
    except subprocess.TimeoutExpired:
        return {"output": "", "error": "nmap timed out after 90s"}


@tool
def run_whatweb(url: str) -> dict:
    """Fingerprint web technologies, CMS, frameworks, and server details."""
    cmd = ["whatweb", "--log-json=/dev/stdout", "--quiet", url]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        return {"output": r.stdout[:2000], "error": r.stderr[:500] if r.stderr else ""}
    except FileNotFoundError:
        return {"output": "", "error": "whatweb not found — skipping"}
    except subprocess.TimeoutExpired:
        return {"output": "", "error": "whatweb timed out after 30s"}

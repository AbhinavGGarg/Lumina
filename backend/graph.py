"""
LangGraph-based penetration testing orchestrator.

Architecture:
  - StateGraph with deterministic edges (no LLM-driven routing)
  - Each node runs one or more security tools then asks the LLM to interpret output
  - The LLM is only used for: interpreting tool output, classifying findings, writing the report
  - This works reliably with llama3.1:8b and is trivially swappable to GPT-4o or Claude
"""

import json
import re
from urllib.parse import urlparse

from langchain_core.messages import HumanMessage
from langgraph.graph import END, StateGraph
from pydantic import BaseModel

from backend.llm import get_llm
from backend.models import Finding, Severity
from backend.tools.dependencies import run_npm_audit, run_pip_audit
from backend.tools.injection import run_dalfox, run_sqlmap
from backend.tools.recon import run_httpx, run_nmap, run_whatweb
from backend.tools.secrets import run_detect_secrets, run_trufflehog
from backend.tools.static_analysis import run_bandit, run_semgrep

# ── Prompts ───────────────────────────────────────────────────────────────────

INTERPRET_SYSTEM = """You are a penetration tester analysing security tool output.

Extract security findings from the tool output below.
Return ONLY a JSON array — no markdown, no explanation, no backticks.

Each finding must match this schema:
[
  {
    "severity": "critical|high|medium|low|info",
    "title": "short title",
    "description": "what the vulnerability is",
    "evidence": "relevant snippet from tool output (max 200 chars)",
    "remediation": "how to fix it"
  }
]

If there are no real security findings, return an empty array: []
"""

REPORT_SYSTEM = """You are a senior penetration tester writing a professional vulnerability report.
Write clear, concise Markdown. Be direct. Do not pad with unnecessary text."""

REPORT_PROMPT = """Write a penetration testing report for target: {target}

Findings from automated scans:
{findings}

Format:
# Vulnerability Report — {target}

## Executive Summary
(2-3 sentences summarising the overall security posture)

## Findings

| # | Severity | Title | Tool |
|---|---|---|---|

## Detailed Findings

(For each finding:)
### [N]. Title
**Severity:** critical/high/medium/low/info
**Tool:** tool name

**Description:** ...

**Evidence:**
```
evidence snippet
```

**Remediation:** ...

---

## Risk Score: X/10
(Brief justification)
"""


# ── Graph State ───────────────────────────────────────────────────────────────

class GraphState(BaseModel):
    scan_id:     str = ""
    target:      str = ""
    target_type: str = ""   # "url" or "repo"
    findings:    list[dict] = []
    report:      str = ""


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extract_host(url: str) -> str:
    parsed = urlparse(url)
    return parsed.hostname or url


def _truncate(data: dict | list | str, max_chars: int = 4000) -> str:
    text = json.dumps(data) if not isinstance(data, str) else data
    if len(text) > max_chars:
        return text[:max_chars] + "... [truncated]"
    return text


def _parse_findings(agent: str, tool: str, llm_response: str) -> list[dict]:
    """Extract JSON array from LLM response, tolerating minor formatting issues."""
    text = llm_response.strip()
    # Strip markdown code fences if present
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    text = text.strip()
    try:
        items = json.loads(text)
        if not isinstance(items, list):
            return []
        return [
            {
                "agent": agent,
                "tool": tool,
                "severity": item.get("severity", "info"),
                "title": item.get("title", "Unnamed finding"),
                "description": item.get("description", ""),
                "evidence": item.get("evidence", "")[:300],
                "remediation": item.get("remediation", ""),
            }
            for item in items
            if isinstance(item, dict)
        ]
    except (json.JSONDecodeError, ValueError):
        return []


def _update_store(scan_id: str, agent: str, log_msg: str, new_findings: list[dict]) -> None:
    """Update the global scan store if a scan_id is provided (live progress)."""
    if not scan_id:
        return
    from backend.state_store import scans
    if scan_id not in scans:
        return
    state = scans[scan_id]
    state.current_agent = agent
    state.log.append(log_msg)
    for f in new_findings:
        try:
            state.findings.append(Finding(
                agent=f["agent"],
                tool=f["tool"],
                severity=Severity(f.get("severity", "info")),
                title=f["title"],
                description=f.get("description", ""),
                evidence=f.get("evidence", ""),
                remediation=f.get("remediation", ""),
            ))
        except Exception:
            pass


# ── Graph Nodes ───────────────────────────────────────────────────────────────

def recon_node(state: GraphState) -> dict:
    _update_store(state.scan_id, "recon", "Starting reconnaissance...", [])

    httpx_result = run_httpx.invoke({"url": state.target})
    nmap_result  = run_nmap.invoke({"host": _extract_host(state.target)})
    web_result   = run_whatweb.invoke({"url": state.target})

    combined = {"httpx": httpx_result, "nmap": nmap_result, "whatweb": web_result}

    # Determine target type: URL if httpx got results, else treat as repo
    target_type = "url" if httpx_result.get("results") else "repo"

    llm = get_llm()
    response = llm.invoke([
        HumanMessage(content=INTERPRET_SYSTEM + f"\n\nAgent: recon\nTools: httpx, nmap, whatweb\nOutput:\n{_truncate(combined)}")
    ])
    findings = _parse_findings("recon", "httpx+nmap+whatweb", response.content)

    log = f"Recon complete — target_type={target_type}, findings={len(findings)}"
    _update_store(state.scan_id, "recon", log, findings)

    return {
        "target_type": target_type,
        "findings": state.findings + findings,
    }


def sqli_node(state: GraphState) -> dict:
    _update_store(state.scan_id, "sql_injection", "Running SQL injection tests (sqlmap)...", [])

    result = run_sqlmap.invoke({"url": state.target})

    llm = get_llm()
    response = llm.invoke([
        HumanMessage(content=INTERPRET_SYSTEM + f"\n\nAgent: sql_injection\nTool: sqlmap\nOutput:\n{_truncate(result)}")
    ])
    findings = _parse_findings("sql_injection", "sqlmap", response.content)

    _update_store(state.scan_id, "sql_injection", f"SQLi scan complete — findings={len(findings)}", findings)
    return {"findings": state.findings + findings}


def xss_node(state: GraphState) -> dict:
    _update_store(state.scan_id, "xss", "Running XSS tests (dalfox)...", [])

    result = run_dalfox.invoke({"url": state.target})

    llm = get_llm()
    response = llm.invoke([
        HumanMessage(content=INTERPRET_SYSTEM + f"\n\nAgent: xss\nTool: dalfox\nOutput:\n{_truncate(result)}")
    ])
    findings = _parse_findings("xss", "dalfox", response.content)

    _update_store(state.scan_id, "xss", f"XSS scan complete — findings={len(findings)}", findings)
    return {"findings": state.findings + findings}


def static_node(state: GraphState) -> dict:
    _update_store(state.scan_id, "static_analysis", "Running static analysis (semgrep + bandit)...", [])

    semgrep_result = run_semgrep.invoke({"repo_path": state.target})
    bandit_result  = run_bandit.invoke({"repo_path": state.target})
    combined = {"semgrep": semgrep_result, "bandit": bandit_result}

    llm = get_llm()
    response = llm.invoke([
        HumanMessage(content=INTERPRET_SYSTEM + f"\n\nAgent: static_analysis\nTools: semgrep, bandit\nOutput:\n{_truncate(combined)}")
    ])
    findings = _parse_findings("static_analysis", "semgrep+bandit", response.content)

    _update_store(state.scan_id, "static_analysis", f"Static analysis complete — findings={len(findings)}", findings)
    return {"findings": state.findings + findings}


def deps_node(state: GraphState) -> dict:
    _update_store(state.scan_id, "dependencies", "Scanning dependencies for CVEs...", [])

    # For URL targets, try /repos mount if available; for repo targets use path directly
    repo_path = state.target if state.target_type == "repo" else "/repos"

    pip_result = run_pip_audit.invoke({"repo_path": repo_path})
    npm_result = run_npm_audit.invoke({"repo_path": repo_path})
    combined = {"pip_audit": pip_result, "npm_audit": npm_result}

    llm = get_llm()
    response = llm.invoke([
        HumanMessage(content=INTERPRET_SYSTEM + f"\n\nAgent: dependencies\nTools: pip-audit, npm-audit\nOutput:\n{_truncate(combined)}")
    ])
    findings = _parse_findings("dependencies", "pip-audit+npm-audit", response.content)

    _update_store(state.scan_id, "dependencies", f"Dependency scan complete — findings={len(findings)}", findings)
    return {"findings": state.findings + findings}


def secrets_node(state: GraphState) -> dict:
    _update_store(state.scan_id, "secrets", "Scanning for hardcoded secrets...", [])

    repo_path = state.target if state.target_type == "repo" else "/repos"

    truffle_result  = run_trufflehog.invoke({"repo_path": repo_path})
    detect_result   = run_detect_secrets.invoke({"repo_path": repo_path})
    combined = {"trufflehog": truffle_result, "detect_secrets": detect_result}

    llm = get_llm()
    response = llm.invoke([
        HumanMessage(content=INTERPRET_SYSTEM + f"\n\nAgent: secrets\nTools: trufflehog, detect-secrets\nOutput:\n{_truncate(combined)}")
    ])
    findings = _parse_findings("secrets", "trufflehog+detect-secrets", response.content)

    _update_store(state.scan_id, "secrets", f"Secrets scan complete — findings={len(findings)}", findings)
    return {"findings": state.findings + findings}


def report_node(state: GraphState) -> dict:
    _update_store(state.scan_id, "report", "Generating vulnerability report...", [])

    findings_text = _truncate(state.findings, max_chars=6000)
    prompt = REPORT_PROMPT.format(target=state.target, findings=findings_text)

    llm = get_llm()
    response = llm.invoke([HumanMessage(content=REPORT_SYSTEM + "\n\n" + prompt)])
    report = response.content

    # Write report to store
    if state.scan_id:
        from backend.state_store import scans
        from backend.models import ScanStatus
        if state.scan_id in scans:
            scans[state.scan_id].report = report
            scans[state.scan_id].current_agent = "complete"
            scans[state.scan_id].status = ScanStatus.complete
            scans[state.scan_id].log.append("Report generation complete.")

    return {"report": report}


# ── Routing ───────────────────────────────────────────────────────────────────

def route_after_recon(state: GraphState) -> str:
    return "sqli" if state.target_type == "url" else "static"


# ── Graph Assembly ────────────────────────────────────────────────────────────

def build_graph():
    g = StateGraph(GraphState)

    g.add_node("recon",   recon_node)
    g.add_node("sqli",    sqli_node)
    g.add_node("xss",     xss_node)
    g.add_node("static",  static_node)
    g.add_node("deps",    deps_node)
    g.add_node("secrets", secrets_node)
    g.add_node("report",  report_node)

    g.set_entry_point("recon")

    g.add_conditional_edges("recon", route_after_recon, {
        "sqli":   "sqli",
        "static": "static",
    })

    # URL path
    g.add_edge("sqli",  "xss")
    g.add_edge("xss",   "deps")

    # Repo path
    g.add_edge("static", "deps")

    # Both paths converge here
    g.add_edge("deps",    "secrets")
    g.add_edge("secrets", "report")
    g.add_edge("report",  END)

    return g.compile()


SCAN_GRAPH = build_graph()

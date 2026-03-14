"""LangGraph-based penetration testing orchestrator.

Architecture:
  - StateGraph with a planner node that determines which agents to run
    based on target type and detected language stack.
  - Deterministic conditional edges driven by the plan (no LLM routing).
  - Tool-error guard: when a tool fails to run (FileNotFoundError, etc.)
    the error is logged and the LLM call is skipped entirely -- the tool
    operational error never becomes a "finding".
  - LLM calls use ScanStreamCallback so tokens stream to the frontend
    via the SSE endpoint in real time.
"""

import json
import logging
import re
from urllib.parse import urlparse

from langchain_core.messages import HumanMessage
from langgraph.graph import END, StateGraph
from pydantic import BaseModel

from ..core.data_models import Finding, ScanStatus, Severity
from ..core.prompts import INTERPRET_SYSTEM, REPORT_PROMPT, REPORT_SYSTEM
from ..tools.dependencies import run_npm_audit, run_pip_audit
from ..tools.injection import run_dalfox, run_sqlmap
from ..tools.recon import run_httpx, run_nmap, run_whatweb
from ..tools.secrets import run_detect_secrets, run_trufflehog
from ..tools.static_analysis import run_bandit, run_semgrep
from ..tools.static_c import run_cppcheck, run_semgrep_c
from .callbacks import ScanStreamCallback
from .llm_service import get_llm
from .planner_service import plan


# ── Graph State ───────────────────────────────────────────────────────────────

class GraphState(BaseModel):
    """Mutable state threaded through every LangGraph node."""

    scan_id:     str = ""
    target:      str = ""
    target_type: str = ""
    languages:   list[str] = []
    agents_plan: list[str] = []
    findings:    list[dict] = []
    report:      str = ""


# ── Private helpers ───────────────────────────────────────────────────────────

def _extract_host(url: str) -> str:
    parsed = urlparse(url)
    return parsed.hostname or url


def _truncate(data: dict | list | str, max_chars: int = 4000) -> str:
    text = json.dumps(data) if not isinstance(data, str) else data
    if len(text) > max_chars:
        return text[:max_chars] + "... [truncated]"
    return text


def _has_real_output(result: dict) -> bool:
    """Return True when a tool produced substantive output.

    A result where only ``error`` is non-empty (and all data fields are
    empty/zero) means the tool failed to run -- we skip the LLM call.

    Args:
        result: Tool return dict.

    Returns:
        True if there is output worth sending to the LLM.
    """
    error = result.get("error", "")
    # Check every possible data-holding key.
    has_results  = bool(result.get("results"))
    has_output   = bool(result.get("output", "").strip())
    has_findings = bool(result.get("findings"))
    has_vulns    = bool(result.get("vulnerabilities"))
    has_total    = result.get("total", 0) > 0
    has_data = has_results or has_output or has_findings or has_vulns or has_total
    return has_data or not error


def _parse_findings(agent: str, tool: str, llm_response: str) -> list[dict]:
    """Extract JSON array from LLM response, tolerating minor formatting issues.

    Args:
        agent: Agent name (eg: "static_c").
        tool: Tool name string (eg: "cppcheck+semgrep/c").
        llm_response: Raw LLM output string.

    Returns:
        List of finding dicts with agent/tool fields injected.
    """
    text = llm_response.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    text = text.strip()
    try:
        items = json.loads(text)
        if not isinstance(items, list):
            return []
        return [
            {
                "agent":       agent,
                "tool":        tool,
                "severity":    item.get("severity", "info"),
                "title":       item.get("title", "Unnamed finding"),
                "description": item.get("description", ""),
                "evidence":    item.get("evidence", "")[:300],
                "remediation": item.get("remediation", ""),
            }
            for item in items
            if isinstance(item, dict)
        ]
    except (json.JSONDecodeError, ValueError):
        return []


def _update_store(
    scan_id: str,
    agent: str,
    log_msg: str,
    new_findings: list[dict],
) -> None:
    """Update the global scan store for live SSE progress.

    Args:
        scan_id: Scan identifier (no-op when empty).
        agent: Current agent name.
        log_msg: Human-readable log entry.
        new_findings: Parsed findings to append.
    """
    if not scan_id:
        return
    from ..db.scans import scans  # avoid circular at module level
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
        except Exception:  # pylint: disable=broad-except
            pass


def _llm_interpret(
    scan_id: str,
    agent: str,
    tool_label: str,
    combined: dict | str,
) -> list[dict]:
    """Call the LLM to interpret tool output and return parsed findings.

    Args:
        scan_id: Scan identifier (used to attach streaming callback).
        agent: Agent name for labelling findings.
        tool_label: Human-readable tool name (eg: "cppcheck+semgrep/c").
        combined: Tool output to interpret.

    Returns:
        List of finding dicts.
    """
    callback = ScanStreamCallback(scan_id=scan_id, agent=agent)
    llm = get_llm().with_config({"callbacks": [callback]})
    prompt = (
        INTERPRET_SYSTEM
        + f"\n\nAgent: {agent}\nTools: {tool_label}\nOutput:\n"
        + _truncate(combined)
    )
    response = llm.invoke([HumanMessage(content=prompt)])
    return _parse_findings(agent, tool_label, response.content)


# ── Graph Nodes ───────────────────────────────────────────────────────────────

def planner_node(state: GraphState) -> dict:
    """Inspect the target and produce a tailored scan plan.

    No LLM call -- pure filesystem and URL heuristics.
    """
    _update_store(state.scan_id, "planner", "Analysing target...", [])

    scan_plan = plan(state.target)

    logging.info(
        "Scan plan for %s: %s",
        state.target,
        scan_plan,
    )

    if state.scan_id:
        from ..db.scans import scans
        if state.scan_id in scans:
            store = scans[state.scan_id]
            store.target_type = scan_plan.target_type
            store.languages   = scan_plan.languages
            store.agents_plan = scan_plan.agents
            store.log.append(
                f"Plan: target_type={scan_plan.target_type}, "
                f"languages={scan_plan.languages}, "
                f"agents={scan_plan.agents}"
            )

    return {
        "target_type": scan_plan.target_type,
        "languages":   scan_plan.languages,
        "agents_plan": scan_plan.agents,
    }


def recon_node(state: GraphState) -> dict:
    """HTTP probing, port scanning, and web tech fingerprinting."""
    _update_store(state.scan_id, "recon", "Starting reconnaissance...", [])

    httpx_result = run_httpx.invoke({"url": state.target})
    nmap_result  = run_nmap.invoke({"host": _extract_host(state.target)})
    web_result   = run_whatweb.invoke({"url": state.target})
    combined     = {"httpx": httpx_result, "nmap": nmap_result, "whatweb": web_result}

    # Skip LLM if all tools failed to run.
    any_output = (
        _has_real_output(httpx_result)
        or _has_real_output(nmap_result)
        or _has_real_output(web_result)
    )
    if not any_output:
        errors = ", ".join(
            e for r in (httpx_result, nmap_result, web_result)
            if (e := r.get("error", ""))
        )
        _update_store(
            state.scan_id, "recon",
            f"[SKIP] Recon tools unavailable: {errors}",
            [],
        )
        return {"findings": state.findings}

    findings = _llm_interpret(state.scan_id, "recon", "httpx+nmap+whatweb", combined)
    _update_store(
        state.scan_id, "recon",
        f"Recon complete -- findings={len(findings)}",
        findings,
    )
    return {"findings": state.findings + findings}


def sqli_node(state: GraphState) -> dict:
    """SQL injection testing with sqlmap."""
    _update_store(state.scan_id, "sql_injection", "Running SQL injection tests (sqlmap)...", [])

    result = run_sqlmap.invoke({"url": state.target})
    if not _has_real_output(result):
        _update_store(
            state.scan_id, "sql_injection",
            f"[SKIP] sqlmap unavailable: {result.get('error', '')}",
            [],
            )
        return {"findings": state.findings}

    findings = _llm_interpret(state.scan_id, "sql_injection", "sqlmap", result)
    _update_store(
        state.scan_id, "sql_injection",
        f"SQLi scan complete -- findings={len(findings)}",
        findings,
    )
    return {"findings": state.findings + findings}


def xss_node(state: GraphState) -> dict:
    """XSS testing with dalfox."""
    _update_store(state.scan_id, "xss", "Running XSS tests (dalfox)...", [])

    result = run_dalfox.invoke({"url": state.target})
    if not _has_real_output(result):
        _update_store(
            state.scan_id, "xss",
            f"[SKIP] dalfox unavailable: {result.get('error', '')}",
            [],
        )
        return {"findings": state.findings}

    findings = _llm_interpret(state.scan_id, "xss", "dalfox", result)
    _update_store(
        state.scan_id, "xss",
        f"XSS scan complete -- findings={len(findings)}",
        findings,
    )
    return {"findings": state.findings + findings}


def static_c_node(state: GraphState) -> dict:
    """Static analysis for C/C++ repositories (cppcheck + semgrep p/c)."""
    _update_store(
        state.scan_id, "static_c",
        "Running C/C++ static analysis (cppcheck + semgrep p/c)...",
        [],
    )

    cppcheck_result  = run_cppcheck.invoke({"repo_path": state.target})
    semgrep_c_result = run_semgrep_c.invoke({"repo_path": state.target})
    combined = {"cppcheck": cppcheck_result, "semgrep_c": semgrep_c_result}

    any_output = (
        _has_real_output(cppcheck_result)
        or _has_real_output(semgrep_c_result)
    )
    if not any_output:
        errors = ", ".join(
            e for r in (cppcheck_result, semgrep_c_result)
            if (e := r.get("error", ""))
        )
        _update_store(
            state.scan_id, "static_c",
            f"[SKIP] C analysis tools unavailable: {errors}",
            [],
        )
        return {"findings": state.findings}

    findings = _llm_interpret(
        state.scan_id, "static_c", "cppcheck+semgrep/c", combined,
    )
    _update_store(
        state.scan_id, "static_c",
        f"C static analysis complete -- findings={len(findings)}",
        findings,
    )
    return {"findings": state.findings + findings}


def static_node(state: GraphState) -> dict:
    """Static analysis for Python/JS repos (semgrep auto + bandit)."""
    _update_store(
        state.scan_id, "static_analysis",
        "Running static analysis (semgrep + bandit)...",
        [],
    )

    semgrep_result = run_semgrep.invoke({"repo_path": state.target})
    bandit_result  = run_bandit.invoke({"repo_path": state.target})
    combined = {"semgrep": semgrep_result, "bandit": bandit_result}

    any_output = (
        _has_real_output(semgrep_result)
        or _has_real_output(bandit_result)
    )
    if not any_output:
        errors = ", ".join(
            e for r in (semgrep_result, bandit_result)
            if (e := r.get("error", ""))
        )
        _update_store(
            state.scan_id, "static_analysis",
            f"[SKIP] Static analysis tools unavailable: {errors}",
            [],
        )
        return {"findings": state.findings}

    findings = _llm_interpret(
        state.scan_id, "static_analysis", "semgrep+bandit", combined,
    )
    _update_store(
        state.scan_id, "static_analysis",
        f"Static analysis complete -- findings={len(findings)}",
        findings,
    )
    return {"findings": state.findings + findings}


def deps_py_node(state: GraphState) -> dict:
    """Python dependency CVE audit (pip-audit)."""
    _update_store(
        state.scan_id, "deps_py",
        "Scanning Python dependencies for CVEs (pip-audit)...",
        [],
    )

    result = run_pip_audit.invoke({"repo_path": state.target})
    if not _has_real_output(result):
        _update_store(
            state.scan_id, "deps_py",
            f"[SKIP] pip-audit unavailable: {result.get('error', '')}",
            [],
        )
        return {"findings": state.findings}

    findings = _llm_interpret(state.scan_id, "deps_py", "pip-audit", result)
    _update_store(
        state.scan_id, "deps_py",
        f"Python dependency scan complete -- findings={len(findings)}",
        findings,
    )
    return {"findings": state.findings + findings}


def deps_js_node(state: GraphState) -> dict:
    """Node.js dependency CVE audit (npm audit)."""
    _update_store(
        state.scan_id, "deps_js",
        "Scanning JS dependencies for CVEs (npm audit)...",
        [],
    )

    result = run_npm_audit.invoke({"repo_path": state.target})
    if not _has_real_output(result):
        _update_store(
            state.scan_id, "deps_js",
            f"[SKIP] npm unavailable: {result.get('error', '')}",
            [],
        )
        return {"findings": state.findings}

    findings = _llm_interpret(state.scan_id, "deps_js", "npm-audit", result)
    _update_store(
        state.scan_id, "deps_js",
        f"JS dependency scan complete -- findings={len(findings)}",
        findings,
    )
    return {"findings": state.findings + findings}


def deps_node(state: GraphState) -> dict:
    """Dependency scan for URL targets (checks /repos mount for manifests)."""
    _update_store(
        state.scan_id, "dependencies",
        "Scanning dependencies for CVEs...",
        [],
    )

    repo_path = "/repos"
    pip_result = run_pip_audit.invoke({"repo_path": repo_path})
    npm_result = run_npm_audit.invoke({"repo_path": repo_path})
    combined   = {"pip_audit": pip_result, "npm_audit": npm_result}

    any_output = _has_real_output(pip_result) or _has_real_output(npm_result)
    if not any_output:
        _update_store(
            state.scan_id, "dependencies",
            "[SKIP] No dependency manifests found at /repos",
            [],
        )
        return {"findings": state.findings}

    findings = _llm_interpret(
        state.scan_id, "dependencies", "pip-audit+npm-audit", combined,
    )
    _update_store(
        state.scan_id, "dependencies",
        f"Dependency scan complete -- findings={len(findings)}",
        findings,
    )
    return {"findings": state.findings + findings}


def secrets_node(state: GraphState) -> dict:
    """Hardcoded secrets scanning (trufflehog + detect-secrets)."""
    _update_store(state.scan_id, "secrets", "Scanning for hardcoded secrets...", [])

    repo_path = state.target if state.target_type == "repo" else "/repos"

    truffle_result = run_trufflehog.invoke({"repo_path": repo_path})
    detect_result  = run_detect_secrets.invoke({"repo_path": repo_path})
    combined = {"trufflehog": truffle_result, "detect_secrets": detect_result}

    any_output = (
        _has_real_output(truffle_result)
        or _has_real_output(detect_result)
    )
    if not any_output:
        errors = ", ".join(
            e for r in (truffle_result, detect_result)
            if (e := r.get("error", ""))
        )
        _update_store(
            state.scan_id, "secrets",
            f"[SKIP] Secrets tools unavailable: {errors}",
            [],
        )
        return {"findings": state.findings}

    findings = _llm_interpret(
        state.scan_id, "secrets", "trufflehog+detect-secrets", combined,
    )
    _update_store(
        state.scan_id, "secrets",
        f"Secrets scan complete -- findings={len(findings)}",
        findings,
    )
    return {"findings": state.findings + findings}


def report_node(state: GraphState) -> dict:
    """Synthesise all findings into a final Markdown report."""
    _update_store(state.scan_id, "report", "Generating vulnerability report...", [])

    findings_text = _truncate(state.findings, max_chars=6000)
    languages_str = ", ".join(state.languages) if state.languages else "N/A"
    prompt = REPORT_PROMPT.format(
        target=state.target,
        languages=languages_str,
        findings=findings_text,
    )

    callback = ScanStreamCallback(scan_id=state.scan_id, agent="report")
    llm = get_llm().with_config({"callbacks": [callback]})
    response = llm.invoke([HumanMessage(content=REPORT_SYSTEM + "\n\n" + prompt)])
    report = response.content

    if state.scan_id:
        from ..db.scans import scans
        if state.scan_id in scans:
            scans[state.scan_id].report        = report
            scans[state.scan_id].current_agent = "complete"
            scans[state.scan_id].status        = ScanStatus.complete
            scans[state.scan_id].log.append("Report generation complete.")

    return {"report": report}


# ── Routing ───────────────────────────────────────────────────────────────────

# All node keys registered in the graph.
_ALL_NODES = {
    "recon", "sqli", "xss", "static_c", "static",
    "deps_py", "deps_js", "deps", "secrets", "report",
}


def _next_in_plan(current: str, state: GraphState) -> str:  # pylint: disable=unused-argument
    """Return the next node key after *current* in agents_plan.

    Falls back to "report" when the plan is exhausted or the current node
    is not found.

    Args:
        current: Key of the node that just finished.
        state: Current graph state.

    Returns:
        Next node key string.
    """
    plan = state.agents_plan
    try:
        idx = plan.index(current)
        nxt = plan[idx + 1]
        return nxt if nxt in _ALL_NODES else "report"
    except (ValueError, IndexError):
        return "report"


def _make_router(node_key: str):
    """Create a routing function for *node_key* that advances the plan.

    For "planner" specifically, returns plan[0] (the first scheduled agent).
    For all other nodes, returns the element immediately after node_key in plan.

    Args:
        node_key: The node whose successor this router computes.

    Returns:
        A callable suitable for add_conditional_edges.
    """
    def _router(state: GraphState) -> str:  # pylint: disable=unused-argument
        if node_key == "planner":
            # Planner is not in agents_plan -- just return the first item.
            plan = state.agents_plan
            if not plan:
                return "report"
            first = plan[0]
            return first if first in _ALL_NODES else "report"
        return _next_in_plan(node_key, state)
    _router.__name__ = f"_route_after_{node_key}"
    return _router


# ── Graph Assembly ────────────────────────────────────────────────────────────

def _build_graph() -> object:
    """Compile the LangGraph state machine.

    All inter-node routing is driven by agents_plan so the planner fully
    controls execution order without requiring a separate edge per path.
    """
    g = StateGraph(GraphState)

    g.add_node("planner",   planner_node)
    g.add_node("recon",     recon_node)
    g.add_node("sqli",      sqli_node)
    g.add_node("xss",       xss_node)
    g.add_node("static_c",  static_c_node)
    g.add_node("static",    static_node)
    g.add_node("deps_py",   deps_py_node)
    g.add_node("deps_js",   deps_js_node)
    g.add_node("deps",      deps_node)
    g.add_node("secrets",   secrets_node)
    g.add_node("report",    report_node)

    g.set_entry_point("planner")

    # Planner -> first node in plan.
    g.add_conditional_edges(
        "planner",
        _make_router("planner"),
        {n: n for n in _ALL_NODES},
    )

    # Every non-terminal node routes to whatever comes next in the plan.
    # This single pattern handles all language-specific orderings.
    for node_key in _ALL_NODES - {"report"}:
        g.add_conditional_edges(
            node_key,
            _make_router(node_key),
            {n: n for n in _ALL_NODES},
        )

    g.add_edge("report", END)

    return g.compile()


SCAN_GRAPH = _build_graph()

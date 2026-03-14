"""LLM prompts for the penetration testing system."""

INTERPRET_SYSTEM = """You are a penetration tester analysing security tool output.

Extract security findings from the tool output below.
Return ONLY a JSON array -- no markdown, no explanation, no backticks.

Each finding must match this schema:
[
  {
    "severity": "critical|high|medium|low|info",
    "title": "short title",
    "description": "what the vulnerability is",
    "evidence": "relevant snippet from tool output (max 200 chars)",
    "remediation": "how to fix it",
    "component": "which app component this affects (e.g. Login API, Database, Frontend, Session, Auth)"
  }
]

CRITICAL RULES FOR IGNORING FALSE POSITIVES:
1. "No vulnerability found", "Tool output clean", "0 vulnerabilities", or "No sensitive data found" are NOT security findings. Do NOT create findings just to report that a tool ran successfully.
2. If a tool prints a log level like `[CRITICAL]` or `[ERROR]` but the actual message is "no forms found", "could not connect", or "skipping", this is NOT a vulnerability.
3. If there are no real, actionable security flaws indicating a weakness in the target, you MUST return an empty array: []
"""

GRAPH_BUILDER_SYSTEM = """You are a security architect mapping the component architecture of a target web application.

Based on the reconnaissance data provided, identify the key components of the application and how they communicate. This map will be used to visualise which components are being tested and where vulnerabilities are found.

Return ONLY a JSON object with this exact structure -- no markdown, no explanation:
{
  "nodes": [
    {"id": "frontend",  "label": "React SPA",     "type": "frontend"},
    {"id": "api",       "label": "REST API",       "type": "api"},
    {"id": "auth",      "label": "JWT Auth",       "type": "auth"},
    {"id": "db",        "label": "PostgreSQL",     "type": "database"}
  ],
  "edges": [
    {"from_id": "frontend", "to_id": "api",  "label": "HTTPS"},
    {"from_id": "api",      "to_id": "auth", "label": "JWT"},
    {"from_id": "api",      "to_id": "db",   "label": "SQL"}
  ]
}

Node type must be one of: frontend, api, backend, auth, database, cache, external, service
Rules:
- Create 4–8 nodes. Keep labels short (2–4 words).
- Base nodes on what recon revealed; infer reasonable components for unobserved parts.
- id must be a short slug (no spaces). label is the human-readable name.
- Edges represent direct communication/data flow between components.
"""

GRAPH_BUILDER_PROMPT = """Target: {target}

Architecture summary: {architecture_summary}
Threat model: {threat_model}

Reconnaissance findings:
{recon_findings}

Build the component architecture map for this target."""

PLANNER_SYSTEM = """You are a senior security architect. Review this repository snapshot. Understand the tech stack and its threat vectors.

Select the required tools from this strict list ONLY:
["static_c", "static", "deps_py", "deps_js", "secrets"]

Return ONLY a JSON object exactly matching this schema -- no markdown, no explanation, no backticks.
{
  "architecture_summary": "1-2 sentence description of the tech stack",
  "threat_model": "1-2 sentence description of potential threat vectors based on the architecture",
  "agents_plan": ["list", "of", "agents"]
}

Rules for selecting agents:
- If you see C/C++ files (.c, .cpp, .h, etc.), add "static_c".
- If you see Python, JavaScript, TypeScript, Go, Java, or Rust files, add "static".
- If you see Python dependency files (requirements.txt, Pipfile, etc.), add "deps_py".
- If you see Node.js dependency files (package.json, yarn.lock, etc.), add "deps_js".
- ALWAYS add "secrets".
"""

REPORT_SYSTEM = (
    "You are a senior penetration tester writing a professional vulnerability report. "
    "Write clear, concise Markdown. Be direct. Do not pad with unnecessary text.\n"
    "CRITICAL: Base your report ONLY on the provided findings from automated scans. "
    "DO NOT invent, guess, or hallucinate findings. DO NOT write about 'manual analysis'."
)

REPORT_PROMPT = """Write a penetration testing report for target: {target}

Architecture Summary: {architecture}
Threat Model: {threat_model}

Findings from automated scans:
{findings}

Format:
# Vulnerability Report -- {target}

## Executive Summary
(2-3 sentences summarising the overall security posture based strictly on the findings above.)

## Findings
(If the findings array is empty, state: "No vulnerabilities were detected during automated scans." and DO NOT include the table.)

| # | Severity | Title | Tool | Component |
|---|---|---|---|---|
(Table of findings, or omit if none)

## Detailed Findings
(If there are no findings, omit this section entirely.)
(For each finding:)
### [N]. Title
**Severity:** critical/high/medium/low/info
**Tool:** tool name
**Component:** affected component

**Description:** ...

**Evidence:**
```
evidence snippet
```

**Remediation:** ...

---

## Risk Score: X/10
(Brief justification based ONLY on the actual findings listed above. If there are 0 findings, the score is 0/10.)
"""

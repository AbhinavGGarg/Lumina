import { ScanState } from "@/types/scan";

// All possible agent nodes with display metadata.
const AGENT_META: Record<string, { label: string; icon: string; tools: string }> = {
  planner:          { label: "Planner",           icon: "🧠", tools: "language detection" },
  recon:            { label: "Recon",             icon: "🌐", tools: "httpx · nmap · whatweb" },
  attack_chain:     { label: "Attack Chain",       icon: "⛓️",  tools: "LLM reasoning" },
  sqli:             { label: "SQL Injection",      icon: "💉", tools: "sqlmap" },
  sql_injection:    { label: "SQL Injection",      icon: "💉", tools: "sqlmap" },
  xss:              { label: "XSS",               icon: "🎯", tools: "dalfox" },
  static_c:         { label: "C/C++ Analysis",    icon: "🔬", tools: "cppcheck · semgrep p/c" },
  static:           { label: "Static Analysis",   icon: "🔬", tools: "semgrep · bandit" },
  static_analysis:  { label: "Static Analysis",   icon: "🔬", tools: "semgrep · bandit" },
  deps_py:          { label: "Python Deps",       icon: "📦", tools: "pip-audit" },
  deps_js:          { label: "JS Deps",           icon: "📦", tools: "npm audit" },
  deps:             { label: "Dependencies",      icon: "📦", tools: "pip-audit · npm audit" },
  dependencies:     { label: "Dependencies",      icon: "📦", tools: "pip-audit · npm audit" },
  secrets:          { label: "Secrets",           icon: "🔐", tools: "trufflehog · detect-secrets" },
  report:           { label: "Report",            icon: "📄", tools: "LLM synthesis" },
};

interface Props {
  scan: ScanState;
}

function normalizeAgentKey(agentKey: string): string {
  const aliases: Record<string, string> = {
    sql_injection: "sqli",
    static_analysis: "static",
    dependencies: "deps",
    complete: "report",
  };

  return aliases[agentKey] ?? agentKey;
}

function agentStatus(
  agentKey: string,
  scan: ScanState,
): "done" | "running" | "queued" | "skipped" {
  const normalizedAgent = normalizeAgentKey(agentKey);

  // Planner is a synthetic first step and not part of agents_plan.
  // Mark it done as soon as planning output is available.
  if (normalizedAgent === "planner") {
    if (scan.current_agent === "planner") return "running";

    const planningComplete =
      Boolean(scan.architecture_summary?.trim()) ||
      scan.agents_plan.length > 0;

    if (planningComplete) return "done";
    return "queued";
  }

  // Normalise "complete" marker used by backend when fully done.
  const current = normalizeAgentKey(scan.current_agent);

  if (scan.status === "complete") return "done";
  if (current === normalizedAgent) return "running";

  // Determine ordering from the live plan, falling back to render order.
  const planOrder =
    scan.agents_plan.length > 0
      ? scan.agents_plan.map(normalizeAgentKey)
      : [];
  const currentIdx = planOrder.indexOf(current);
  const agentIdx   = planOrder.indexOf(normalizedAgent);

  if (agentIdx !== -1 && currentIdx !== -1 && agentIdx < currentIdx) return "done";
  return "queued";
}

export function ScanProgress({ scan }: Props) {
  // Build the ordered list from agents_plan when available, otherwise fall back to all agents.
  const planKeys =
    scan.agents_plan.length > 0
      ? ["planner", ...scan.agents_plan]
      : Object.keys(AGENT_META);

  const visibleAgents = planKeys
    .filter((key) => AGENT_META[key])
    .map((key) => ({ key, ...AGENT_META[key] }));

  return (
    <div className="flex flex-col gap-1 w-full">
      {visibleAgents.map((agent) => {
        const status = agentStatus(agent.key, scan);
        return (
          <div
            key={agent.key}
            className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-muted/40 border border-border/50"
          >
            <div className="flex items-center gap-3">
              <span className="text-base w-6 text-center">{agent.icon}</span>
              <div>
                <p className="text-sm font-medium leading-tight">{agent.label}</p>
                <p className="text-xs text-muted-foreground">{agent.tools}</p>
              </div>
            </div>
            <StatusBadge status={status} />
          </div>
        );
      })}
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: "done" | "running" | "queued" | "skipped";
}) {
  switch (status) {
    case "done":
      return <span className="text-sm text-green-600 font-medium">✓ Done</span>;
    case "running":
      return (
        <span className="text-sm text-blue-500 font-medium flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
          Running
        </span>
      );
    case "skipped":
      return <span className="text-xs text-muted-foreground">— skipped</span>;
    default:
      return <span className="text-sm text-muted-foreground">○ Queued</span>;
  }
}

import { ScanState } from "@/types/scan";

const AGENTS = [
  { key: "recon",           label: "Recon",              icon: "🌐", tools: "httpx · nmap · whatweb" },
  { key: "sql_injection",   label: "SQL Injection",       icon: "💉", tools: "sqlmap" },
  { key: "xss",             label: "XSS",                 icon: "🎯", tools: "dalfox" },
  { key: "static_analysis", label: "Static Analysis",     icon: "🔬", tools: "semgrep · bandit" },
  { key: "dependencies",    label: "Dependencies",        icon: "📦", tools: "pip-audit · npm audit" },
  { key: "secrets",         label: "Secrets",             icon: "🔐", tools: "trufflehog · detect-secrets" },
  { key: "report",          label: "Report",              icon: "📄", tools: "LLM synthesis" },
];

interface Props {
  scan: ScanState;
}

function agentStatus(agentKey: string, scan: ScanState): "done" | "running" | "queued" | "skipped" {
  const order = AGENTS.map(a => a.key);
  const currentIdx = order.indexOf(scan.current_agent === "complete" ? "report" : scan.current_agent);
  const agentIdx = order.indexOf(agentKey);

  if (scan.status === "complete") return "done";
  if (scan.current_agent === agentKey) return "running";
  if (agentIdx < currentIdx) return "done";
  return "queued";
}

export function ScanProgress({ scan }: Props) {
  // Only show URL agents if URL target, only show static if repo
  const visibleAgents = AGENTS.filter(a => {
    if (scan.target_type === "url" && a.key === "static_analysis") return false;
    if (scan.target_type === "repo" && (a.key === "sql_injection" || a.key === "xss")) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-1 w-full">
      {visibleAgents.map(agent => {
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

function StatusBadge({ status }: { status: "done" | "running" | "queued" | "skipped" }) {
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

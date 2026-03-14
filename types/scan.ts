export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type ScanStatus = "pending" | "running" | "complete" | "failed";

export interface Finding {
  agent: string;
  tool: string;
  severity: Severity;
  title: string;
  description: string;
  evidence: string;
  remediation: string;
}

export interface ScanState {
  scan_id: string;
  target: string;
  target_type: string;
  architecture_summary: string;
  threat_model: string;
  status: ScanStatus;
  current_agent: string;
  agents_plan: string[];
  findings: Finding[];
  log: string[];
  llm_log: string[];
  report: string;
}

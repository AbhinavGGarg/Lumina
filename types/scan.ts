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
  component: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: string; // frontend | api | backend | auth | database | cache | external | service
}

export interface GraphEdge {
  from_id: string;
  to_id: string;
  label: string;
}

export interface AppGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
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
  app_graph: AppGraph;
  findings: Finding[];
  log: string[];
  llm_log: string[];
  report: string;
}

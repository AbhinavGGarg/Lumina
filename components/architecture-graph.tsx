"use client";

import { AppGraph, GraphNode, ScanState } from "@/types/scan";

// ── Layout constants ─────────────────────────────────────────────────────────

const NODE_W   = 124;
const NODE_H   = 38;
const NODE_R   = 7;
const COL_W    = 174;
const ROW_H    = 72;
const PAD_X    = 72;
const PAD_Y    = 44;

// ── Type → column layer mapping ──────────────────────────────────────────────

const TYPE_LAYER: Record<string, number> = {
  frontend: 0, ui: 0, client: 0,
  api: 1, backend: 1, server: 1, rest: 1,
  auth: 2, session: 2, oauth: 2,
  service: 1,
  database: 3, db: 3, cache: 3, storage: 3,
  external: 4,
};

function getLayer(type: string): number {
  return TYPE_LAYER[type.toLowerCase()] ?? 1;
}

function computeLayout(
  nodes: GraphNode[],
): Record<string, { x: number; y: number }> {
  const layers: Record<number, GraphNode[]> = {};
  for (const n of nodes) {
    const l = getLayer(n.type);
    (layers[l] ??= []).push(n);
  }

  const layerNums  = Object.keys(layers).map(Number).sort((a, b) => a - b);
  const maxInLayer = Math.max(...layerNums.map((l) => layers[l].length));
  const pos: Record<string, { x: number; y: number }> = {};

  for (let li = 0; li < layerNums.length; li++) {
    const ln    = layerNums[li];
    const group = layers[ln];
    // Vertically centre shorter columns.
    const topPad = ((maxInLayer - group.length) * ROW_H) / 2;
    for (let ni = 0; ni < group.length; ni++) {
      pos[group[ni].id] = {
        x: PAD_X + li * COL_W,
        y: PAD_Y + topPad + ni * ROW_H,
      };
    }
  }
  return pos;
}

// ── Agent → component types being actively tested ────────────────────────────

const AGENT_TYPES: Record<string, string[]> = {
  recon:            ["frontend", "api", "service", "backend"],
  graph_builder:    ["frontend", "api", "auth", "database", "service"],
  sqli:             ["database", "db", "api", "backend"],
  sql_injection:    ["database", "db", "api", "backend"],
  xss:              ["frontend", "ui", "client"],
  deps:             ["api", "service", "backend", "server"],
  dependencies:     ["api", "service", "backend", "server"],
  secrets:          ["api", "service", "backend", "auth"],
  static_analysis:  ["api", "service", "backend"],
  static:           ["api", "service", "backend"],
  static_c:         ["service", "backend"],
};

// ── Node status ───────────────────────────────────────────────────────────────

type NodeStatus = "default" | "testing" | "vulnerable" | "clean";

function getNodeStatus(node: GraphNode, scan: ScanState): NodeStatus {
  const type  = node.type.toLowerCase();
  const label = node.label.toLowerCase();

  const hasVuln = scan.findings.some((f) => {
    const comp = (f.component ?? "").toLowerCase();
    return (
      comp.length > 0 &&
      (comp.includes(label) || label.includes(comp) ||
       comp.includes(type)  || type.includes(comp))
    );
  });
  if (hasVuln) return "vulnerable";

  const agent = scan.current_agent;
  if (agent && agent !== "complete") {
    const tested = AGENT_TYPES[agent] ?? [];
    if (tested.includes(type)) return "testing";
  }

  if (scan.status === "complete") return "clean";
  return "default";
}

// ── Colour palette ────────────────────────────────────────────────────────────

const PALETTE: Record<NodeStatus, { bg: string; border: string; text: string; dot: string }> = {
  default:    { bg: "#111827", border: "#374151", text: "#9ca3af", dot: "#4b5563" },
  testing:    { bg: "#0c1a2e", border: "#3b82f6", text: "#93c5fd", dot: "#3b82f6" },
  vulnerable: { bg: "#1f0a0a", border: "#ef4444", text: "#fca5a5", dot: "#ef4444" },
  clean:      { bg: "#071a0a", border: "#22c55e", text: "#86efac", dot: "#22c55e" },
};

// ── Legend ────────────────────────────────────────────────────────────────────

const LEGEND = [
  { status: "testing"    as NodeStatus, label: "Active scan"  },
  { status: "vulnerable" as NodeStatus, label: "Vulnerable"   },
  { status: "clean"      as NodeStatus, label: "Clean"        },
  { status: "default"    as NodeStatus, label: "Pending"      },
];

// ── Component ────────────────────────────────────────────────────────────────

export function ArchitectureGraph({ scan }: { scan: ScanState }) {
  const graph: AppGraph = scan.app_graph ?? { nodes: [], edges: [] };

  if (!graph.nodes.length) {
    return (
      <div className="flex items-center justify-center h-32 text-white/20 text-xs font-mono">
        {scan.status === "running"
          ? "Building architecture map…"
          : "No architecture data"}
      </div>
    );
  }

  const pos      = computeLayout(graph.nodes);
  const layerNums = [...new Set(graph.nodes.map((n) => getLayer(n.type)))].sort((a,b)=>a-b);
  const maxNodes  = Math.max(...layerNums.map((l) =>
    graph.nodes.filter((n) => getLayer(n.type) === l).length,
  ));

  const svgW = PAD_X * 2 + layerNums.length * COL_W;
  const svgH = PAD_Y * 2 + maxNodes * ROW_H + 24; // +24 for legend

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        width="100%"
        className="min-w-[360px]"
        style={{ fontFamily: "ui-monospace, monospace" }}
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth="7" markerHeight="7"
            refX="5" refY="3.5"
            orient="auto"
          >
            <path d="M0,0 L0,7 L7,3.5 z" fill="#374151" opacity="0.6" />
          </marker>
        </defs>

        {/* Edges */}
        {graph.edges.map((edge, i) => {
          const p1 = pos[edge.from_id];
          const p2 = pos[edge.to_id];
          if (!p1 || !p2) return null;

          // Exit right side of source, enter left side of target.
          const x1 = p1.x + NODE_W / 2;
          const y1 = p1.y;
          const x2 = p2.x - NODE_W / 2;
          const y2 = p2.y;
          const mx = (x1 + x2) / 2;

          return (
            <g key={i}>
              <path
                d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke="#374151"
                strokeWidth="1.5"
                opacity="0.5"
                markerEnd="url(#arrowhead)"
              />
              {edge.label && (
                <text
                  x={mx}
                  y={(y1 + y2) / 2 - 6}
                  textAnchor="middle"
                  fontSize="8"
                  fill="#6b7280"
                >
                  {edge.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {graph.nodes.map((node) => {
          const p = pos[node.id];
          if (!p) return null;
          const status = getNodeStatus(node, scan);
          const c      = PALETTE[status];
          const nx     = p.x - NODE_W / 2;
          const ny     = p.y - NODE_H / 2;

          return (
            <g key={node.id}>
              {/* Glow halo for active states */}
              {(status === "testing" || status === "vulnerable") && (
                <rect
                  x={nx - 4} y={ny - 4}
                  width={NODE_W + 8} height={NODE_H + 8}
                  rx={NODE_R + 3}
                  fill={c.border}
                  opacity="0.12"
                />
              )}

              {/* Node box */}
              <rect
                x={nx} y={ny}
                width={NODE_W} height={NODE_H}
                rx={NODE_R}
                fill={c.bg}
                stroke={c.border}
                strokeWidth={status === "testing" ? "2" : "1.5"}
              />

              {/* Status dot */}
              <circle cx={nx + 13} cy={p.y} r="4" fill={c.dot} />

              {/* Label */}
              <text
                x={nx + 24}
                y={p.y}
                dominantBaseline="middle"
                fontSize="10"
                fontWeight="500"
                fill={c.text}
              >
                {node.label.length > 13
                  ? node.label.slice(0, 12) + "…"
                  : node.label}
              </text>

              {/* Type subtitle */}
              <text
                x={nx + 24}
                y={p.y + 12}
                dominantBaseline="middle"
                fontSize="7.5"
                fill={c.dot}
                opacity="0.7"
              >
                {node.type}
              </text>
            </g>
          );
        })}

        {/* Legend */}
        {LEGEND.map((item, i) => {
          const c = PALETTE[item.status];
          return (
            <g key={item.status} transform={`translate(${PAD_X + i * 78}, ${svgH - 16})`}>
              <circle cx="5" cy="5" r="4" fill={c.dot} opacity="0.85" />
              <text x="13" y="9" fontSize="8.5" fill="#6b7280">
                {item.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

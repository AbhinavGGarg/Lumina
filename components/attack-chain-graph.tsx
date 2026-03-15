"use client";

import { AttackChain, ChainNode, ScanState } from "@/types/scan";
import { Skeleton } from "@/components/ui/skeleton";

// ── Layout constants ──────────────────────────────────────────────────────────

const NODE_W = 130;
const NODE_H = 42;
const NODE_R = 7;
const COL_GAP = 80; // horizontal gap between node centres
const PAD_X = 20;
const PAD_Y = 32;
const ROW_GAP = 64;

// ── Attack-stage colour palette (MITRE ATT&CK aligned) ───────────────────────

const STAGE_PALETTE: Record<
  string,
  { bg: string; border: string; text: string; dot: string }
> = {
  initial_access: {
    bg: "#1a1000",
    border: "#f97316",
    text: "#fdba74",
    dot: "#f97316",
  },
  credential_access: {
    bg: "#1a1a00",
    border: "#eab308",
    text: "#fde047",
    dot: "#eab308",
  },
  lateral_movement: {
    bg: "#12001a",
    border: "#a855f7",
    text: "#d8b4fe",
    dot: "#a855f7",
  },
  exfiltration: {
    bg: "#1a0000",
    border: "#ef4444",
    text: "#fca5a5",
    dot: "#ef4444",
  },
  impact: { bg: "#1a0000", border: "#dc2626", text: "#fca5a5", dot: "#dc2626" },
  service: {
    bg: "#111827",
    border: "#374151",
    text: "#9ca3af",
    dot: "#4b5563",
  },
};

const DEFAULT_PALETTE = STAGE_PALETTE.service;

function getPalette(type: string) {
  return STAGE_PALETTE[type.toLowerCase()] ?? DEFAULT_PALETTE;
}

// ── Layout: left-to-right chain ──────────────────────────────────────────────

function computeLayout(
  nodes: ChainNode[],
  edges: { from_id: string; to_id: string }[],
): Record<string, { x: number; y: number }> {
  // Topological ordering: BFS from root nodes (no incoming edges).
  const inDegree: Record<string, number> = {};
  const children: Record<string, string[]> = {};

  for (const n of nodes) {
    inDegree[n.id] = 0;
    children[n.id] = [];
  }
  for (const e of edges) {
    inDegree[e.to_id] = (inDegree[e.to_id] ?? 0) + 1;
    (children[e.from_id] ??= []).push(e.to_id);
  }

  // Assign columns via BFS — root nodes explicitly start at col 0.
  const col: Record<string, number> = {};
  const roots = nodes
    .filter((n) => (inDegree[n.id] ?? 0) === 0)
    .map((n) => n.id);
  if (roots.length === 0 && nodes.length > 0) roots.push(nodes[0].id);
  for (const id of roots) col[id] = 0;

  const queue = [...roots];
  let head = 0;
  while (head < queue.length) {
    const id = queue[head++];
    const c = col[id];
    for (const child of children[id] ?? []) {
      if ((col[child] ?? -1) < c + 1) {
        col[child] = c + 1;
        queue.push(child);
      }
    }
  }
  // Any unreachable nodes go in their own column at the end.
  const maxAssigned =
    Object.values(col).length > 0 ? Math.max(...Object.values(col)) : 0;
  for (const n of nodes) {
    if (col[n.id] === undefined) col[n.id] = maxAssigned + 1;
  }

  // Group by column, assign rows.
  const byCol: Record<number, string[]> = {};
  for (const [id, c] of Object.entries(col)) {
    (byCol[c] ??= []).push(id);
  }
  const maxInCol = Math.max(...Object.values(byCol).map((g) => g.length), 1);

  const pos: Record<string, { x: number; y: number }> = {};
  for (const [c, ids] of Object.entries(byCol)) {
    const ci = Number(c);
    const topPad = ((maxInCol - ids.length) * ROW_GAP) / 2;
    ids.forEach((id, ri) => {
      pos[id] = {
        x: PAD_X + NODE_W / 2 + ci * (NODE_W + COL_GAP),
        y: PAD_Y + NODE_H / 2 + topPad + ri * ROW_GAP,
      };
    });
  }
  return pos;
}

// ── Legend ───────────────────────────────────────────────────────────────────

const LEGEND = [
  { type: "initial_access", label: "Initial Access" },
  { type: "credential_access", label: "Credential Access" },
  { type: "lateral_movement", label: "Lateral Movement" },
  { type: "exfiltration", label: "Exfiltration" },
  { type: "impact", label: "Impact" },
];

// ── Component ────────────────────────────────────────────────────────────────

export function AttackChainGraph({ scan }: { scan: ScanState }) {
  const chain: AttackChain = scan.attack_chain ?? {
    nodes: [],
    edges: [],
    narrative: "",
    mermaid: "",
  };

  if (!chain.nodes.length) {
    return (
      <div className="flex flex-col gap-3">
        {scan.status === "running" ? (
          <div className="h-32 rounded-lg border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-white/35">
              <span className="h-2 w-2 rounded-full bg-amber-400/70 animate-pulse" />
              Building attack chain
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <Skeleton className="h-10 w-24 bg-white/10" />
              <Skeleton className="h-1 w-16 bg-white/10" />
              <Skeleton className="h-10 w-24 bg-white/10" />
              <Skeleton className="h-1 w-16 bg-white/10" />
              <Skeleton className="h-10 w-24 bg-white/10" />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-32 text-white/20 text-xs font-mono">
            No attack chain data
          </div>
        )}
      </div>
    );
  }

  const pos = computeLayout(chain.nodes, chain.edges);

  // Derive SVG dimensions directly from the computed positions.
  const allX = chain.nodes.map((n) => pos[n.id]?.x ?? 0);
  const allY = chain.nodes.map((n) => pos[n.id]?.y ?? 0);
  const maxX = Math.max(...allX, NODE_W / 2);
  const maxY = Math.max(...allY, NODE_H / 2);
  const LEGEND_H = 24;
  const svgW = maxX + NODE_W / 2 + PAD_X;
  const svgH = maxY + NODE_H / 2 + PAD_Y + LEGEND_H + 8;

  return (
    <div className="flex flex-col gap-4">
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          width="100%"
          className="min-w-90"
          style={{ fontFamily: "ui-monospace, monospace" }}
        >
          <defs>
            <marker
              id="chain-arrow"
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="4"
              orient="auto"
            >
              <path d="M0,0 L0,8 L8,4 z" fill="#6b7280" opacity="0.7" />
            </marker>
          </defs>

          {/* Edges */}
          {chain.edges.map((edge, i) => {
            const p1 = pos[edge.from_id];
            const p2 = pos[edge.to_id];
            if (!p1 || !p2) return null;

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
                  stroke="#6b7280"
                  strokeWidth="1.5"
                  opacity="0.6"
                  markerEnd="url(#chain-arrow)"
                />
                {edge.label && (
                  <text
                    x={mx}
                    y={(y1 + y2) / 2 - 5}
                    textAnchor="middle"
                    fontSize="7.5"
                    fill="#6b7280"
                    opacity="0.9"
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {chain.nodes.map((node) => {
            const p = pos[node.id];
            if (!p) return null;
            const c = getPalette(node.type);
            const nx = p.x - NODE_W / 2;
            const ny = p.y - NODE_H / 2;

            return (
              <g key={node.id}>
                {/* Glow halo */}
                <rect
                  x={nx - 4}
                  y={ny - 4}
                  width={NODE_W + 8}
                  height={NODE_H + 8}
                  rx={NODE_R + 3}
                  fill={c.border}
                  opacity="0.10"
                />

                {/* Node box */}
                <rect
                  x={nx}
                  y={ny}
                  width={NODE_W}
                  height={NODE_H}
                  rx={NODE_R}
                  fill={c.bg}
                  stroke={c.border}
                  strokeWidth="1.5"
                />

                {/* Status dot */}
                <circle cx={nx + 13} cy={p.y} r="4" fill={c.dot} />

                {/* Label */}
                <text
                  x={nx + 24}
                  y={p.y - 4}
                  dominantBaseline="middle"
                  fontSize="9.5"
                  fontWeight="600"
                  fill={c.text}
                >
                  {node.label.length > 14
                    ? node.label.slice(0, 13) + "…"
                    : node.label}
                </text>

                {/* Type subtitle */}
                <text
                  x={nx + 24}
                  y={p.y + 9}
                  dominantBaseline="middle"
                  fontSize="7"
                  fill={c.dot}
                  opacity="0.75"
                >
                  {node.type.replace(/_/g, " ")}
                </text>
              </g>
            );
          })}

          {/* Legend */}
          {LEGEND.map((item, i) => {
            const c = getPalette(item.type);
            return (
              <g
                key={item.type}
                transform={`translate(${PAD_X + i * 72}, ${svgH - LEGEND_H + 6})`}
              >
                <circle cx="5" cy="5" r="4" fill={c.dot} opacity="0.85" />
                <text x="13" y="9" fontSize="7.5" fill="#6b7280">
                  {item.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Narrative */}
      {chain.narrative && (
        <p className="text-xs text-white/50 font-mono leading-relaxed border-t border-white/5 pt-3 mt-1">
          {chain.narrative}
        </p>
      )}
    </div>
  );
}

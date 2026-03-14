"use client";

import { ScanState } from "@/types/scan";

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"] as const;

const SEV_COLOR: Record<string, string> = {
  critical: "#ef4444",
  high:     "#f97316",
  medium:   "#eab308",
  low:      "#3b82f6",
  info:     "#6b7280",
};

interface Row {
  component: string;
  counts: Record<string, number>;
  total: number;
}

export function FindingsChart({ scan }: { scan: ScanState }) {
  if (scan.findings.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-white/20 text-xs font-mono">
        {scan.status === "running" ? "Awaiting findings…" : "No findings to chart"}
      </div>
    );
  }

  // Group by component, fallback to agent name.
  const map: Record<string, Record<string, number>> = {};
  for (const f of scan.findings) {
    const comp = f.component?.trim() || f.agent;
    (map[comp] ??= {});
    map[comp][f.severity] = (map[comp][f.severity] ?? 0) + 1;
  }

  const rows: Row[] = Object.entries(map)
    .map(([component, counts]) => ({
      component,
      counts,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const maxTotal  = Math.max(...rows.map((r) => r.total), 1);
  const LABEL_W   = 106;
  const BAR_W     = 170;
  const BAR_H     = 26;
  const GAP       = 10;
  const PAD_X     = 10;
  const PAD_Y     = 10;
  const LEGEND_H  = 20;
  const svgH      = PAD_Y + rows.length * (BAR_H + GAP) + LEGEND_H + 6;
  const svgW      = PAD_X + LABEL_W + BAR_W + 32;

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        width="100%"
        className="min-w-[280px]"
        style={{ fontFamily: "ui-monospace, monospace" }}
      >
        {rows.map((row, i) => {
          const y = PAD_Y + i * (BAR_H + GAP);
          let xCursor = PAD_X + LABEL_W;

          return (
            <g key={row.component}>
              {/* Component label */}
              <text
                x={PAD_X}
                y={y + BAR_H / 2}
                dominantBaseline="middle"
                fontSize="9.5"
                fill="#9ca3af"
              >
                {row.component.length > 14
                  ? row.component.slice(0, 13) + "…"
                  : row.component}
              </text>

              {/* Track background */}
              <rect
                x={PAD_X + LABEL_W}
                y={y}
                width={BAR_W}
                height={BAR_H}
                rx="5"
                fill="#1f2937"
              />

              {/* Stacked severity segments */}
              {SEVERITY_ORDER.map((sev) => {
                const count = row.counts[sev] ?? 0;
                if (!count) return null;
                const w = (count / maxTotal) * BAR_W;
                const x = xCursor;
                xCursor += w;
                return (
                  <rect
                    key={sev}
                    x={x}
                    y={y}
                    width={w}
                    height={BAR_H}
                    rx="3"
                    fill={SEV_COLOR[sev]}
                    opacity="0.85"
                  />
                );
              })}

              {/* Total label */}
              <text
                x={PAD_X + LABEL_W + (row.total / maxTotal) * BAR_W + 6}
                y={y + BAR_H / 2}
                dominantBaseline="middle"
                fontSize="9"
                fill="#6b7280"
              >
                {row.total}
              </text>
            </g>
          );
        })}

        {/* Legend row */}
        {SEVERITY_ORDER.map((sev, i) => (
          <g
            key={sev}
            transform={`translate(${PAD_X + i * 58}, ${svgH - LEGEND_H + 4})`}
          >
            <rect width="7" height="7" rx="2" fill={SEV_COLOR[sev]} opacity="0.85" />
            <text x="10" y="7" fontSize="7.5" fill="#6b7280">
              {sev}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

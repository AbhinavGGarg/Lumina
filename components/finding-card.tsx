"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Finding, Severity } from "@/types/scan";
import { useState } from "react";

const SEVERITY_STYLES: Record<Severity, { badge: string; border: string }> = {
  critical: { badge: "bg-red-600 text-white",         border: "border-red-600/30" },
  high:     { badge: "bg-orange-500 text-white",      border: "border-orange-500/30" },
  medium:   { badge: "bg-yellow-500 text-black",      border: "border-yellow-500/30" },
  low:      { badge: "bg-blue-500 text-white",        border: "border-blue-500/30" },
  info:     { badge: "bg-muted text-muted-foreground", border: "border-border" },
};

interface Props {
  finding: Finding;
  index: number;
}

export function FindingCard({ finding, index }: Props) {
  const [expanded, setExpanded] = useState(false);
  const styles = SEVERITY_STYLES[finding.severity] ?? SEVERITY_STYLES.info;

  return (
    <Card className={`border ${styles.border} transition-all`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${styles.badge}`}>
              {finding.severity}
            </span>
            <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-muted">
              {finding.tool}
            </span>
          </div>
          <span className="text-xs text-muted-foreground shrink-0">#{index + 1}</span>
        </div>
        <CardTitle className="text-sm font-semibold mt-1 leading-snug">
          {finding.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 flex flex-col gap-2">
        <p className="text-sm text-muted-foreground leading-relaxed">
          {finding.description}
        </p>

        {finding.remediation && (
          <p className="text-sm">
            <span className="font-medium">Fix: </span>
            <span className="text-muted-foreground">{finding.remediation}</span>
          </p>
        )}

        {finding.evidence && (
          <>
            <button
              onClick={() => setExpanded(v => !v)}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground text-left"
            >
              {expanded ? "Hide evidence" : "Show evidence"}
            </button>
            {expanded && (
              <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-words">
                {finding.evidence}
              </pre>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

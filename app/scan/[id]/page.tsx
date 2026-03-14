"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ScanState } from "@/types/scan";
import { ScanProgress } from "@/components/scan-progress";
import { FindingCard } from "@/components/finding-card";
import { Button } from "@/components/ui/button";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"] as const;

export default function ScanPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [scan, setScan] = useState<ScanState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const es = new EventSource(`${API}/api/scan/${id}/stream`);

    es.onmessage = (e) => {
      try {
        const data: ScanState = JSON.parse(e.data);
        setScan(data);
        if (data.status === "complete" || data.status === "failed") {
          es.close();
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      es.close();
      setError("Lost connection to scan stream");
    };

    return () => es.close();
  }, [id]);

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-destructive">{error}</p>
      </main>
    );
  }

  if (!scan) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Connecting to scan…</p>
      </main>
    );
  }

  const sortedFindings = [...scan.findings].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
  );

  const counts = SEVERITY_ORDER.reduce(
    (acc, s) => ({ ...acc, [s]: scan.findings.filter(f => f.severity === s).length }),
    {} as Record<string, number>
  );

  return (
    <main className="min-h-screen flex flex-col gap-6 px-4 py-10 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-serif font-semibold">Scan in progress</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-mono">{scan.target}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={scan.status} />
          {scan.status === "complete" && (
            <Button asChild size="sm">
              <Link href={`/report/${id}`}>View Report →</Link>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => router.push("/")}>
            ← New Scan
          </Button>
        </div>
      </div>

      {/* Severity summary */}
      {scan.findings.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          {SEVERITY_ORDER.filter(s => counts[s] > 0).map(s => (
            <SeverityCount key={s} severity={s} count={counts[s]} />
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Agent pipeline */}
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Agent Pipeline
          </h2>
          <ScanProgress scan={scan} />

          {/* Log */}
          {scan.log.length > 0 && (
            <div className="mt-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Log
              </h3>
              <div className="text-xs text-muted-foreground font-mono flex flex-col gap-1 max-h-48 overflow-y-auto">
                {scan.log.map((entry, i) => (
                  <span key={i}>{entry}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Findings */}
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Findings ({scan.findings.length})
          </h2>
          {sortedFindings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {scan.status === "running" ? "Waiting for first findings…" : "No findings detected."}
            </p>
          ) : (
            sortedFindings.map((f, i) => (
              <FindingCard key={i} finding={f} index={i} />
            ))
          )}
        </div>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending:  "bg-muted text-muted-foreground",
    running:  "bg-blue-500/15 text-blue-600 border border-blue-500/30",
    complete: "bg-green-500/15 text-green-600 border border-green-500/30",
    failed:   "bg-destructive/15 text-destructive border border-destructive/30",
  };
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${map[status] ?? map.pending}`}>
      {status}
    </span>
  );
}

function SeverityCount({ severity, count }: { severity: string; count: number }) {
  const map: Record<string, string> = {
    critical: "bg-red-600/15 text-red-600 border border-red-600/30",
    high:     "bg-orange-500/15 text-orange-500 border border-orange-500/30",
    medium:   "bg-yellow-500/15 text-yellow-600 border border-yellow-500/30",
    low:      "bg-blue-500/15 text-blue-500 border border-blue-500/30",
    info:     "bg-muted text-muted-foreground border border-border",
  };
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full uppercase ${map[severity] ?? ""}`}>
      {count} {severity}
    </span>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ScanState } from "@/types/scan";
import { ScanProgress } from "@/components/scan-progress";
import { FindingCard } from "@/components/finding-card";
import { Button } from "@/components/ui/button";
import { Terminal, ShieldAlert, Cpu, GitBranch, BarChart3 } from "lucide-react";
import { AttackChainGraph } from "@/components/attack-chain-graph";
import { FindingsChart } from "@/components/findings-chart";
import { ReportModal } from "@/components/report-modal";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"] as const;

// ── LLM reasoning stream parser ────────────────────────────────────────────

interface ReasoningBlock {
  agent: string;
  tokens: string[];
  done: boolean;
}

function buildReasoningBlocks(llmLog: string[]): ReasoningBlock[] {
  const blocks: ReasoningBlock[] = [];
  let current: ReasoningBlock | null = null;

  for (const entry of llmLog) {
    if (entry.startsWith("\x00START:")) {
      current = { agent: entry.slice(7), tokens: [], done: false };
      blocks.push(current);
    } else if (entry === "\x00END") {
      if (current) current.done = true;
      current = null;
    } else if (current) {
      current.tokens.push(entry);
    }
  }

  return blocks;
}

// ── LLM Stream Panel ───────────────────────────────────────────────────────

function LlmStreamPanel({ llmLog }: { llmLog: string[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const blocks = buildReasoningBlocks(llmLog);

  // Auto-scroll to bottom as tokens arrive.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [llmLog]);

  if (blocks.length === 0) return null;

  const latestBlock = blocks[blocks.length - 1];

  return (
    <div className="rounded-xl border border-white/10 bg-[#0d0d0d] overflow-hidden flex h-full flex-col shadow-2xl">
      {/* Header */}
      <div className="w-full flex items-center justify-between px-5 py-3.5 border-b border-white/5 bg-[#161616]">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-purple-400" />
          <span className="text-xs font-semibold text-white/80 uppercase tracking-widest">
            Agent Reasoning Console
          </span>
          {!latestBlock.done && (
            <span className="flex gap-0.5 ml-2">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce"
                  style={{ animationDelay: `${i * 0.12}s` }}
                />
              ))}
            </span>
          )}
        </div>
      </div>

      {/* Stream content */}
      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollRef}
          className="h-full overflow-y-auto px-5 py-4 pb-8 scroll-smooth"
        >
          {blocks.map((block, bi) => (
            <div key={bi} className="mb-6">
              <p className="text-[11px] font-mono text-purple-400 mb-2 uppercase tracking-widest">
                &gt; [{block.agent}] process
              </p>
              <p className="font-mono text-[13px] text-[#c9d1d9] leading-relaxed whitespace-pre-wrap break-all">
                {block.tokens.join("")}
                {!block.done && bi === blocks.length - 1 && (
                  <span className="inline-block w-2 h-4 bg-purple-400 ml-1 animate-pulse align-middle" />
                )}
              </p>
            </div>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-8 bg-gradient-to-t from-[#0d0d0d] to-transparent" />
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function ScanPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [scan, setScan] = useState<ScanState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportMarkdown, setReportMarkdown] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

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

  async function openReportModal() {
    if (!id) return;

    setIsReportOpen(true);
    setReportLoading(true);
    setReportError(null);

    try {
      const response = await fetch(`${API}/api/scan/${id}/report`);
      const data = await response.json();
      setReportMarkdown(data.report || "No report generated.");
    } catch {
      setReportError("Failed to load detailed report");
    } finally {
      setReportLoading(false);
    }
  }

  function downloadReport() {
    if (!reportMarkdown || !id) return;
    const blob = new Blob([reportMarkdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pulse-report-${id.slice(0, 8)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (error) {
    return (
      <main className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center">
        <p className="text-red-400 bg-red-400/10 px-4 py-2 rounded-xl border border-red-400/20">
          {error}
        </p>
      </main>
    );
  }

  if (!scan) {
    return (
      <main className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-white/50 text-sm tracking-wide">
            Connecting to agent stream...
          </p>
        </div>
      </main>
    );
  }

  const sortedFindings = [...scan.findings].sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );

  const counts = SEVERITY_ORDER.reduce(
    (acc, s) => ({
      ...acc,
      [s]: scan.findings.filter((f) => f.severity === s).length,
    }),
    {} as Record<string, number>,
  );

  const isRunning = scan.status === "running" || scan.status === "pending";

  return (
    <main className="relative page-shell min-h-screen overflow-hidden bg-[#0a0a0a] text-white flex flex-col pt-8 pb-16 font-sans">
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(900px_460px_at_12%_0%,rgba(168,85,247,0.08),transparent_60%),radial-gradient(800px_420px_at_88%_0%,rgba(59,130,246,0.07),transparent_60%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0a0a0a]/20 to-[#0a0a0a]/55" />
      </div>

      <div className="relative z-10 page-container flex flex-col gap-8">
        {/* Header Console */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 p-6 rounded-2xl border border-white/10 bg-[#111] shadow-2xl relative overflow-hidden">
          {/* Subtle bg glow */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 blur-[100px] pointer-events-none rounded-full" />

          <div className="flex flex-col items-start gap-2 z-10">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-serif font-medium tracking-tight">
                {isRunning ? "Active Operation" : "Operation Summary"}
              </h1>
              <StatusBadge status={scan.status} />
            </div>

            <div className="flex flex-wrap items-center gap-3 mt-1">
              <span className="font-mono text-sm text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded border border-purple-400/20">
                {scan.target}
              </span>
              {scan.architecture_summary && (
                <div className="flex items-start gap-1.5 text-sm text-white/40">
                  <span className="shrink-0 mt-px">Architecture:</span>
                  <span className="font-mono text-sm text-white/70 bg-white/5 px-1.5 py-px rounded border border-white/10 leading-relaxed">
                    {scan.architecture_summary}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto z-10">
            <Button
              variant="outline"
              onClick={() => router.push("/")}
              className="bg-[#1a1a1a] hover:bg-[#2a2a2a] border-white/10 text-white w-full md:w-auto"
            >
              + New Target
            </Button>
            {scan.status === "complete" && (
              <Button
                className="bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/20 w-full md:w-auto"
                onClick={openReportModal}
              >
                Detailed Report →
              </Button>
            )}
          </div>
        </div>

        {/* 3-Column SaaS Dashboard Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Column 1: Pipeline & Status (Col Span 3) */}
          <div className="flex flex-col gap-6 lg:col-span-3 lg:h-[42rem] lg:self-stretch lg:overflow-hidden">
            {/* Severity Summary */}
            {scan.findings.length > 0 && (
              <div className="bg-[#111] border border-white/10 rounded-xl p-5 flex flex-col gap-3 shadow-lg shrink-0">
                <div className="flex items-center gap-2 text-xs font-semibold text-white/50 uppercase tracking-widest">
                  <ShieldAlert className="w-4 h-4 text-white/40" />
                  Threat Overview
                </div>
                <div className="flex flex-wrap gap-2">
                  {SEVERITY_ORDER.filter((s) => counts[s] > 0).map((s) => (
                    <SeverityCount key={s} severity={s} count={counts[s]} />
                  ))}
                </div>
              </div>
            )}

            <div className="bg-[#111] border border-white/10 rounded-xl p-5 flex flex-col gap-4 shadow-lg shrink-0 lg:h-[20rem] overflow-hidden">
              <div className="flex items-center gap-2 text-xs font-semibold text-white/50 uppercase tracking-widest">
                <Cpu className="w-4 h-4 text-white/40" />
                Execution Pipeline
              </div>
              <div className="relative flex-1 min-h-0">
                <div className="h-full overflow-y-auto pr-1 pb-5">
                  <ScanProgress scan={scan} />
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-7 bg-gradient-to-t from-[#111] to-transparent" />
              </div>
            </div>

            {/* System Log */}
            {scan.log.length > 0 && (
              <div className="bg-[#111] border border-white/10 rounded-xl p-5 flex flex-col gap-3 shadow-lg lg:flex-1 lg:min-h-0 overflow-hidden">
                <h3 className="text-xs font-semibold text-white/50 uppercase tracking-widest shrink-0">
                  System Transcript
                </h3>
                <div className="relative lg:flex-1 lg:min-h-0">
                  <div className="h-full text-[11px] text-white/40 font-mono flex flex-col gap-1.5 overflow-y-auto pr-2 pb-5">
                    {scan.log.map((entry, i) => (
                      <span
                        key={i}
                        className={
                          entry.startsWith("[SKIP]")
                            ? "text-yellow-500/60"
                            : undefined
                        }
                      >
                        {entry}
                      </span>
                    ))}
                  </div>
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-7 bg-gradient-to-t from-[#111] to-transparent" />
                </div>
              </div>
            )}
          </div>

          {/* Column 2: Agent Reasoning Engine (Col Span 5 or 6) */}
          <div className="lg:col-span-5 h-[34rem] lg:h-[42rem] lg:self-stretch">
            {scan.llm_log.length > 0 ? (
              <LlmStreamPanel llmLog={scan.llm_log} />
            ) : (
              <div className="h-full rounded-xl border border-white/5 border-dashed flex items-center justify-center p-8 bg-[#111]/50 text-center">
                <p className="text-sm font-mono text-white/30 tracking-tight">
                  Awaiting LLM interpretation stream...
                </p>
              </div>
            )}
          </div>

          {/* Column 3: Findings (Col Span 4 or 3) */}
          <div className="flex flex-col gap-4 lg:col-span-4 bg-[#111] border border-white/10 rounded-xl p-5 shadow-lg h-[34rem] lg:h-[42rem] lg:self-stretch overflow-hidden">
            <h2 className="text-xs font-semibold text-white/50 uppercase tracking-widest flex items-center justify-between shrink-0 pb-2 mb-2 border-b border-white/5 w-full">
              <span>Discovered Vulnerabilities</span>
              <span className="bg-white/10 text-white/80 px-2 py-0.5 rounded-full">
                {scan.findings.length}
              </span>
            </h2>

            <div className="relative flex-1 min-h-0">
              <div className="h-full overflow-y-auto pr-1 pb-5">
                <div className="flex flex-col gap-3">
                {sortedFindings.length === 0 ? (
                  <p className="text-sm text-white/30 text-center py-12">
                    {scan.status === "running"
                      ? "Scanning engines active..."
                      : "No vulnerabilities detected based on current rulesets."}
                  </p>
                ) : (
                  sortedFindings.map((f, i) => (
                    <FindingCard key={i} finding={f} index={i} />
                  ))
                )}
                </div>
              </div>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-7 bg-gradient-to-t from-[#111] to-transparent" />
            </div>
          </div>
        </div>

        {/* ── Architecture Map + Findings by Component ─────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start lg:items-stretch">

          <div className="lg:col-span-7 bg-[#111] border border-white/10 rounded-xl p-5 shadow-lg flex flex-col lg:h-[24rem] overflow-hidden">
            <div className="flex items-center gap-2 text-xs font-semibold text-white/50 uppercase tracking-widest mb-4 shrink-0">
              <GitBranch className="w-4 h-4 text-white/40" />
              Attack Chain
            </div>
            <div className="relative flex-1 min-h-0">
              <div className="h-full overflow-auto pr-1 pb-4">
                <div className="min-h-full flex items-center">
                  <AttackChainGraph scan={scan} />
                </div>
              </div>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-6 bg-gradient-to-t from-[#111] to-transparent" />
            </div>
          </div>

          <div className="lg:col-span-5 bg-[#111] border border-white/10 rounded-xl p-5 shadow-lg flex flex-col lg:h-[24rem] overflow-hidden">
            <div className="flex items-center gap-2 text-xs font-semibold text-white/50 uppercase tracking-widest mb-4 shrink-0">
              <BarChart3 className="w-4 h-4 text-white/40" />
              Findings by Component
            </div>
            <div className="relative flex-1 min-h-0">
              <div className="h-full overflow-auto pr-1 pb-4">
                <div className="min-h-full flex items-center">
                  <FindingsChart scan={scan} />
                </div>
              </div>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-6 bg-gradient-to-t from-[#111] to-transparent" />
            </div>
          </div>

        </div>
      </div>

      <ReportModal
        open={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        report={reportMarkdown}
        loading={reportLoading}
        error={reportError}
        target={scan.target}
        scanId={scan.scan_id}
        onDownload={downloadReport}
      />
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-white/10 text-white/60 border border-white/20",
    running: "bg-purple-500/10 text-purple-400 border border-purple-500/30",
    complete: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30",
    failed: "bg-red-500/10 text-red-400 border border-red-500/30",
  };
  return (
    <span
      className={`text-[10px] uppercase tracking-widest font-bold px-2.5 py-1 rounded-full ${map[status] ?? map.pending}`}
    >
      {status}
    </span>
  );
}

function SeverityCount({
  severity,
  count,
}: {
  severity: string;
  count: number;
}) {
  const map: Record<string, string> = {
    critical: "bg-red-500/10 text-red-500 border border-red-500/30",
    high: "bg-orange-500/10 text-orange-400 border border-orange-500/30",
    medium: "bg-yellow-500/10 text-yellow-500 border border-yellow-500/30",
    low: "bg-blue-500/10 text-blue-400 border border-blue-500/30",
    info: "bg-white/5 text-white/50 border border-white/10",
  };
  return (
    <span
      className={`text-[11px] font-semibold px-2 py-0.5 rounded uppercase flex items-center gap-1.5 ${map[severity] ?? ""}`}
    >
      <span className="text-[13px]">{count}</span>
      <span className="opacity-80 tracking-wide">{severity}</span>
    </span>
  );
}

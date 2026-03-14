"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [report, setReport] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    async function load() {
      try {
        const [reportRes, scanRes] = await Promise.all([
          fetch(`${API}/api/scan/${id}/report`),
          fetch(`${API}/api/scan/${id}`),
        ]);
        const reportData = await reportRes.json();
        const scanData = await scanRes.json();
        setReport(reportData.report || "No report generated.");
        setTarget(scanData.target ?? "");
      } catch {
        setError("Failed to load report");
      }
    }

    load();
  }, [id]);

  function downloadReport() {
    if (!report) return;
    const blob = new Blob([report], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pulse-report-${id?.slice(0, 8)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-destructive">{error}</p>
      </main>
    );
  }

  if (report === null) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading report…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col gap-6 px-4 py-10 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-serif font-semibold">Vulnerability Report</h1>
          {target && (
            <p className="text-sm text-muted-foreground mt-0.5 font-mono">{target}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={downloadReport}>
            ↓ Download .md
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push(`/scan/${id}`)}>
            ← Back to Scan
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push("/")}>
            New Scan
          </Button>
        </div>
      </div>

      {/* Report body */}
      <div className="prose prose-sm dark:prose-invert max-w-none
        prose-headings:font-serif
        prose-h1:text-2xl prose-h2:text-xl prose-h3:text-base
        prose-table:text-xs prose-td:py-1.5 prose-th:py-1.5
        prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono
        prose-pre:bg-muted prose-pre:text-xs
        border border-border rounded-lg px-6 py-6 bg-background">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {report}
        </ReactMarkdown>
      </div>
    </main>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Globe, Github, Play, TerminalSquare } from "lucide-react";
import { toast } from "sonner";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const EXAMPLE_TARGETS = [
  {
    label: "Juice Shop",
    value: "http://localhost:3001",
    hint: "URL target",
  },
  {
    label: "GitHub Repo",
    value: "https://github.com/trottomv/python-insecure-app",
    hint: "Repository target",
  },
  {
    label: "Local Path",
    value: "/tmp/myrepo",
    hint: "Mounted local repo",
  },
] as const;

function inferTargetType(target: string): "url" | "github" | "repo_path" | "unknown" {
  const value = target.trim().toLowerCase();
  if (!value) return "unknown";
  if (value.startsWith("http://") || value.startsWith("https://")) {
    if (value.includes("github.com/")) {
      return "github";
    }
    return "url";
  }
  if (value.startsWith("/") || value.startsWith("./") || value.startsWith("../")) {
    return "repo_path";
  }
  return "unknown";
}

function TargetTypePill({ target }: { target: string }) {
  const type = useMemo(() => inferTargetType(target), [target]);

  const map = {
    url: {
      label: "Website / URL scan",
      icon: Globe,
      className: "text-cyan-200 border-cyan-300/35 bg-cyan-400/10",
    },
    github: {
      label: "GitHub repository scan",
      icon: Github,
      className: "text-violet-200 border-violet-300/35 bg-violet-400/10",
    },
    repo_path: {
      label: "Local repository scan",
      icon: TerminalSquare,
      className: "text-emerald-200 border-emerald-300/35 bg-emerald-400/10",
    },
    unknown: {
      label: "Auto-detecting target type",
      icon: ArrowUpRight,
      className: "text-slate-200 border-slate-300/30 bg-white/8",
    },
  } as const;

  const meta = map[type];
  const Icon = meta.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-mono ${meta.className}`}
      aria-live="polite"
    >
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
}

export function ScanForm() {
  const router = useRouter();
  const [target, setTarget] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!target.trim()) {
      toast.error("Please enter a URL, GitHub repository, or repo path");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${API}/api/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: target.trim() }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail ?? "Failed to start scan");
      }

      const data = await res.json();
      toast.success("Scan started");
      router.push(`/scan/${data.scan_id}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to start scan");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="surface-panel flex w-full flex-col gap-4 p-4 md:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="section-kicker">Scan Command Center</p>
        <TargetTypePill target={target} />
      </div>

      <div className="rounded-xl border border-white/15 bg-[#070c18] p-2">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <label htmlFor="target-input" className="sr-only">
            Target input
          </label>
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cyan-200/70">
              <TerminalSquare className="h-4 w-4" />
            </span>
            <input
              id="target-input"
              type="text"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              placeholder="https://example.com or https://github.com/org/repo or /tmp/repo"
              className="h-12 w-full rounded-lg border border-white/10 bg-[#090f1d] pl-10 pr-3 font-mono text-sm text-slate-100 outline-none transition-all placeholder:text-slate-500 focus:border-cyan-300/50 focus:shadow-[0_0_0_3px_rgba(34,211,238,0.15)]"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 px-5 text-sm font-semibold text-slate-950 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70 md:min-w-[11rem]"
          >
            <Play className="h-4 w-4" />
            {loading ? "Launching Scan" : "Run Scan"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
          Example targets
        </span>
        {EXAMPLE_TARGETS.map((example) => (
          <button
            key={example.value}
            type="button"
            onClick={() => setTarget(example.value)}
            className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-200 transition-all hover:border-cyan-300/35 hover:bg-cyan-400/12 hover:text-cyan-100"
          >
            <span className="font-medium">{example.label}</span>
            <span className="text-slate-400">{example.hint}</span>
          </button>
        ))}
      </div>

      <p className="text-xs leading-relaxed text-slate-300/80">
        Lumina auto-detects URL vs repository targets, orchestrates specialist agents, and streams findings in real time.
      </p>
    </form>
  );
}

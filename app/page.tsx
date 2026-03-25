"use client";

import Link from "next/link";
import { motion } from "motion/react";
import {
  ArrowRight,
  Bot,
  BrainCircuit,
  FileText,
  Radar,
  ShieldCheck,
} from "lucide-react";
import { ScanForm } from "@/components/scan-form";
import { GlassPanel, PlatformShell, SectionHeading } from "@/components/platform-shell";
import { TrustNote } from "@/components/trust-note";
import { LiveActivityConsole } from "@/components/live-activity-console";

const QUICK_STEPS = [
  {
    icon: Radar,
    title: "Enter Target",
    description: "Provide a URL or GitHub repository.",
  },
  {
    icon: BrainCircuit,
    title: "Agents Execute",
    description: "Lumina plans and runs specialist scanners.",
  },
  {
    icon: FileText,
    title: "Review Results",
    description: "Read live findings and export the final report.",
  },
] as const;

const PREVIEW_LOGS = [
  "[planner] fingerprint complete: target type=repository",
  "[planner] execution plan selected: static -> deps_py -> secrets -> report",
  "[static] semgrep running against source tree",
  "[synthesis] report generation queued",
];

export default function Home() {
  return (
    <PlatformShell>
      <main className="page-shell pb-14 pt-10 md:pb-20 md:pt-14">
        <div className="page-container space-y-8 md:space-y-10">
          <section className="grid gap-6 lg:grid-cols-12 lg:items-stretch">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="surface-panel col-span-12 p-6 md:p-8 lg:col-span-7"
            >
              <p className="section-kicker">AI Security Orchestrator</p>
              <h1 className="mt-4 text-balance text-4xl font-semibold leading-tight text-white md:text-5xl md:leading-tight">
                Run autonomous vulnerability scans with a clean, guided workflow.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-300/85">
                Lumina scans websites and repositories using coordinated security agents, then streams findings and produces a structured report.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="surface-panel-muted px-3 py-2.5">
                  <p className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Targets</p>
                  <p className="mt-1 text-sm font-semibold text-slate-100">URL + GitHub</p>
                </div>
                <div className="surface-panel-muted px-3 py-2.5">
                  <p className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Execution</p>
                  <p className="mt-1 text-sm font-semibold text-slate-100">Live Agent Stream</p>
                </div>
                <div className="surface-panel-muted px-3 py-2.5">
                  <p className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Output</p>
                  <p className="mt-1 text-sm font-semibold text-slate-100">Actionable Report</p>
                </div>
              </div>

              <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-mono uppercase tracking-[0.12em] text-cyan-100">
                <Bot className="h-3.5 w-3.5" />
                AI-powered agent pipeline
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.07 }}
              className="col-span-12 flex flex-col gap-4 lg:col-span-5"
            >
              <ScanForm />
              <TrustNote compact />
              <Link
                href="/platform"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.04] px-4 py-2 text-sm text-slate-200 transition-all hover:border-cyan-300/35 hover:bg-cyan-300/10 hover:text-cyan-100"
              >
                Open Platform Overview
                <ArrowRight className="h-4 w-4" />
              </Link>
            </motion.div>
          </section>

          <section className="grid gap-4 lg:grid-cols-12">
            <GlassPanel className="col-span-12 p-5 lg:col-span-8">
              <SectionHeading
                kicker="Quick Flow"
                title="From target to report in three steps"
                description="Everything starts from the scan bar above. Use this as your operational launchpad."
              />
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {QUICK_STEPS.map((step, index) => {
                  const Icon = step.icon;
                  return (
                    <article key={step.title} className="surface-panel-muted px-3.5 py-3">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="rounded-md border border-white/10 bg-white/8 p-1 text-cyan-200">
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <p className="text-sm font-medium text-slate-100">{index + 1}. {step.title}</p>
                      </div>
                      <p className="text-xs leading-relaxed text-slate-300/85">{step.description}</p>
                    </article>
                  );
                })}
              </div>
            </GlassPanel>

            <LiveActivityConsole
              entries={PREVIEW_LOGS}
              title="Live Preview"
              className="col-span-12 lg:col-span-4"
            />
          </section>

          <footer className="surface-panel flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
            <span className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-slate-300/80">
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
              Guardrails enabled · isolated scan runtime
            </span>
            <Link
              href="/platform"
              className="text-xs font-mono uppercase tracking-wider text-cyan-200 transition-opacity hover:opacity-75"
            >
              View detailed architecture
            </Link>
          </footer>
        </div>
      </main>
    </PlatformShell>
  );
}

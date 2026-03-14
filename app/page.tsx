"use client";

import { ScanForm } from "@/components/scan-form";
import { motion } from "motion/react";
import { Lock, LayoutGrid } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col font-sans selection:bg-purple-500/30">
      <main className="flex-1 flex flex-col px-6 md:px-12 xl:px-24 pt-32 pb-16 justify-center">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-8 max-w-7xl mx-auto w-full">
          
          {/* Left Hero Section */}
          <div className="flex flex-col gap-6 items-start text-left">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="text-5xl md:text-6xl lg:text-7xl font-serif tracking-tight leading-[1.1]"
            >
              Pulse
            </motion.h1>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="text-3xl md:text-4xl font-serif tracking-tight leading-[1.1] text-white/80"
            >
              Find Vulnerabilities <br className="hidden md:block" />
              Using Autonomous Agents.
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="text-sm md:text-base text-white/50 max-w-lg leading-relaxed font-light mt-2"
            >
              Pulse is a LangGraph orchestrated security system. We dispatch specialised agents running{" "}
              <span className="text-white/80 font-medium tracking-wide">httpx, nmap, sqlmap, dalfox, and semgrep</span>{" "}
              to discover flaws in your infrastructure and codebase.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3 }}
              className="w-full max-w-lg mt-8"
            >
              <div className="bg-[#0a0a0a] rounded-xl">
                <ScanForm />
              </div>
              <p className="text-[10px] text-white/30 tracking-tight mt-4 ml-2 flex items-center gap-1.5">
                <Lock className="w-3 h-3" />
                Scanning restricted to allowlisted targets: target · localhost · 127.0.0.1
              </p>
            </motion.div>
          </div>

          {/* Right Visual/Console Area */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="hidden lg:flex flex-col justify-center items-end"
          >
            <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#111] overflow-hidden shadow-2xl relative">
              {/* Console Header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-[#161616]">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
                </div>
                <div className="ml-auto flex items-center gap-2 text-xs text-white/40 font-mono">
                  <LayoutGrid className="w-3.5 h-3.5" />
                  agent_pipeline.log
                </div>
              </div>

              {/* Console Body */}
              <div className="p-5 font-mono text-[11px] leading-relaxed text-white/60 flex flex-col gap-3 h-105">
                <div className="flex justify-between items-center text-purple-400">
                  <span>&gt; target: harris-corporation</span>
                  <span className="text-white/30">12ms</span>
                </div>
                
                <div className="space-y-1">
                  <p className="text-white/40">✓ [planner] Analysing target...</p>
                  <p className="text-emerald-400">  → Type: repository</p>
                  <p className="text-emerald-400">  → Languages: Python, Go</p>
                  <p className="text-emerald-400">  → Plan: [static_py, static_go, secrets, report]</p>
                </div>

                <div className="space-y-1 mt-2">
                  <p className="text-white/40">✓ [static_py] Running bandit...</p>
                  <p className="text-white/70">  → Discovered 2 high-severity hints</p>
                </div>

                <div className="space-y-1 mt-2">
                  <p className="text-white/40">✓ [static_go] Running gosec...</p>
                  <p className="text-white/70">  → Clean</p>
                </div>

                <div className="space-y-1 mt-2">
                  <p className="text-purple-400 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                    [secrets] Scanning for hardcoded credentials
                  </p>
                  <p className="text-white/30 pl-3.5">  → trufflehog running...</p>
                  <p className="text-white/30 pl-3.5">  → parsing chunks (450/1202)</p>
                </div>

                <div className="mt-auto pt-6 border-t border-white/5">
                  <div className="flex justify-between text-white/30">
                    <span>LLM Synthesis</span>
                    <span>Queued</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </main>

      {/* Trusted By Section (Footer) */}
      <footer className="w-full px-6 md:px-12 xl:px-24 pb-12 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center gap-6 md:gap-12 border-t border-white/5 pt-8">
          <span className="text-[10px] text-white/30 uppercase tracking-widest font-mono">
            Orchestrating standard tooling
          </span>
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-8 opacity-40 grayscale">
            <span className="text-sm font-semibold tracking-tight">ProjectDiscovery</span>
            <span className="text-sm font-bold tracking-tight">Semgrep</span>
            <span className="text-sm font-medium tracking-wide">NMAP</span>
            <span className="text-sm font-serif italic">sqlmap</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

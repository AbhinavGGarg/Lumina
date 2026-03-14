"use client";

import { ScanForm } from "@/components/scan-form";
import { motion } from "motion/react";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 px-4 py-16">
      <motion.div
        className="text-center flex flex-col gap-3"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-5xl font-serif font-semibold tracking-tight">
          Pulse
        </h1>
        <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
          Autonomous penetration testing. LangGraph orchestrates specialised security
          agents running{" "}
          <span className="text-foreground font-medium">httpx</span>,{" "}
          <span className="text-foreground font-medium">nmap</span>,{" "}
          <span className="text-foreground font-medium">sqlmap</span>,{" "}
          <span className="text-foreground font-medium">dalfox</span>,{" "}
          <span className="text-foreground font-medium">semgrep</span>, and more.
        </p>
        <p className="text-xs text-muted-foreground">
          Powered by{" "}
          <span className="font-medium text-foreground">Ollama · OpenAI · Claude</span>
          {" "}— swappable via{" "}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">LLM_PROVIDER</code>
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="w-full max-w-xl"
      >
        <ScanForm />
      </motion.div>

      <motion.p
        className="text-xs text-muted-foreground text-center max-w-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        Scanning restricted to allowlisted targets.{" "}
        Default:{" "}
        <code className="bg-muted px-1 py-0.5 rounded">target · localhost · 127.0.0.1</code>
      </motion.p>
    </main>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const EXAMPLE_TARGETS = [
  "http://target:3000",
  "http://localhost:3001",
  "https://github.com/vercel/next.js",
];

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
    <form onSubmit={handleSubmit} className="w-full relative group">
      <div className="absolute -inset-0.5 bg-linear-to-r from-purple-500/30 to-blue-500/30 rounded-xl blur opacity-75 group-hover:opacity-100 transition duration-500" />
      <div className="relative flex items-center bg-[#0a0a0a] border border-white/10 rounded-xl overflow-hidden shadow-2xl">
        <div className="pl-4 pr-3 py-4 text-white/40 font-mono text-sm">
          &gt;
        </div>
        <input
          type="text"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="http://target:3000   or   https://github.com/owner/repo"
          className="flex-1 bg-transparent border-none text-white px-2 py-4 outline-none placeholder:text-white/20 font-mono text-sm"
        />
        <div className="pr-2">
          <Button
            type="submit"
            disabled={loading}
            className="bg-white text-black hover:bg-white/90 font-medium px-6 py-5 rounded-lg h-auto"
          >
            {loading ? "Initializing..." : "Run Autopilot"}
          </Button>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/40">
        <span>Try:</span>
        {EXAMPLE_TARGETS.map((t) => (
          <button
            key={t}
            type="button"
            className="hover:text-purple-400 focus:text-purple-400 font-mono transition-colors"
            onClick={() => setTarget(t)}
          >
            {t}
          </button>
        ))}
      </div>
    </form>
  );
}

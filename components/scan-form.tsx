"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const EXAMPLE_TARGETS = [
  "http://localhost:3001",
];

export function ScanForm() {
  const router = useRouter();
  const [target, setTarget] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!target.trim()) {
      toast.error("Please enter a target URL or repository path");
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
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex items-stretch gap-4">
        <div className="relative group flex-1">
          <div className="absolute -inset-0.5 bg-linear-to-r from-purple-500/30 to-blue-500/30 rounded-xl blur opacity-75 group-hover:opacity-100 transition duration-500" />
          <div className="relative flex items-center bg-[#0a0a0a] border border-white/10 rounded-xl overflow-hidden shadow-2xl">
            <div className="pl-3 pr-2 py-3.5 text-white/40 font-mono text-sm shrink-0">
              &gt;
            </div>
            <input
              type="text"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="http://target:3000   or   /repos/my-app"
              className="flex-1 min-w-0 bg-transparent border-none text-white px-2 py-3.5 outline-none placeholder:text-white/20 font-mono text-sm"
            />
          </div>
        </div>
        <Button
          type="submit"
          disabled={loading}
          className="bg-white text-black hover:bg-white/90 font-medium text-sm px-4 rounded-lg h-11 shrink-0 whitespace-nowrap self-center"
        >
          {loading ? "Running..." : "Run"}
        </Button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/40">
        <span>Try:</span>
        {EXAMPLE_TARGETS.map((t) => (
          <button
            key={t}
            type="button"
            className="cursor-pointer hover:text-purple-400 focus:text-purple-400 font-mono transition-colors"
            onClick={() => setTarget(t)}
          >
            {t}
          </button>
        ))}
      </div>
    </form>
  );
}

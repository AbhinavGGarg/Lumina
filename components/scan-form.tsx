"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const EXAMPLE_TARGETS = [
  "http://target:3000",
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
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">New Scan</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground/80">
              Target URL or repository path
            </label>
            <input
              type="text"
              value={target}
              onChange={e => setTarget(e.target.value)}
              placeholder="http://target:3000 or /repos/my-app"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 placeholder:text-muted-foreground"
            />
            <p className="text-xs text-muted-foreground">
              Examples:{" "}
              {EXAMPLE_TARGETS.map((t, i) => (
                <span key={t}>
                  <button
                    type="button"
                    className="underline underline-offset-2 hover:text-foreground transition-colors"
                    onClick={() => setTarget(t)}
                  >
                    {t}
                  </button>
                  {i < EXAMPLE_TARGETS.length - 1 ? " · " : ""}
                </span>
              ))}
            </p>
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Starting scan…" : "▶ Start Scan"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

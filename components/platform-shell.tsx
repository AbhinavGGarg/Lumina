import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PlatformShellProps {
  children: ReactNode;
  className?: string;
}

export function PlatformShell({ children, className }: PlatformShellProps) {
  return (
    <div
      className={cn(
        "relative min-h-screen overflow-hidden text-white selection:bg-cyan-400/25",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute inset-0 grid-overlay opacity-[0.08]" />
        <div className="absolute inset-0 bg-[radial-gradient(960px_520px_at_15%_0%,rgba(56,189,248,0.16),transparent_65%),radial-gradient(860px_420px_at_88%_12%,rgba(139,92,246,0.16),transparent_62%),radial-gradient(820px_420px_at_55%_100%,rgba(16,185,129,0.14),transparent_62%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#070e1b]/48 to-[#06080f]/90" />
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}

interface SectionHeadingProps {
  kicker: string;
  title: string;
  description?: string;
  className?: string;
}

export function SectionHeading({
  kicker,
  title,
  description,
  className,
}: SectionHeadingProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span className="section-kicker">{kicker}</span>
      <h2 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
        {title}
      </h2>
      {description ? (
        <p className="max-w-3xl text-sm leading-relaxed text-slate-300/85 md:text-base">
          {description}
        </p>
      ) : null}
    </div>
  );
}

interface GlassPanelProps {
  children: ReactNode;
  className?: string;
}

export function GlassPanel({ children, className }: GlassPanelProps) {
  return <div className={cn("surface-panel", className)}>{children}</div>;
}

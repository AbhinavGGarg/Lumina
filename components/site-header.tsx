"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SiteHeader() {
  const pathname = usePathname();

  if (pathname === "/") {
    return null;
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/8 bg-[#0a0a0a]/90 backdrop-blur-md">
      <div className="page-shell">
        <div className="page-container flex h-16 items-center">
          <Link
            href="/"
            className="font-serif text-2xl tracking-tight text-white/95 transition-opacity hover:opacity-80"
          >
            Pulse
          </Link>
        </div>
      </div>
    </header>
  );
}

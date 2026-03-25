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
            className="inline-flex items-center gap-1.5 font-serif text-[28px] leading-none tracking-tight text-white/95 transition-opacity hover:opacity-80"
          >
            <span className="relative inline-flex h-10 w-10 items-center justify-center overflow-hidden">
              <img
                src="/image.png?v=2"
                alt="Lumina logo"
                width={32}
                height={32}
                className="h-8 w-8 object-contain"
              />
            </span>
            <span>Lumina</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

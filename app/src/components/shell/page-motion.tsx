"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Gives every authenticated route one short entrance. The pathname key remounts
 * the page on navigation, which replays the CSS entrance (`.app-page-motion` in
 * globals.css, Design-System §7).
 *
 * CSS, not GSAP (2026-11-12): pages stream in behind `(app)/loading.tsx`, and
 * GSAP wrote inline `style` onto server HTML before React hydrated it, which
 * React reports as a hydration mismatch. A CSS animation never touches the
 * markup, and it plays when streamed content is inserted — the right moment.
 */
export function PageMotion({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="app-page-motion min-w-0">
      {children}
    </div>
  );
}

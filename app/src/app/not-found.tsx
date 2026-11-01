import { ArrowRight } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Page not found" };

const WAYS_OUT = [
  { href: "/tracker", label: "Tracker" },
  { href: "/work-logs", label: "Today's work log" },
  { href: "/notes", label: "Notes" },
  { href: "/", label: "Homepage" },
];

/**
 * Branded 404 (Ocean, 2026-11-01): "Lost at sea." beside numbered ways out,
 * over a soft wave. Signed-out visitors are sent to sign in by the app routes
 * themselves.
 */
export default function NotFound() {
  return (
    // `app-shell` so the 404 uses the workspace palette and the ocean background.
    <div className="app-shell flex min-h-dvh flex-col overflow-hidden">
      <header className="px-4 py-5 md:px-10 md:py-6">
        <Link href="/tracker" className="app-brand">
          <span className="app-mark" aria-hidden="true">W</span>
          WorkNest
        </Link>
      </header>
      <main id="main" className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-4 py-8 md:px-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-16">
        <div className="t-reveal">
          <p className="font-mono text-sm text-primary">Error 404</p>
          <h1 className="mt-3 text-[clamp(3.5rem,9vw,8rem)] leading-[0.9] font-extrabold tracking-[-0.06em] text-text" style={{ fontFamily: "var(--font-heading)" }}>
            Lost<br /><span className="ocean-text">at sea.</span>
          </h1>
          <p className="mt-6 max-w-[40ch] text-lg text-text-muted">
            This link may be old or the page moved. Your work logs, tracker and notes are where you left them.
          </p>
        </div>
        <nav aria-label="Go somewhere" className="border-t border-[var(--c-tk-rule)]">
          {WAYS_OUT.map((way, index) => (
            <Link key={way.href} href={way.href} className="group flex min-h-16 items-center gap-4 border-b border-[var(--c-tk-rule)] px-1 text-lg text-text transition-colors duration-150 hover:bg-surface/60">
              <span className="font-mono text-sm text-text-subtle">0{index + 1}</span>
              <span className="flex-1 font-semibold">{way.label}</span>
              <ArrowRight className="size-5 transition-transform duration-150 group-hover:translate-x-1" aria-hidden="true" />
            </Link>
          ))}
        </nav>
      </main>
      <svg aria-hidden="true" viewBox="0 0 1440 160" preserveAspectRatio="none" className="ocean-wave block h-28 w-full md:h-36">
        <path d="M0 80 C 240 20 480 140 720 80 C 960 20 1200 140 1440 70 L1440 160 L0 160 Z" />
        <path d="M0 110 C 300 60 600 160 900 110 C 1140 70 1300 130 1440 105 L1440 160 L0 160 Z" />
      </svg>
    </div>
  );
}

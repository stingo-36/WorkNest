import { ArrowLeft, Compass } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Page not found" };

/**
 * Branded 404. Two ways out: back into the app (signed-out visitors are sent
 * to sign in by the app routes themselves) or to the homepage.
 */
export default function NotFound() {
  return (
    // `app-shell` so the 404 uses the workspace palette (navy button, teal tints).
    <div className="app-shell">
    <main id="main" className="grid min-h-dvh place-items-center bg-bg px-4 py-16">
      <div className="t-reveal flex max-w-md flex-col items-center text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-sidebar text-sidebar-fg shadow-sm" aria-hidden="true">
          <Compass className="size-7" />
        </span>
        <p className="mt-6 text-sm font-semibold tracking-[0.08em] text-text-muted uppercase">Error 404</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-balance text-text lg:text-4xl">This page doesn&apos;t exist</h1>
        <p className="mt-3 text-base text-pretty text-text-muted">
          The link may be old, or the item was deleted. Your work logs, tracker and notes are where you left them.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/tracker" className={buttonVariants({ size: "lg" })}>
            Go to Tracker
          </Link>
          <Link href="/" className={buttonVariants({ variant: "secondary", size: "lg" })}>
            <ArrowLeft aria-hidden="true" />
            Homepage
          </Link>
        </div>
      </div>
    </main>
    </div>
  );
}

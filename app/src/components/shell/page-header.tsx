import type { ReactNode } from "react";

import { cn } from "@/components/cn";

/**
 * Page title row (Design-System.md §5). The h1 is 24px → 30px from lg, SemiBold
 * (600), tracked -0.03em: hierarchy comes from weight and colour, not raw scale
 * (Linear headline ≈ 28/600). 24px (`mb-6`) separates it from the page body —
 * the same gap every page uses (pages that lay out with `gap-6` pass `mb-0`).
 */
export function PageHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  /** A sentence — or a status line with links (the Tracker's "what needs you"). */
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between",
        className,
      )}
    >
      <div className="t-reveal min-w-0">
        <h1 className="text-3xl font-semibold tracking-[-0.03em] text-balance text-text lg:text-4xl">{title}</h1>
        {/* A plain sentence is a real <p>; a status line with its own markup stays a <div>. */}
        {typeof description === "string" ? (
          <p className="mt-1.5 max-w-[65ch] text-base leading-relaxed text-pretty text-text-muted">{description}</p>
        ) : description ? (
          <div className="mt-1.5 max-w-[65ch] text-base leading-relaxed text-pretty text-text-muted">{description}</div>
        ) : null}
      </div>
      {action ? <div className="motion-page-enter shrink-0">{action}</div> : null}
    </div>
  );
}

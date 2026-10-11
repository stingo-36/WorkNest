import type { LucideIcon } from "lucide-react";
import * as React from "react";

import { cn } from "@/components/cn";

/**
 * Empty state — the icon sits in a tinted, ringed tile so the state reads as
 * designed rather than blank; one title line, optional hint, one action.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "motion-page-enter flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="mb-1 grid size-12 place-items-center rounded-2xl bg-card-tint text-primary ring-4 ring-card-tint/50"
      >
        <Icon className="size-5" />
      </span>
      <p className="text-lg font-semibold tracking-tight text-text">{title}</p>
      {description ? (
        <p className="max-w-[52ch] text-md text-text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

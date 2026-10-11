import type { ReactNode } from "react";

import { cn } from "@/components/cn";

/** Card header bar for the work-log editor sections (title + count pill). */
export function SectionHeading({
  id,
  title,
  count,
  countLabel,
  action,
  className,
}: {
  id?: string;
  title: string;
  count?: number;
  countLabel?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("wl-card-head", className)}>
      <h2 id={id} className="flex flex-wrap items-center gap-2 text-base font-semibold text-text">
        {title}
        {typeof count === "number" ? (
          <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-xs font-medium text-text-muted tabular-nums">
            {count}
            {countLabel ? ` ${countLabel}` : ""}
          </span>
        ) : null}
      </h2>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

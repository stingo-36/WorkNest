import { Check } from "lucide-react";
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

/**
 * Numbered step header for the day page (2026-11-18 redesign): a number that
 * turns into a tick when the step is done, the title, and a one-line prompt.
 */
export function StepHeading({
  id,
  step,
  done = false,
  icon,
  title,
  hint,
  aside,
}: {
  id: string;
  /** Shown in the circle; omit and pass `icon` for an optional step. */
  step?: number;
  done?: boolean;
  icon?: ReactNode;
  title: string;
  hint?: string;
  /** Right-aligned extra (a count, a link). */
  aside?: ReactNode;
}) {
  return (
    <div className="wl-step-head">
      <h2 id={id} className="flex min-w-0 items-center gap-2.5 text-base font-semibold text-text">
        <span className={cn("wl-step-num", done && "is-done")} aria-hidden="true">
          {done ? <Check className="size-3.5" strokeWidth={3} /> : step ?? icon}
        </span>
        {title}
        {done ? <span className="sr-only"> — done</span> : null}
      </h2>
      {aside ? <div className="shrink-0">{aside}</div> : null}
      {hint ? <p className="wl-step-hint">{hint}</p> : null}
    </div>
  );
}

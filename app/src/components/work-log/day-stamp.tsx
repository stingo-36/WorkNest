import { cn } from "@/components/cn";

/**
 * Calendar-style date for sprint tiles: a large day number with the weekday
 * and month stacked beside it. `tone` follows the tile it sits on.
 */
export function DayStamp({
  day,
  weekday,
  month,
  tone = "default",
}: {
  day: string;
  weekday: string;
  month: string;
  tone?: "default" | "inverse" | "faded";
}) {
  return (
    <span className="flex items-center gap-2.5">
      <span
        className={cn(
          "text-4xl font-bold leading-none tracking-[-0.04em] tabular-nums",
          tone === "inverse" ? "text-primary-fg" : tone === "faded" ? "text-text-subtle" : "text-text",
        )}
      >
        {day}
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className={cn("truncate text-sm font-semibold", tone === "inverse" ? "text-primary-fg" : tone === "faded" ? "text-text-subtle" : "text-text")}>{weekday}</span>
        <span className={cn("text-xs font-medium uppercase tracking-[0.08em]", tone === "inverse" ? "text-primary-fg" : "text-text-subtle")}>{month}</span>
      </span>
    </span>
  );
}

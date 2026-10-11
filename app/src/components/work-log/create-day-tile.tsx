"use client";

import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { openWorkLogForDate } from "@/actions/worklog";
import { cn } from "@/components/cn";
import { toast } from "@/components/ui/toast";
import { DayStamp } from "@/components/work-log/day-stamp";

/**
 * An empty past/today day in the sprint calendar. Clicking it creates that
 * day's work log and opens the editor. A button, not a link: creating on a GET
 * would let link prefetching make logs nobody asked for.
 */
export function CreateDayTile({
  date,
  weekday,
  day,
  month,
  longLabel,
  isToday,
  variant = "tile",
}: {
  /** YYYY-MM-DD */
  date: string;
  weekday: string;
  day: string;
  month: string;
  longLabel: string;
  isToday: boolean;
  /** `row`: a slim dashed bar for the Work Logs timeline (2026-10-08). */
  variant?: "tile" | "row";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function create() {
    startTransition(async () => {
      const result = await openWorkLogForDate({ date });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      router.push(`/work-logs/${result.data.id}/edit`);
    });
  }

  if (variant === "row") {
    return (
      <button
        type="button"
        onClick={create}
        disabled={pending}
        aria-label={`Create a work log for ${longLabel}`}
        className={cn(
          "flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xl border-[1.5px] border-dashed px-4 text-left text-sm font-semibold transition-colors duration-150",
          "hover:border-solid hover:border-primary hover:bg-primary-subtle hover:text-accent-text disabled:cursor-wait",
          isToday ? "border-primary text-accent-text" : "border-border-strong text-text-muted",
        )}
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
        {pending ? "Creating…" : isToday ? "Start today's log" : "No log — add one"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={create}
      disabled={pending}
      aria-label={`Create a work log for ${longLabel}`}
      className={cn(
        "group flex h-full min-h-28 w-full cursor-pointer flex-col gap-2 rounded-xl border border-dashed p-3 text-left",
        "transition-[border-color,background-color,transform,box-shadow] duration-150",
        "hover:-translate-y-0.5 hover:border-solid hover:border-primary hover:bg-primary-subtle",
        "focus-visible:border-solid focus-visible:border-primary disabled:cursor-wait",
        isToday ? "border-2 border-primary" : "border-border-strong",
      )}
    >
      <DayStamp day={day} weekday={weekday} month={month} />
      <span className={cn("mt-auto inline-flex items-center gap-1.5 text-xs font-semibold", isToday ? "text-accent-text" : "text-text-muted group-hover:text-accent-text")}>
        {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Plus className="size-3.5" aria-hidden="true" />}
        {pending ? "Creating…" : isToday ? "Start today's log" : "No log — add one"}
      </span>
    </button>
  );
}

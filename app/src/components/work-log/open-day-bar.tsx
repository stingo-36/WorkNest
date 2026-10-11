"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { openWorkLogForDate } from "@/actions/worklog";
import { DAY_LABEL, type DayType } from "@/components/work-log/day-type";
import { toast } from "@/components/ui/toast";

/** A day with no log yet: start it, or mark it as a day off. */
export function EmptyDayActions({ date, isToday }: { date: string; isToday: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(dayType: DayType) {
    startTransition(async () => {
      const result = await openWorkLogForDate({ date, dayType });
      if (!result.ok) { toast.error(result.error.message); return; }
      if (dayType === "Work") { router.push(`/work-logs/${result.data.id}/edit`); return; }
      toast.success(`${DAY_LABEL[dayType]} marked`);
      router.refresh();
    });
  }

  const ghost = "inline-flex h-11 cursor-pointer items-center rounded-full border border-border bg-surface px-4 text-sm whitespace-nowrap font-semibold text-text transition-colors duration-150 hover:bg-surface-2 disabled:cursor-wait disabled:opacity-60 md:h-10";
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <button type="button" disabled={pending} onClick={() => run("Work")} className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-sidebar px-4 text-sm whitespace-nowrap font-semibold text-sidebar-fg transition-colors duration-150 hover:bg-sidebar-3 disabled:cursor-wait disabled:opacity-60 md:h-10">
        {isToday ? "Start today's log" : "Start log"}
        <ArrowRight className="size-4" aria-hidden="true" />
      </button>
      <button type="button" disabled={pending} onClick={() => run("Holiday")} className={ghost}>Mark holiday</button>
      <button type="button" disabled={pending} onClick={() => run("Leave")} className={ghost}>Mark leave</button>
    </div>
  );
}

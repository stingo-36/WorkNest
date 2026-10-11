"use client";

import { ArrowRight, CalendarPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { openWorkLogForDate, updateWorkLog } from "@/actions/worklog";
import { DAY_LABEL, type DayType } from "@/components/work-log/day-type";
import { DayTypeToggle } from "@/components/work-log/day-type-toggle";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

/** Today's date as YYYY-MM-DD (local), the latest date that can be logged. */
function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function localDateKey() {
  const date = new Date();
  const day = date.getDay();
  if (day === 0) date.setDate(date.getDate() - 2);
  if (day === 6) date.setDate(date.getDate() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isWeekend(dateKey: string) {
  if (!dateKey) return false;
  const day = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return day === 0 || day === 6;
}

export function CreateWorkLogForm({
  existingLogs = [],
  today,
}: {
  existingLogs?: Array<{ id: string; date: string }>;
  /** Pre-formatted on the server so the labels can't drift on hydration. */
  today: { day: string; weekday: string; monthYear: string };
}) {
  const router = useRouter();
  const [date, setDate] = useState(localDateKey);
  const [dayType, setDayType] = useState<DayType>("Work");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const existingLog = existingLogs.find((log) => log.date === date);
  const weekend = isWeekend(date);
  const future = date > todayKey();

  function create() {
    if (!date) {
      setError("Choose a date");
      return;
    }
    if (existingLog) {
      // Marking an already-logged day as Holiday / Leave updates that log.
      if (dayType !== "Work") {
        startTransition(async () => {
          const result = await updateWorkLog({ workLogId: existingLog.id, dayType });
          if (!result.ok) { setError(result.error.message); return; }
          toast.success(`${DAY_LABEL[dayType]} marked for ${date}`);
          router.refresh();
        });
        return;
      }
      router.push(`/work-logs/${existingLog.id}/edit`);
      toast.success("Opening existing work log");
      return;
    }
    if (future) {
      setError("You can't log a future date");
      return;
    }
    if (weekend) {
      setError("Work logs can only be created on weekdays");
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const result = await openWorkLogForDate({ date, dayType });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      if (dayType !== "Work") {
        // Nothing to fill in for a day off — record it and stay on the list.
        toast.success(`${DAY_LABEL[dayType]} marked for ${date}`);
        setDayType("Work");
        router.refresh();
        return;
      }
      toast.success("Work log ready");
      router.push(`/work-logs/${result.data.id}/edit`);
    });
  }

  return (
    // Compact on purpose: header row + one row of fields on wide screens, so the
    // form and the sprint timeline below it fit in a single viewport.
    <section id="create-work-log" aria-labelledby="create-work-log-heading" className="wl-card motion-page-enter scroll-mt-20 flex min-w-0 flex-col gap-4 p-4 md:p-5">
      <div className="flex items-center gap-3">
        {/* Today, as a small navy date badge (was a full-height panel). */}
        <span className="wl-hero flex h-12 shrink-0 items-center gap-2.5 rounded-xl px-3">
          <span className="text-3xl leading-none font-bold tracking-[-0.04em] text-text tabular-nums">{today.day}</span>
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-text">{today.weekday}</span>
            <span className="text-xs text-text-muted">{today.monthYear}</span>
          </span>
        </span>
        <div className="min-w-0">
          <h2 id="create-work-log-heading" className="flex items-center gap-2 text-lg font-semibold tracking-[-0.015em] text-text">
            <CalendarPlus className="size-4 text-accent-text" aria-hidden="true" />
            Create a work log
          </h2>
          <p className="text-sm text-text-muted">Pick a weekday. Log a work day, or mark it as a holiday or leave.</p>
        </div>
      </div>

      {/* No title here (2026-10-08): it's set in the editor, where there's room for it. */}
      <div className="grid gap-3 md:grid-cols-[11rem_minmax(0,1fr)] md:items-end xl:grid-cols-[11rem_minmax(0,1fr)_auto]">
        <Field label="Date" htmlFor="new-work-log-date" required>
          <Input id="new-work-log-date" type="date" max={todayKey()} value={date} aria-invalid={error ? true : undefined} aria-describedby="new-work-log-date-help" onChange={(event) => { setDate(event.target.value); setError(undefined); }} />
        </Field>
        <div className="flex min-w-0 flex-col gap-2">
          <span id="new-work-log-day-type-label" className="text-sm font-semibold text-text">Day type</span>
          <DayTypeToggle name="new-work-log-day-type" labelledBy="new-work-log-day-type-label" value={dayType} onChange={setDayType} />
        </div>
        <Button className="whitespace-nowrap md:col-span-2 xl:col-span-1" onClick={create} loading={pending} disabled={future || (weekend && !existingLog)}>
          {dayType !== "Work" ? `Mark ${DAY_LABEL[dayType].toLowerCase()}` : existingLog ? "Open log" : "Create log"}
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>

      <div>
        <p id="new-work-log-date-help" className="text-xs text-text-subtle">Weekdays up to today — future dates can&apos;t be logged. Existing dates open the saved log.</p>
        {error ? <p className="mt-2 text-sm text-danger" role="alert">{error}</p> : null}
      </div>
    </section>
  );
}

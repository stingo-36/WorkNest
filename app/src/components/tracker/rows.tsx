"use client";

import { CalendarDays } from "lucide-react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { ActionPill, DeleteEntry, DoneCircle, FavouriteToggle, LatestLine, NudgePill, Row, type TrackerEntry, ago, dayLabel, followStateOf, fromToday, isOpen, markDone, markOpen, needsYou, plural } from "@/components/tracker/kit";

/** "Overdue · due Thu 8 Oct · 2 days late", "Due Tue 13 Oct · in 3 days", "Someday · no date". */
function todoMeta(entry: TrackerEntry, today: string) {
  if (!isOpen(entry)) return entry.completedAt ? `Done ${format(parseISO(entry.completedAt), "EEE d MMM")}` : "Done";
  if (!entry.dueDate) return "Someday · no date";
  if (entry.dueDate < today) return `Overdue · due ${dayLabel(entry.dueDate)} · ${fromToday(entry.dueDate, today, "late")}`;
  if (entry.dueDate === today) return "Due today";
  return `Due ${dayLabel(entry.dueDate)} · ${fromToday(entry.dueDate, today, "late")}`;
}

/**
 * A to-do row (mockup, 2026-11-14): tick, title, then a line with a red
 * "3 days late" / "Due today" badge, the due date and the ticket. The calendar
 * button opens the to-do to move its date; delete shows on hover.
 */
export function TodoRow({ entry, today, mode, highlight = false, onOpen }: { entry: TrackerEntry; today: string; mode: "today" | "upcoming" | "done"; highlight?: boolean; onOpen: () => void }) {
  const late = isOpen(entry) && entry.dueDate && entry.dueDate < today ? differenceInCalendarDays(parseISO(today), parseISO(entry.dueDate)) : 0;
  const due = !isOpen(entry)
    ? todoMeta(entry, today)
    : entry.dueDate ? (entry.dueDate === today ? null : `Due ${dayLabel(entry.dueDate)}`) : "No date";
  return (
    <Row
      muted={mode === "done"}
      highlight={highlight}
      leading={<DoneCircle entry={entry} />}
      title={entry.subject}
      onOpen={onOpen}
      meta={
        <p className="tk-row-meta" suppressHydrationWarning>
          {late ? <span className="tk-badge" data-tone="late">{late} {plural(late, "day")} late</span> : null}
          {isOpen(entry) && entry.dueDate === today ? <span className="tk-badge" data-tone="today">Due today</span> : null}
          {due ? <span>{due}</span> : null}
          {entry.ticketKey ? <span>{entry.ticketKey}</span> : null}
          {entry.personal ? <span>Personal</span> : null}
        </p>
      }
      actions={
        <>
          <DeleteEntry entry={entry} />
          {isOpen(entry) ? (
            <button type="button" onClick={onOpen} aria-label={`Change date: ${entry.subject}`} title="Change date" className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-text-subtle transition-colors duration-150 hover:bg-surface-2 hover:text-text">
              <CalendarDays className="size-4.5" strokeWidth={1.8} aria-hidden="true" />
            </button>
          ) : null}
          <FavouriteToggle entry={entry} />
        </>
      }
    />
  );
}

/** "· time to ping since Wed 7 Oct · 3 days ago", "· replied 2d ago", "· you wrote 3d ago via Slack · ping Tue 13 Oct". */
function followMeta(entry: TrackerEntry, today: string) {
  const state = followStateOf(entry);
  const last = entry.updates[0];
  if (state === "closed") return entry.completedAt ? `closed ${ago(entry.completedAt, today)}` : "closed";
  if (state === "replied") return `replied ${ago(last!.occurredAt, today)}`;
  if (entry.dueDate && entry.dueDate <= today) return `time to ping since ${dayLabel(entry.dueDate)} · ${fromToday(entry.dueDate, today, "ago")}`;
  const wrote = last ? `you wrote ${ago(last.occurredAt, today)}${last.channel ? ` via ${last.channel}` : ""}` : `added ${ago(entry.createdAt, today)}`;
  return entry.dueDate ? `${wrote} · ping ${dayLabel(entry.dueDate)}` : wrote;
}

/** Eyebrow "TIME TO PING · ASHWINI" over the title; compact (upcoming / finished) = tick + title + person. */
/** `inGroup`: the row sits under a group that already names its state (Follow-ups tab), so the eyebrow is just the person. */
export function FollowUpRow({ entry, today, compact = false, inGroup = false, onOpen }: { entry: TrackerEntry; today: string; compact?: boolean; inGroup?: boolean; onOpen: () => void }) {
  const state = followStateOf(entry);
  const person = entry.person ?? "Someone";
  const needs = needsYou(entry, today);
  if (compact) {
    return (
      <Row
        muted={state === "closed"}
        leading={<DoneCircle entry={entry} />}
        title={entry.subject}
        onOpen={onOpen}
        meta={<LatestLine entry={entry} />}
        actions={<><span className="text-sm text-text-muted">{person}</span><DeleteEntry entry={entry} /></>}
      />
    );
  }
  const status = state === "closed" ? "Closed" : state === "replied" ? "Replied" : needs ? "Time to ping" : entry.dueDate ? `Ping ${dayLabel(entry.dueDate)}` : "Waiting on them";
  return (
    <Row
      // Wide: the text keeps its width and the buttons drop below it in a narrow column.
      wide
      muted={state === "closed"}
      needs={needs}
      eyebrow={inGroup ? person : `${status} · ${person}`}
      leading={<span className="tk-avatar tk-avatar-sm" aria-hidden="true">{person.trim().charAt(0).toUpperCase()}</span>}
      title={entry.subject}
      onOpen={onOpen}
      meta={
        <>
          <LatestLine entry={entry} />
          {!needs && state !== "closed" ? <p className="text-sm text-text-muted" suppressHydrationWarning>{followMeta(entry, today)}</p> : null}
        </>
      }
      actions={
        <>
          <DeleteEntry entry={entry} />
          {state === "closed" ? (
            <ActionPill label="Reopen" action={markOpen(entry)} success="Reopened" />
          ) : state === "replied" ? (
            <ActionPill ink label="Done" action={markDone(entry)} success="Closed" />
          ) : needs ? (
            <NudgePill entry={entry} ink />
          ) : (
            <>
              <NudgePill entry={entry} ink={false} />
              <ActionPill label="Done" action={markDone(entry)} success="Closed" />
            </>
          )}
        </>
      }
    />
  );
}

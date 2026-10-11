import "server-only";

import { format } from "date-fns";

import type { listTrackerForRange } from "@/lib/follow-ups";

type TrackerEntry = Awaited<ReturnType<typeof listTrackerForRange>>[number];

/** The Tracker as it stood on one day. */
export type DayTracker = {
  /** done = finished that day; due = due that day, still open; overdue = due earlier, still open; added = created that day. */
  todos: Array<{ id: string; subject: string; state: "done" | "due" | "overdue" | "added"; pinned: boolean; due: string | null }>;
  followUps: Array<{ id: string; person: string | null; subject: string; note: string | null; fromThem: boolean; ticketKey: string | null; done: boolean }>;
  notes: Array<{ id: string; subject: string; note: string | null; tags: string[] }>;
};

/**
 * Sorts Tracker entries (from `listTrackerForRange`) into one day: the Work Logs
 * day card and the AI summary both read this, so they always agree.
 * `dayOf` maps a timestamp to the viewer's calendar day ("YYYY-MM-DD").
 */
export function trackerOnDay(entries: TrackerEntry[], key: string, dayOf: (date: Date) => string): DayTracker {
  // `dueDate` is a date column (UTC midnight), so its ISO prefix is the calendar day.
  const dueOf = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);
  const todos: DayTracker["todos"] = [];
  const followUps: DayTracker["followUps"] = [];
  const notes: DayTracker["notes"] = [];
  for (const entry of entries) {
    const created = dayOf(entry.createdAt) === key;
    const latest = entry.updates.filter((update) => dayOf(update.occurredAt) === key).at(-1);
    if (entry.kind === "Task") {
      const due = dueOf(entry.dueDate);
      const completed = entry.completedAt ? dayOf(entry.completedAt) : null;
      const openAtEnd = !completed || completed > key;
      const state = completed === key ? "done" : due && openAtEnd && due < key ? "overdue" : due === key && openAtEnd ? "due" : created ? "added" : null;
      if (state) todos.push({ id: entry.id, subject: entry.subject, state, pinned: entry.pinned, due: state === "overdue" && due ? format(new Date(`${due}T00:00:00`), "d MMM") : null });
    } else if (created || latest) {
      if (entry.kind === "FollowUp") followUps.push({ id: entry.id, person: entry.person, subject: entry.subject, note: latest?.note ?? null, fromThem: latest?.fromThem ?? false, ticketKey: entry.ticketKey, done: entry.status === "Done" });
      else notes.push({ id: entry.id, subject: entry.subject, note: latest?.note ?? null, tags: entry.tags });
    }
  }
  return { todos, followUps, notes };
}

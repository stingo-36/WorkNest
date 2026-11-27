import { addBusinessDays, format, parseISO } from "date-fns";

import { isStatusNote } from "@/lib/rich-text";

/**
 * Every rule about what state a Tracker entry is in, in one place (2026-11-27).
 * The Tracker board, Ask, the Kaizen phone API and the Tracker reads in
 * `lib/follow-ups.ts` all ask this module instead of working it out themselves.
 *
 * Pure and shared by client and server: no `server-only`, no React, no
 * database, and it never reads the clock — callers pass `today`. Words follow
 * GLOSSARY.md (Your turn, Time to ping, Waiting on them, Needs you, Reminder).
 *
 * Dates may be `Date`s (Prisma rows) or ISO strings (the serialised board
 * entry); a calendar day is always the UTC "YYYY-MM-DD" prefix, the shape of a
 * `@db.Date` column, so client and server agree.
 */

/** How long after your last message a follow-up comes back as Time to ping when its own Reminder is out of date. */
export const PING_AFTER_WORKDAYS = 2;

export type TrackerTab = "todo" | "followups" | "personal" | "notes" | "archived";
export type FollowState = "your-turn" | "time-to-ping" | "waiting-on-them" | "closed";

type Moment = Date | string;

type RuleUpdate = { fromThem: boolean; occurredAt: Moment; note: string; doc?: unknown };

/** What the rules read from an entry. `updates` must be newest first. */
export type RuleEntry = {
  kind: string;
  status: string;
  personal?: boolean;
  /** The stored or the already-effective Reminder / due day: both read the same (see `reminderOf`). */
  dueDate: Moment | null;
  archivedAt?: Moment | null;
  updates: ReadonlyArray<RuleUpdate>;
};

/** Everything derived about one entry on `today`. */
export type Reading = {
  open: boolean;
  /** Follow-ups only. */
  follow: FollowState | null;
  /** Who wrote the newest update; null when there is none. */
  spokeLast: "you" | "them" | null;
  /** A late or due-today to-do, or a follow-up in Your turn or Time to ping. Notes never need you. */
  needsYou: boolean;
  /** The day it started needing you: their reply's day, else the Reminder / due day. */
  neededSince: string | null;
  /** The Reminder / due day the entry actually runs on, "YYYY-MM-DD". */
  reminder: string | null;
  /** On the Archived tab: put away with Archive, or a note finished the old way (Done). */
  archived: boolean;
  /** The tab a link to this entry opens on. */
  tab: TrackerTab;
};

/** "YYYY-MM-DD" of a moment, UTC. */
function dayKey(moment: Moment) {
  return typeof moment === "string" ? moment.slice(0, 10) : moment.toISOString().slice(0, 10);
}

/** UTC midnight of a moment's calendar day — the shape of a `@db.Date` column. */
function utcDay(moment: Date) {
  return new Date(Date.UTC(moment.getUTCFullYear(), moment.getUTCMonth(), moment.getUTCDate()));
}

/**
 * The Reminder a follow-up actually runs on (2026-11-21). A Reminder dated on
 * or before the last thing you sent is out of date — you already chased them
 * after it (a follow-up added with a past Reminder sat in Needs you from day
 * one). Then the next ping is `PING_AFTER_WORKDAYS` working days after that
 * message. Anything else — no Reminder, a later Reminder, to-dos and notes —
 * is returned unchanged. Read-time only: the stored date is never rewritten.
 *
 * Applying it again to its own result changes nothing (the result is always
 * after the last sent day), so callers may pass an already-effective date.
 */
export function effectiveDueDate(entry: { kind: string; dueDate: Date | null; updates: ReadonlyArray<RuleUpdate> }): Date | null {
  if (entry.kind !== "FollowUp" || !entry.dueDate) return entry.dueDate;
  // "Marked done" / "Reopened" bookkeeping rows aren't messages.
  let sent: Date | null = null;
  for (const update of entry.updates) {
    if (update.fromThem || isStatusNote(update)) continue;
    const at = typeof update.occurredAt === "string" ? new Date(update.occurredAt) : update.occurredAt;
    if (!sent || at > sent) sent = at;
  }
  if (!sent) return entry.dueDate;
  const sentDay = utcDay(sent);
  if (entry.dueDate.getTime() > sentDay.getTime()) return entry.dueDate;
  return utcDay(addBusinessDays(sentDay, PING_AFTER_WORKDAYS));
}

/** `effectiveDueDate` applied to a row, keeping everything else (and the same object when nothing changes). */
export function withEffectiveDue<T extends { kind: string; dueDate: Date | null; updates: ReadonlyArray<RuleUpdate> }>(entry: T): T {
  const dueDate = effectiveDueDate(entry);
  return dueDate === entry.dueDate ? entry : { ...entry, dueDate };
}

/** The effective Reminder / due day of any entry, "YYYY-MM-DD". */
export function reminderOf(entry: Pick<RuleEntry, "kind" | "dueDate" | "updates">): string | null {
  if (!entry.dueDate) return null;
  const stored = typeof entry.dueDate === "string" ? new Date(`${dayKey(entry.dueDate)}T00:00:00.000Z`) : entry.dueDate;
  const effective = effectiveDueDate({ kind: entry.kind, dueDate: stored, updates: entry.updates });
  return effective ? dayKey(effective) : null;
}

/** Whoever spoke last decides it: derived from the newest update, never stored. */
export function spokeLast(entry: Pick<RuleEntry, "updates">): "you" | "them" | null {
  const newest = entry.updates[0];
  return newest ? (newest.fromThem ? "them" : "you") : null;
}

/** On the Archived tab: put away with Archive, or a note archived the old way (Done). */
export function isArchived(entry: Pick<RuleEntry, "kind" | "status" | "archivedAt">) {
  return Boolean(entry.archivedAt) || (entry.kind === "Note" && entry.status === "Done");
}

/** The day something started needing you: the reply's day, else the Reminder / due day. */
export function neededSince(entry: Pick<RuleEntry, "kind" | "status" | "dueDate" | "updates">): string | null {
  if (entry.kind === "FollowUp" && entry.status !== "Done" && spokeLast(entry) === "them") return dayKey(entry.updates[0]!.occurredAt);
  return reminderOf(entry);
}

/** The tab a link to the entry opens on. Only an explicit Archive sends it to Archived; an old Done note stays on Notes. */
export function tabOf(entry: Pick<RuleEntry, "kind" | "personal" | "archivedAt">): TrackerTab {
  if (entry.archivedAt) return "archived";
  if (entry.kind === "FollowUp") return "followups";
  if (entry.kind === "Note") return "notes";
  return entry.personal ? "personal" : "todo";
}

/** Everything WorkNest derives about one Tracker entry. Total and pure; never throws. */
export function readEntry(entry: RuleEntry, today: string): Reading {
  const open = entry.status !== "Done";
  const reminder = reminderOf(entry);
  const said = spokeLast(entry);
  let follow: FollowState | null = null;
  if (entry.kind === "FollowUp") {
    follow = !open ? "closed" : said === "them" ? "your-turn" : reminder && reminder <= today ? "time-to-ping" : "waiting-on-them";
  }
  const needsYou = !open
    ? false
    : entry.kind === "Task"
      ? Boolean(reminder && reminder <= today)
      : follow === "your-turn" || follow === "time-to-ping";
  return {
    open,
    follow,
    spokeLast: said,
    needsYou,
    neededSince: neededSince(entry),
    reminder,
    archived: isArchived(entry),
    tab: tabOf(entry),
  };
}

/** The Reminder a new "Waiting on" follow-up starts with: `PING_AFTER_WORKDAYS` working days after `from` ("YYYY-MM-DD"). */
export function nextReminder(from: string): string {
  return format(addBusinessDays(parseISO(from), PING_AFTER_WORKDAYS), "yyyy-MM-dd");
}

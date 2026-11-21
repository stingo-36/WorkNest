import { addBusinessDays } from "date-fns";

import { isStatusNote } from "@/lib/rich-text";

/** How long after your last message a follow-up comes back as "Time to ping" when its own reminder is out of date. */
export const PING_AFTER_WORKDAYS = 2;

type ReminderEntry = {
  kind: string;
  dueDate: Date | null;
  updates: Array<{ occurredAt: Date; fromThem: boolean; note: string; doc?: unknown }>;
};

/** UTC midnight of a moment's calendar day — the shape of a `@db.Date` column. */
function dayOf(moment: Date) {
  return new Date(Date.UTC(moment.getUTCFullYear(), moment.getUTCMonth(), moment.getUTCDate()));
}

/**
 * The reminder a follow-up actually runs on (2026-11-21). A reminder dated on
 * or before the last thing you sent is out of date — you already chased them
 * after it (a follow-up added with a past reminder sat in Needs you from day
 * one). Then the next ping is `PING_AFTER_WORKDAYS` working days after that
 * message. Anything else — no reminder, a later reminder, to-dos and notes —
 * is returned unchanged. Read-time only: the stored date is never rewritten.
 */
export function effectiveDueDate(entry: ReminderEntry): Date | null {
  if (entry.kind !== "FollowUp" || !entry.dueDate) return entry.dueDate;
  // "Marked done" / "Reopened" bookkeeping rows aren't messages.
  const sent = entry.updates
    .filter((update) => !update.fromThem && !isStatusNote(update))
    .reduce<Date | null>((latest, update) => (!latest || update.occurredAt > latest ? update.occurredAt : latest), null);
  if (!sent) return entry.dueDate;
  const sentDay = dayOf(sent);
  if (entry.dueDate.getTime() > sentDay.getTime()) return entry.dueDate;
  return dayOf(addBusinessDays(sentDay, PING_AFTER_WORKDAYS));
}

/** `effectiveDueDate` applied to a row, keeping everything else. */
export function withEffectiveDue<T extends ReminderEntry>(entry: T): T {
  const dueDate = effectiveDueDate(entry);
  return dueDate === entry.dueDate ? entry : { ...entry, dueDate };
}

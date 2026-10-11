import "server-only";

import { TICKET_STATUS_LABELS } from "@/components/ui/ticket-status-badge";
import type { DayType } from "@/components/work-log/day-type";
import type { DayTracker } from "@/lib/day-tracker";
import type { WorkflowStatus } from "@/lib/workflow-status";

/**
 * Prepares one work log for the AI (lib/ai-summary.ts): whether it has anything
 * to summarise, and the plain text the model reads for the summary and title.
 * Meetings are left out on purpose (owner, 2026-10-09); the day's Tracker
 * to-dos, follow-ups and notes are in. There is no non-AI summary.
 */

export type SummaryInput = {
  dayType: DayType;
  learningNotes: string;
  ticketUpdates: Array<{
    description: string;
    status: WorkflowStatus;
    ticket: { ticketId: string; title: string; projectName: string | null };
  }>;
  ticketsEnabled: boolean;
  /** The Tracker as it stood that day (same as the Work Logs day card). */
  tracker: DayTracker;
};

/** True when there's anything worth summarising. */
export function workLogHasContent(log: SummaryInput): boolean {
  if (log.dayType !== "Work") return false;
  const { todos, followUps, notes } = log.tracker;
  return Boolean(log.learningNotes.trim() || (log.ticketsEnabled && log.ticketUpdates.length) || todos.length || followUps.length || notes.length);
}

const TODO_HEADING = {
  done: "To-dos completed that day",
  due: "To-dos due that day, still open",
  overdue: "To-dos overdue and still open",
  added: "To-dos created that day",
} as const;

/** The whole log as plain text — what the AI reads. Unclipped. */
export function workLogAsText(log: SummaryInput): string {
  const tickets = log.ticketsEnabled ? log.ticketUpdates : [];
  const { todos, followUps, notes } = log.tracker;
  const bullets = (items: string[]) => items.map((item) => `- ${item}`).join("\n");
  return [
    tickets.length
      ? `Tickets\n${tickets
          .map((u) => `- ${u.ticket.ticketId} ${u.ticket.title}${u.ticket.projectName ? ` (${u.ticket.projectName})` : ""} [${TICKET_STATUS_LABELS[u.status]}]${u.description.trim() ? `\n  ${u.description.trim().replace(/\n/g, "\n  ")}` : ""}`)
          .join("\n")}`
      : "",
    log.learningNotes.trim() ? `Work done\n${log.learningNotes.trim()}` : "",
    ...(["done", "due", "overdue", "added"] as const).map((state) => {
      // Same-named entries (e.g. a re-added to-do) would read as a repeat; keep one.
      const items = [...new Set(todos.filter((todo) => todo.state === state).map((todo) => todo.subject))];
      return items.length ? `${TODO_HEADING[state]}\n${bullets(items)}` : "";
    }),
    followUps.length
      ? `Follow-ups that day\n${bullets(followUps.map((f) => `${f.person ?? "Someone"}: ${f.subject}${f.ticketKey ? ` (${f.ticketKey})` : ""}${f.note ? ` — ${f.fromThem ? "they replied" : "I said"}: ${f.note}` : ""}${f.done ? " [closed]" : ""}`))}`
      : "",
    notes.length ? `Notes that day\n${bullets(notes.map((n) => `${n.subject}${n.note ? ` — ${n.note}` : ""}`))}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

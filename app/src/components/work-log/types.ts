import type { DayType } from "@/components/work-log/day-type";
import type { WorkflowStatus } from "@/lib/workflow-status";

/**
 * Client-safe view models for the work log editor / detail screens.
 *
 * The Prisma include types live behind `server-only` modules, so the server
 * components map their rows into these plain shapes before handing them to the
 * client. Dates survive the RSC boundary, so they stay `Date`.
 *
 * **Naming trap, on purpose:** `ticketKey` is the human key (`ASU-1234`) that
 * `findTicket` / `upsertTicketForWorkLog` take. `id` is the cuid that
 * `saveTicketWorkUpdate` / `detachTicketFromWorkLog` take as `ticketId`.
 */

export type HistoryEntry = {
  id: string;
  description: string;
  /** The status the ticket had *at that time* — not its current status. */
  status: WorkflowStatus;
  createdAt: Date;
  updatedAt: Date;
  workLog: { id: string; title: string; date: Date } | null;
};

export type EditorMeeting = {
  id: string;
  name: string;
  notes: string;
  order: number;
  isDefault: boolean;
};

export type EditorTicket = {
  /** Ticket.id — the cuid. */
  id: string;
  /** Ticket.ticketId — the human key, e.g. "ASU-1234". */
  ticketKey: string;
  title: string;
  /** Project / site the ticket belongs to. */
  projectName: string | null;
  /** Current status of the ticket. */
  status: WorkflowStatus;
  updatedAt: Date;
  /** This work log's own update row — the thing autosave writes into. */
  draft: { description: string; status: WorkflowStatus };
  /** Full history, newest first. `null` = not loaded yet (fetched on expand). */
  history: HistoryEntry[] | null;
};

export type EditorAttachment = {
  id: string;
  kind: "File" | "Link";
  name: string;
  url: string | null;
  mimeType: string | null;
  size: number | null;
  createdAt: Date;
};

export type EditorWorkLog = {
  id: string;
  title: string;
  dayType: DayType;
  /** Learning / upskilling notes (Markdown). */
  learningNotes: string;
  attachments: EditorAttachment[];
  date: Date;
  updatedAt: Date;
  meetings: EditorMeeting[];
  tickets: EditorTicket[];
};

/**
 * One history, newest first: work-log updates plus updates written directly on
 * the Tickets page (those have no work log).
 */
export function toMergedHistory(
  updates: Parameters<typeof toHistory>[0],
  historyEntries: Array<{ id: string; body: string; status: WorkflowStatus; createdAt: Date | string }> = [],
): HistoryEntry[] {
  const direct: HistoryEntry[] = historyEntries.map((entry) => ({
    id: `direct-${entry.id}`,
    description: entry.body,
    status: entry.status,
    createdAt: new Date(entry.createdAt),
    updatedAt: new Date(entry.createdAt),
    workLog: null,
  }));
  return [...toHistory(updates), ...direct].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Shape returned by `findTicket` / `upsertTicketForWorkLog`, flattened. */
export function toHistory(
  updates: Array<{
    id: string;
    description: string;
    status: WorkflowStatus;
    createdAt: Date | string;
    updatedAt: Date | string;
    workLog?: { id: string; title: string; date: Date | string } | null;
  }>,
): HistoryEntry[] {
  return updates.map((u) => ({
    id: u.id,
    description: u.description,
    status: u.status,
    createdAt: new Date(u.createdAt),
    updatedAt: new Date(u.updatedAt),
    workLog: u.workLog
      ? { id: u.workLog.id, title: u.workLog.title, date: new Date(u.workLog.date) }
      : null,
  }));
}

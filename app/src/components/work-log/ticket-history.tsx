"use client";

import { format } from "date-fns";
import { History, Loader2 } from "lucide-react";

import { cn } from "@/components/cn";
import {
  TICKET_STATUS_DOT,
  TicketStatusBadge,
} from "@/components/ui/ticket-status-badge";
import type { HistoryEntry } from "@/components/work-log/types";
import { MarkdownContent } from "@/components/work-log/markdown-editor";

/**
 * Ticket work history — spec §7 / §13, design.md §10.
 *
 * A vertical border rule with one semantic status dot per entry, and the
 * status badge the ticket carried **at that time** (never its current status).
 * Read top to bottom the dots are the ticket's journey as a colour progression:
 * Open → Blocked → Testing → Completed.
 */
export function TicketHistory({
  entries,
  loading = false,
  className,
}: {
  entries: HistoryEntry[] | null;
  loading?: boolean;
  className?: string;
}) {
  if (loading && !entries) {
    return (
      <p className={cn("flex items-center gap-2 text-sm text-text-muted", className)}>
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        Loading previous updates…
      </p>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <p className={cn("flex items-center gap-2 text-sm text-text-muted", className)}>
        <History className="size-3.5" aria-hidden="true" />
        No previous updates — this is the first entry for this ticket.
      </p>
    );
  }

  return (
    <ol className={cn("relative ml-1 flex flex-col gap-4 border-l border-border pl-4", className)}>
      {entries.map((entry) => (
        <li key={entry.id} className="relative">
          {/* The dot sits on the rule: -left-4 (pl-4) minus half its own size. */}
          <span
            aria-hidden="true"
            className={cn(
              "absolute top-1.5 -left-[1.3125rem] size-2.5 rounded-full ring-2 ring-surface",
              TICKET_STATUS_DOT[entry.status],
            )}
          />

          <div className="flex flex-wrap items-center gap-2">
            <time
              dateTime={(entry.workLog?.date ?? entry.createdAt).toISOString()}
              className="text-sm font-semibold text-text"
            >
              {format(entry.workLog?.date ?? entry.createdAt, "EEE, d MMM yyyy")}
            </time>
            <span aria-hidden="true" className="text-sm text-text-muted">
              ·
            </span>
            <span className="text-sm font-medium text-text-muted tabular-nums">
              {format(entry.createdAt, "HH:mm")}
            </span>
            <TicketStatusBadge status={entry.status} />
          </div>

          <p className="mt-1 text-sm font-medium text-text-muted">
            {entry.workLog ? entry.workLog.title : "Ticket update"}
          </p>

          {entry.description.trim() ? (
            <MarkdownContent value={entry.description} className="mt-2 max-w-[72ch] text-md text-text" />
          ) : (
            <p className="mt-2 text-md text-text-subtle italic">No work recorded.</p>
          )}
        </li>
      ))}
    </ol>
  );
}

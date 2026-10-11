import { format } from "date-fns";
import { History } from "lucide-react";

import { cn } from "@/components/cn";
import { TicketId } from "@/components/ui/badge";
import { TICKET_STATUS_DOT, TicketStatusBadge } from "@/components/ui/ticket-status-badge";
import { MarkdownContent } from "@/components/work-log/markdown-editor";
import type { EditorTicket } from "@/components/work-log/types";

/**
 * Detail-page card: each ticket's full history
 * (newest first, status snapshotted at that time). Entries from this log are tagged.
 */
export function WorkLogGlance({ workLogId, tickets }: { workLogId: string; tickets: EditorTicket[] }) {
  return (
    <section className="wl-card overflow-hidden" aria-labelledby="ticket-history-heading">
        <h2 id="ticket-history-heading" className="flex items-center gap-2 border-b border-border px-4 py-4 text-lg font-semibold tracking-[-0.015em] text-text md:px-5"><History className="size-4 text-accent-text" aria-hidden="true" />Ticket history</h2>
        {/* Scrolls on its own so a long history never stretches the page. */}
        <div tabIndex={0} aria-label="Ticket history entries" className="wl-scroll max-h-[28rem] overflow-y-auto px-4 pb-4 md:px-5">
        {tickets.length === 0 ? (
          <p className="mt-3 text-sm text-text-muted">History appears once a ticket is added.</p>
        ) : tickets.map((ticket) => (
          <div key={ticket.id} className="mt-4 first-of-type:mt-3">
            {tickets.length > 1 ? <p className="mb-3"><TicketId>{ticket.ticketKey}</TicketId></p> : null}
            {!ticket.history?.length ? (
              <p className="text-sm text-text-muted">No updates recorded.</p>
            ) : (
              <ol className="relative flex flex-col gap-4 border-l border-border pl-4">
                {ticket.history.map((entry) => {
                  const isThisLog = entry.workLog?.id === workLogId;
                  return (
                    <li key={entry.id} className="relative">
                      <span aria-hidden="true" className={cn("absolute -left-[1.3125rem] top-1 size-2.5 rounded-full ring-4 ring-surface", TICKET_STATUS_DOT[entry.status])} />
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <time dateTime={(entry.workLog?.date ?? entry.createdAt).toISOString()} className="text-sm font-semibold text-text">{format(entry.workLog?.date ?? entry.createdAt, "d MMM yyyy")}</time>
                        {isThisLog ? <span className="rounded-full bg-primary-subtle px-2 py-0.5 text-xs font-medium text-accent-text">This log</span> : null}
                      </div>
                      <TicketStatusBadge status={entry.status} className="mt-1.5" />
                      {entry.description.trim() ? <MarkdownContent value={entry.description} className="mt-1.5 line-clamp-3 text-sm text-text-muted" /> : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        ))}
        </div>
    </section>
  );
}

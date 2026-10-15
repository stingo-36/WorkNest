import { format } from "date-fns";
import { Briefcase, Check, ChevronLeft, ChevronRight, ExternalLink, FileText, FolderKanban, Link2, Pencil, Plane, Sun } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { listTodosForDay } from "@/actions/follow-ups";
import { getTicket } from "@/actions/tickets";
import { getAdjacentWorkLogs, getWorkLog } from "@/actions/worklog";
import { cn } from "@/components/cn";
import { TICKET_STATUS_LABELS, TicketStatusBadge } from "@/components/ui/ticket-status-badge";
import { attachmentHref, formatBytes } from "@/components/work-log/attachment-utils";
import { CopyLogButton } from "@/components/work-log/copy-log-button";
import { DayTodos } from "@/components/work-log/day-todos";
import { DAY_LABEL, DEFAULT_TITLE } from "@/components/work-log/day-type";
import { MarkdownContent } from "@/components/work-log/markdown-editor";
import type { HistoryEntry } from "@/components/work-log/types";
import { WorkLogGlance } from "@/components/work-log/work-log-glance";
import { WorkLogSummary } from "@/components/work-log/work-log-summary";
import { getAiSettings } from "@/lib/ai-settings";
import { requireUser } from "@/lib/session";
import { getUserSettings } from "@/lib/user-settings";

export const metadata = { title: "Work Log" };

const AUTO_TITLES = new Set<string>(Object.values(DEFAULT_TITLE));
const DAY_ICON = { Work: Briefcase, Holiday: Sun, Leave: Plane } as const;

export default async function WorkLogViewPage({ params }: { params: Promise<{ workLogId: string }> }) {
  const { workLogId } = await params;
  const [result, adjacentResult, user] = await Promise.all([getWorkLog(workLogId), getAdjacentWorkLogs(workLogId), requireUser()]);
  if (!result.ok) notFound();
  const data = result.data;
  const [{ ticketsEnabled }, ai] = await Promise.all([getUserSettings(user.id), getAiSettings(user.id)]);

  // Full history per ticket (work-log updates + direct ticket updates), newest first.
  const histories = await Promise.all(data.ticketUpdates.map(async (update): Promise<HistoryEntry[]> => {
    const ticket = await getTicket(update.ticket.id);
    if (!ticket.ok) return [];
    return [
      ...ticket.data.updates.map((entry) => ({ id: entry.id, description: entry.description, status: entry.status, createdAt: new Date(entry.createdAt), updatedAt: new Date(entry.updatedAt), workLog: entry.workLog ? { id: entry.workLog.id, title: entry.workLog.title, date: new Date(entry.workLog.date) } : null })),
      ...ticket.data.historyEntries.map((entry) => ({ id: entry.id, description: entry.body, status: entry.status, createdAt: new Date(entry.createdAt), updatedAt: new Date(entry.createdAt), workLog: null })),
    ].sort((a, b) => (b.workLog?.date ?? b.createdAt).getTime() - (a.workLog?.date ?? a.createdAt).getTime() || b.createdAt.getTime() - a.createdAt.getTime());
  }));

  const date = new Date(data.date);
  // WorkLog.date is UTC midnight, so its ISO prefix is the calendar day.
  const dayIso = date.toISOString().slice(0, 10);
  const todosResult = await listTodosForDay({ date: dayIso });
  const dayTodos = todosResult.ok
    ? todosResult.data.map((todo) => ({
        ...todo,
        dueDate: todo.dueDate ? todo.dueDate.toISOString().slice(0, 10) : null,
        completedAt: todo.completedAt?.toISOString() ?? null,
      }))
    : [];
  const createdAt = new Date(data.createdAt);
  const updatedAt = new Date(data.updatedAt);
  const customTitle = AUTO_TITLES.has(data.title) ? null : data.title;
  const DayIcon = DAY_ICON[data.dayType];
  const isWork = data.dayType === "Work";

  const tickets = data.ticketUpdates.map((update, index) => ({
    id: update.ticket.id,
    ticketKey: update.ticket.ticketId,
    title: update.ticket.title,
    projectName: update.ticket.projectName,
    status: update.ticket.status,
    updatedAt: new Date(update.ticket.updatedAt),
    draft: { description: update.description, status: update.status },
    history: histories[index],
  }));
  const meetings = [...data.meetings].sort((a, b) => a.order - b.order);
  const meetingsNoted = meetings.filter((meeting) => meeting.notes.trim()).length;
  const learning = data.learningNotes.trim();
  const attachments = data.attachments;

  const adjacent = adjacentResult.ok ? adjacentResult.data : { previous: null, next: null };
  const displayName = user.name ?? user.email ?? "You";
  const initials = displayName.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");

  // Plain-text version for "Copy as text".
  const copyText = [
    `${format(date, "EEEE, d MMMM yyyy")}${customTitle ? ` — ${customTitle}` : ""}`,
    isWork ? "" : `Day type: ${DAY_LABEL[data.dayType]}`,
    ticketsEnabled && tickets.length ? `\nTickets\n${tickets.map((ticket) => `- ${ticket.ticketKey} ${ticket.title}${ticket.projectName ? ` (${ticket.projectName})` : ""} [${TICKET_STATUS_LABELS[ticket.draft.status]}]${ticket.draft.description.trim() ? `\n  ${ticket.draft.description.trim().replace(/\n/g, "\n  ")}` : ""}`).join("\n")}` : "",
    meetingsNoted ? `\nMeetings\n${meetings.filter((meeting) => meeting.notes.trim()).map((meeting) => `${meeting.name}\n${meeting.notes.trim()}`).join("\n\n")}` : "",
    learning ? `\nWork done\n${learning}` : "",
    attachments.length ? `\nLinks & files\n${attachments.map((item) => `- ${item.name}${item.kind === "Link" && item.url ? `: ${item.url}` : ""}`).join("\n")}` : "",
  ].filter(Boolean).join("\n");

  const todosDone = dayTodos.filter((todo) => todo.completedAt?.slice(0, 10) === dayIso).length;

  const heading = customTitle ?? format(date, "EEEE d MMMM");

  return (
    // Redesigned 2026-10-15 from the owner's mockup: back link + ‹ › on top, a dark hero
    // band (date, title, actions, three counts), then the log on the left and to-dos,
    // ticket history and details on the right.
    <div className="work-logs-page work-log-detail-page flex min-w-0 flex-col gap-5">
      <nav aria-label="Work log navigation" className="flex items-center gap-2">
        <Link href="/work-logs" className="tap-area inline-flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-text">
          <ChevronLeft className="size-4" aria-hidden="true" />All work logs
        </Link>
        <span className="ml-auto flex items-center gap-1.5">
          <AdjacentLink log={adjacent.previous} direction="previous" />
          <AdjacentLink log={adjacent.next} direction="next" />
        </span>
      </nav>

      <header className="wl-hero motion-page-enter flex flex-wrap items-end justify-between gap-x-8 gap-y-6 rounded-3xl p-6 md:p-8">
        <div className="flex min-w-0 max-w-3xl flex-col gap-4">
          <p className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
            <time dateTime={format(date, "yyyy-MM-dd")}>{format(date, "EEEE, d MMM yyyy")}</time>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-text"><DayIcon className="size-3.5" aria-hidden="true" />{DAY_LABEL[data.dayType]}</span>
          </p>
          <h1 className="text-3xl leading-[1.05] font-bold tracking-[-0.035em] text-balance text-text md:text-4xl lg:text-5xl">{heading}</h1>
          <div className="flex flex-wrap gap-2">
            <Link href={`/work-logs/${data.id}/edit`} className="wl-solid inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-surface px-4 text-sm font-semibold text-text transition-colors duration-150 hover:bg-surface-2 md:h-10">
              <Pencil className="size-4" aria-hidden="true" />Edit log
            </Link>
            <CopyLogButton text={copyText} />
          </div>
        </div>
        {isWork ? (
          <dl className="flex gap-2">
            {ticketsEnabled ? <Fact label={tickets.length === 1 ? "Ticket" : "Tickets"} value={tickets.length} /> : null}
            <Fact label={meetingsNoted === 1 ? "Meeting" : "Meetings"} value={meetingsNoted} />
            <Fact label="To-dos done" value={todosDone} />
          </dl>
        ) : null}
      </header>

      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <WorkLogSummary
            workLogId={data.id}
            // Summaries without a model were built by code before AI-only (2026-10-02); not shown.
            summary={data.summaryModel ? data.summary : null}
            model={data.summaryModel}
            generatedAt={data.summaryModel && data.summaryGeneratedAt ? new Date(data.summaryGeneratedAt).toISOString() : null}
            updatedAt={updatedAt.toISOString()}
            hasContent={isWork && Boolean(learning || meetingsNoted || (ticketsEnabled && tickets.length))}
            todoDate={dayIso}
            todos={dayTodos}
            aiOn={ai.keySource !== null}
          />

          {!isWork ? (
            <section className="wl-card wl-off flex flex-col items-start gap-2 p-6 md:p-8">
              <span className="grid size-11 place-items-center rounded-xl bg-sidebar text-sidebar-fg" aria-hidden="true"><DayIcon className="size-5" /></span>
              <h2 className="mt-2 text-xl font-semibold text-text">This day was marked as {data.dayType === "Holiday" ? "a holiday" : "leave"}.</h2>
              <p className="text-sm text-text-muted">No meetings or ticket work were logged. Change the day type from “Edit log” if that’s wrong.</p>
            </section>
          ) : (
            <>
              {ticketsEnabled ? (
                <Card id="tickets-heading" title="Ticket work" count={tickets.length}>
                  {tickets.length === 0 ? (
                    <Empty>No tickets in this log.</Empty>
                  ) : (
                    <ol className="divide-y divide-border">
                      {tickets.map((ticket) => (
                        <li key={ticket.id} id={`ticket-card-${ticket.ticketKey}`} className="flex gap-4 px-4 py-5 md:px-5">
                          <span className="h-fit shrink-0 rounded-lg bg-surface-2 px-2 py-1 font-mono text-xs font-semibold text-text">{ticket.ticketKey}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="min-w-0 text-base font-semibold text-text">{ticket.title}</h3>
                              <TicketStatusBadge status={ticket.draft.status} />
                            </div>
                            {ticket.projectName ? <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-text-muted"><FolderKanban className="size-3.5" aria-hidden="true" />{ticket.projectName}</p> : null}
                            {ticket.draft.description.trim() ? (
                              <MarkdownContent value={ticket.draft.description} className="mt-2 text-text" />
                            ) : (
                              <p className="mt-2 text-sm text-text-subtle">No update written for this ticket.</p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </Card>
              ) : null}

              <Card id="meetings-heading" title="Meetings" count={`${meetingsNoted} of ${meetings.length} with notes`}>
                {meetings.length === 0 ? (
                  <Empty>No meetings on this day.</Empty>
                ) : (
                  <ol className="grid gap-3 p-4 md:grid-cols-2 md:p-5 xl:grid-cols-3">
                    {meetings.map((meeting) => {
                      const filled = Boolean(meeting.notes.trim());
                      return (
                        <li key={meeting.id} className="flex min-w-0 flex-col gap-1.5 rounded-xl bg-surface-2 p-4">
                          <h3 className={cn("flex items-center gap-2 text-sm font-semibold", filled ? "text-text" : "text-text-subtle")}>
                            {filled ? <Check className="size-4 shrink-0 text-primary" strokeWidth={2.5} aria-hidden="true" /> : null}
                            {meeting.name}
                          </h3>
                          {filled ? <MarkdownContent value={meeting.notes} className="text-sm text-text" /> : <p className="text-sm text-text-subtle">No notes</p>}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </Card>
            </>
          )}
        </div>

        <aside aria-label="Log details" className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-24">
          <DayTodos date={dayIso} todos={dayTodos} compact />
          {isWork && ticketsEnabled && tickets.length ? <WorkLogGlance workLogId={data.id} tickets={tickets} /> : null}

          <section aria-labelledby="details-heading" data-reveal className="wl-card flex min-w-0 flex-col gap-5 p-4 md:p-5">
            <h2 id="details-heading" className="text-lg font-semibold tracking-[-0.015em] text-text">Details</h2>
            {isWork ? (
              <DetailBlock title="Work done">
                {learning ? <MarkdownContent value={data.learningNotes} className="text-text" /> : <p className="text-sm text-text-muted">Nothing added for this day.</p>}
              </DetailBlock>
            ) : null}
            <DetailBlock title="Attachments & links">
              {attachments.length === 0 ? (
                <p className="text-sm text-text-muted">No files or links</p>
              ) : (
                <ul className="flex flex-col">
                  {attachments.map((item) => (
                    <li key={item.id}>
                      <a href={attachmentHref(item)} target="_blank" rel="noopener noreferrer" className="group flex min-h-9 items-center gap-2.5 text-sm">
                        {item.kind === "Link" ? <Link2 className="size-4 shrink-0 text-text-muted" aria-hidden="true" /> : <FileText className="size-4 shrink-0 text-text-muted" aria-hidden="true" />}
                        <span className="min-w-0 flex-1 truncate font-medium text-text underline-offset-2 group-hover:underline">{item.name}</span>
                        <span className="shrink-0 text-xs text-text-muted">{item.kind === "Link" ? <ExternalLink className="size-3.5" aria-hidden="true" /> : formatBytes(item.size)}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </DetailBlock>
            <DetailBlock title="Activity">
              <ul className="flex flex-col gap-1.5">
                <Activity label="Log edited" at={updatedAt} />
                <Activity label="Log created" at={createdAt} />
              </ul>
              <p className="mt-2.5 flex items-center gap-2 text-sm text-text">
                <span className="grid size-6 place-items-center rounded-full bg-primary text-2xs font-bold text-primary-fg" aria-hidden="true">{initials}</span>
                {displayName}
              </p>
            </DetailBlock>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: number }) {
  return (
    <div className="wl-inset flex min-h-24 w-[4.75rem] flex-col justify-between rounded-xl p-3 md:w-20">
      <dd className="text-2xl font-bold text-text tabular-nums">{value}</dd>
      <dt className="order-last text-xs leading-tight text-text-muted">{label}</dt>
    </div>
  );
}

function DetailBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-1.5">
      <h3 className="text-2xs font-semibold tracking-[0.12em] text-text-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}

/** ‹ / › to the neighbouring log's read-only view; dimmed when there is none. */
function AdjacentLink({ log, direction }: { log: { id: string; date: Date } | null; direction: "previous" | "next" }) {
  const Icon = direction === "previous" ? ChevronLeft : ChevronRight;
  const box = "grid size-9 place-items-center rounded-xl border bg-surface transition-colors duration-150";
  if (!log) return <span className={cn(box, "border-border text-text-subtle opacity-50")} aria-hidden="true"><Icon className="size-4" /></span>;
  const label = format(new Date(log.date), "EEEE d MMMM");
  return (
    <Link href={`/work-logs/${log.id}`} aria-label={`${direction === "previous" ? "Previous" : "Next"} work log: ${label}`} title={label} className={cn(box, "border-border-strong text-text hover:bg-surface-2")}>
      <Icon className="size-4" aria-hidden="true" />
    </Link>
  );
}

function Card({ id, title, count, className, children }: { id: string; title: string; count?: number | string; className?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} data-reveal className={cn("wl-card min-w-0 overflow-hidden", className)}>
      <h2 id={id} className="flex items-center gap-2.5 border-b border-border px-4 py-4 text-lg font-semibold tracking-[-0.015em] text-text md:px-5">
        {title}
        {count !== undefined ? <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-text-muted tabular-nums">{count}</span> : null}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-5 text-sm text-text-muted md:px-6">{children}</p>;
}

function Activity({ label, at }: { label: string; at: Date }) {
  return (
    <li className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-text">{label}</span>
      <time dateTime={at.toISOString()} className="shrink-0 font-mono text-xs text-text-muted">{format(at, "d MMM, HH:mm")}</time>
    </li>
  );
}

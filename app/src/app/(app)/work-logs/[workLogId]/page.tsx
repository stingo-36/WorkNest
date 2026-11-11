import { format } from "date-fns";
import { Briefcase, Check, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, FileText, FolderKanban, Link2, Pencil, Plane, Sun } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { listTodosForDay } from "@/actions/follow-ups";
import { getTicket } from "@/actions/tickets";
import { getAdjacentWorkLogs, getWorkLog } from "@/actions/worklog";
import { cn } from "@/components/cn";
import { TICKET_STATUS_DOT, TICKET_STATUS_LABELS, TicketStatusBadge } from "@/components/ui/ticket-status-badge";
import { attachmentHref, formatBytes } from "@/components/work-log/attachment-utils";
import { CopyLogButton } from "@/components/work-log/copy-log-button";
import { DayTodos } from "@/components/work-log/day-todos";
import { DAY_LABEL, DEFAULT_TITLE } from "@/components/work-log/day-type";
import { MarkdownContent } from "@/components/work-log/markdown-editor";
import type { HistoryEntry } from "@/components/work-log/types";
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
    // Ocean v2 day view (2026-11-01): back link and dated ‹ ›, a hero card (date
    // badge, title, actions, counts), then summary, ticket work — each ticket
    // carrying its own history — meetings and work done, beside a rail of
    // to-dos, attachments and activity.
    <div className="work-logs-page work-log-detail-page wld flex min-w-0 flex-col gap-5">
      <nav aria-label="Work log navigation" className="flex items-center gap-2">
        <Link href="/work-logs" className="tap-area inline-flex items-center gap-1.5 text-sm font-semibold text-accent-text hover:text-text">
          <ChevronLeft className="size-4" aria-hidden="true" />All work logs
        </Link>
        <span className="ml-auto flex items-center gap-2">
          <AdjacentLink log={adjacent.previous} direction="previous" />
          <AdjacentLink log={adjacent.next} direction="next" />
        </span>
      </nav>

      <header className="wld-hero wl-card motion-page-enter min-w-0">
        <div className="wld-hero-main">
          <time dateTime={dayIso} className="wld-datebox" aria-hidden="true">
            <small>{format(date, "EEE")}</small>
            <b>{format(date, "d")}</b>
            <small>{format(date, "MMM")}</small>
          </time>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
              <time dateTime={dayIso}>{format(date, "EEEE, d MMM yyyy")}</time>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-2.5 py-0.5 text-xs font-semibold text-accent-text"><DayIcon className="size-3.5" aria-hidden="true" />{DAY_LABEL[data.dayType]}</span>
            </p>
            <h1 className="wld-title mt-1.5 text-balance text-text">{heading}</h1>
          </div>
          <div className="wld-actions">
            <CopyLogButton text={copyText} />
            <Link href={`/work-logs/${data.id}/edit`} className="wl-solid inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-fg transition-colors duration-150 hover:bg-primary-hover md:h-10">
              <Pencil className="size-4" aria-hidden="true" />Edit log
            </Link>
          </div>
        </div>
        {isWork ? (
          <dl className="wld-stats">
            {ticketsEnabled ? <Fact label={tickets.length === 1 ? "ticket" : "tickets"} value={tickets.length} /> : null}
            <Fact label={meetingsNoted === 1 ? "meeting" : "meetings"} value={meetingsNoted} />
            <Fact label="to-dos done" value={todosDone} />
          </dl>
        ) : null}
      </header>

      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_19rem] xl:grid-cols-[minmax(0,1fr)_21rem]">
        <article className="flex min-w-0 flex-col gap-5">
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
            aiOn={ai.aiOn}
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
                    <ol className="flex flex-col gap-3 p-4 md:p-5">
                      {tickets.map((ticket) => (
                        <TicketCard key={ticket.id} ticket={ticket} workLogId={data.id} date={date} />
                      ))}
                    </ol>
                  )}
                </Card>
              ) : null}

              <div className="grid min-w-0 gap-5 xl:grid-cols-2">
                <Card id="meetings-heading" title="Meetings" count={`${meetingsNoted} of ${meetings.length} with notes`}>
                  {meetings.length === 0 ? (
                    <Empty>No meetings on this day.</Empty>
                  ) : (
                    <ol className="flex flex-col gap-3 p-4 md:p-5">
                      {meetings.map((meeting) => {
                        const filled = Boolean(meeting.notes.trim());
                        return (
                          <li key={meeting.id} className="flex min-w-0 gap-3">
                            <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", filled ? "bg-primary-subtle text-accent-text" : "bg-surface-2 text-text-subtle")} aria-hidden="true">
                              {filled ? <Check className="size-4" strokeWidth={2.5} /> : <Briefcase className="size-4" />}
                            </span>
                            <div className="min-w-0 flex-1">
                              <h3 className={cn("text-sm font-semibold", filled ? "text-text" : "text-text-subtle")}>{meeting.name}</h3>
                              {filled ? <MarkdownContent value={meeting.notes} className="mt-1 text-sm text-text-muted" /> : <p className="mt-0.5 text-sm text-text-subtle">No notes</p>}
                              {meeting.minutes.length ? (
                                <ul aria-label={`${meeting.name} minutes`} className="mt-2 flex flex-wrap gap-2">
                                  {meeting.minutes.map(({ followUp }) => (
                                    <li key={followUp.id} className="min-w-0 max-w-full">
                                      <Link href={`/tracker?open=${followUp.id}`} className="flex min-w-0 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1 text-sm font-medium text-accent-text hover:underline">
                                        <FileText className="size-3.5 shrink-0" aria-hidden="true" />
                                        <span className="truncate">{followUp.subject}</span>
                                      </Link>
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </Card>
                <Card id="work-done-heading" title="Work done">
                  <div className="p-4 md:p-5">
                    {learning ? <MarkdownContent value={data.learningNotes} className="text-text" /> : <p className="text-sm text-text-muted">Nothing added for this day.</p>}
                  </div>
                </Card>
              </div>
            </>
          )}
        </article>

        <aside aria-label="Log details" className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-24">
          <DayTodos date={dayIso} todos={dayTodos} compact />

          <Card id="attachments-heading" title="Attachments & links" count={attachments.length || undefined}>
            <div className="p-4 md:p-5">
              {attachments.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border-strong px-3 py-3 text-center text-sm text-text-muted">No files or links</p>
              ) : (
                <ul className="flex flex-col">
                  {attachments.map((item) => (
                    <li key={item.id}>
                      <a href={attachmentHref(item)} target="_blank" rel="noopener noreferrer" className="group flex min-h-10 items-center gap-2.5 text-sm">
                        {item.kind === "Link" ? <Link2 className="size-4 shrink-0 text-text-muted" aria-hidden="true" /> : <FileText className="size-4 shrink-0 text-text-muted" aria-hidden="true" />}
                        <span className="min-w-0 flex-1 truncate font-medium text-text underline-offset-2 group-hover:underline">{item.name}</span>
                        <span className="shrink-0 text-xs text-text-muted">{item.kind === "Link" ? <ExternalLink className="size-3.5" aria-hidden="true" /> : formatBytes(item.size)}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card id="activity-heading" title="Activity">
            <div className="p-4 md:p-5">
              <ul className="flex flex-col gap-2">
                <Activity label="Log edited" at={updatedAt} />
                <Activity label="Log created" at={createdAt} />
              </ul>
              <p className="mt-3 flex items-center gap-2.5 border-t border-border pt-3 text-sm font-semibold text-text">
                <span className="grid size-7 place-items-center rounded-full bg-primary text-2xs font-bold text-primary-fg" aria-hidden="true">{initials}</span>
                {displayName}
              </p>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

type ViewTicket = { id: string; ticketKey: string; title: string; projectName: string | null; draft: { description: string; status: Parameters<typeof TicketStatusBadge>[0]["status"] }; history: HistoryEntry[] };

/** How many of a ticket's other updates show before the rest fold away. */
const HISTORY_PREVIEW = 2;

/** One ticket: this log's update highlighted, its other updates as a timeline (newest first). */
function TicketCard({ ticket, workLogId, date }: { ticket: ViewTicket; workLogId: string; date: Date }) {
  const others = ticket.history.filter((entry) => entry.workLog?.id !== workLogId);
  const shown = others.slice(0, HISTORY_PREVIEW);
  const folded = others.slice(HISTORY_PREVIEW);
  return (
    <li id={`ticket-card-${ticket.ticketKey}`} className="wld-ticket min-w-0">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span className="rounded-lg bg-primary-subtle px-2 py-0.5 font-mono text-xs font-semibold text-accent-text">{ticket.ticketKey}</span>
        <h3 className="min-w-0 flex-[1_1_14rem] text-base font-semibold text-text">{ticket.title}</h3>
        <TicketStatusBadge status={ticket.draft.status} />
      </div>
      {ticket.projectName ? <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-text-muted"><FolderKanban className="size-3.5" aria-hidden="true" />{ticket.projectName}</p> : null}
      <div className="wld-this">
        <p className="text-2xs font-bold tracking-[0.08em] text-accent-text uppercase">This log · {format(date, "d MMM")}</p>
        {ticket.draft.description.trim() ? (
          <MarkdownContent value={ticket.draft.description} className="mt-1 text-text" />
        ) : (
          <p className="mt-1 text-sm text-text-subtle">No update written for this ticket.</p>
        )}
      </div>
      {shown.length ? <HistoryList entries={shown} /> : null}
      {folded.length ? (
        <details className="wld-more">
          <summary className="inline-flex min-h-9 cursor-pointer items-center gap-1 text-sm font-semibold text-accent-text">
            Show {folded.length} more {folded.length === 1 ? "update" : "updates"}<ChevronDown className="size-4" aria-hidden="true" />
          </summary>
          <HistoryList entries={folded} />
        </details>
      ) : null}
    </li>
  );
}

function HistoryList({ entries }: { entries: HistoryEntry[] }) {
  return (
    <ol className="wld-history" aria-label="Other updates on this ticket">
      {entries.map((entry) => {
        const at = entry.workLog?.date ?? entry.createdAt;
        return (
          <li key={entry.id} className="relative">
            <span aria-hidden="true" className={cn("wld-dot", TICKET_STATUS_DOT[entry.status])} />
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <time dateTime={at.toISOString()} className="text-xs font-semibold text-text">{format(at, "d MMM yyyy")}</time>
              <span className="text-xs text-text-muted">{TICKET_STATUS_LABELS[entry.status]}</span>
            </p>
            {entry.description.trim() ? <MarkdownContent value={entry.description} className="mt-0.5 line-clamp-3 text-sm text-text-muted" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

function Fact({ label, value }: { label: string; value: number }) {
  return (
    <div className="wld-stat">
      <dd className="wld-stat-n text-2xl font-bold text-text tabular-nums">{value}</dd>
      <dt className="text-sm text-text-muted">{label}</dt>
    </div>
  );
}

/** ‹ / › to the neighbouring log's read-only view; dimmed when there is none. */
function AdjacentLink({ log, direction }: { log: { id: string; date: Date } | null; direction: "previous" | "next" }) {
  const Icon = direction === "previous" ? ChevronLeft : ChevronRight;
  const box = "inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-xl border bg-surface px-2.5 text-sm font-semibold transition-colors duration-150";
  if (!log) return <span className={cn(box, "border-border text-text-subtle opacity-50")} aria-hidden="true"><Icon className="size-4" /></span>;
  const label = format(new Date(log.date), "EEEE d MMMM");
  const short = format(new Date(log.date), "EEE d MMM");
  return (
    <Link href={`/work-logs/${log.id}`} aria-label={`${direction === "previous" ? "Previous" : "Next"} work log: ${label}`} title={label} className={cn(box, "border-border-strong text-text hover:bg-surface-2", direction === "next" && "flex-row-reverse")}>
      <Icon className="size-4" aria-hidden="true" /><span className="hidden text-text-muted md:inline">{short}</span>
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

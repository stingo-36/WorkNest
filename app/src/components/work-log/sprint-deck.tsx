"use client";

import { ArrowRight, Check, MessageSquareReply, Pencil, Plus, Star, Zap } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { cn } from "@/components/cn";
import { OPEN_DAY_EVENT } from "@/components/work-log/deck-search";
import { EmptyDayActions } from "@/components/work-log/open-day-bar";
import { MarkdownContent } from "@/components/work-log/markdown-editor";
import { TicketStatusBadge } from "@/components/ui/ticket-status-badge";
import type { WorkflowStatus } from "@/lib/workflow-status";

export type DeckDayState = "logged" | "off" | "today" | "missing" | "future";

export type DeckLog = {
  id: string;
  /** null when the title is an auto-title ("Daily Work Log", …). */
  title: string | null;
  dayType: "Work" | "Holiday" | "Leave";
  /** The AI summary (Markdown), when one has been generated. */
  summary: string | null;
  tickets: Array<{ id: string; key: string; title: string; status: WorkflowStatus; description: string }>;
};

/** The Tracker as it stood on one day (grouped on the server from `listTrackerForRange`). */
export type DeckTracker = {
  /** done = finished that day; due = due that day, still open; overdue = due earlier, still open; added = created that day (shown as "Created"). */
  todos: Array<{ id: string; subject: string; state: "done" | "due" | "overdue" | "added"; pinned: boolean; due: string | null; doneLater: string | null; doneOn: string | null }>;
  followUps: Array<{ id: string; person: string | null; subject: string; note: string | null; fromThem: boolean; ticketKey: string | null; done: boolean }>;
  notes: Array<{ id: string; subject: string; note: string | null; tags: string[] }>;
};

export type DeckItem =
  | { kind: "weekend"; key: string }
  | {
      kind: "day";
      key: string;
      weekday: string;
      weekdayLong: string;
      month: string;
      dayNumber: string;
      state: DeckDayState;
      isToday: boolean;
      isLast: boolean;
      ticketCount: number;
      meetingCount: number;
      log: DeckLog | null;
      tracker: DeckTracker;
    };

type DayItem = Extract<DeckItem, { kind: "day" }>;

const DAY_OFF_LABEL = { Holiday: "Holiday", Leave: "Leave", Work: "Work day" } as const;

/** Five working days to a row: the sprint reads as Week 1 / Week 2 whatever weekday it starts on. */
const WEEK = 5;

/**
 * The sprint as a strip of day tiles over the open day and a rail (Ocean v2,
 * 2026-11-01; was a ribbon of bars). Each tile says what the day holds; picking
 * one opens it below. The rail offers the latest missing day, the open day's
 * to-dos and the sprint's numbers. Selection is client state, mirrored to
 * `?day=` with replaceState so a reload or shared link lands on the same day.
 */
export function SprintDeck({ items, initialDay }: { items: DeckItem[]; initialDay: string | null }) {
  const [selected, setSelected] = useState(initialDay);

  function select(key: string) {
    setSelected(key);
    window.history.replaceState(null, "", `/work-logs?day=${key}`);
  }

  // The header search opens a day through this event.
  useEffect(() => {
    function onOpen(event: Event) {
      const key = (event as CustomEvent<string>).detail;
      setSelected(key);
      window.history.replaceState(null, "", `/work-logs?day=${key}`);
      requestAnimationFrame(() => document.getElementById(`wl-day-${key}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    }
    window.addEventListener(OPEN_DAY_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_DAY_EVENT, onOpen);
  }, []);

  const days = items.filter((item): item is DayItem => item.kind === "day");
  const open = days.find((item) => item.key === selected) ?? null;
  const weeks = Array.from({ length: Math.ceil(days.length / WEEK) }, (_, index) => days.slice(index * WEEK, (index + 1) * WEEK));
  const past = days.filter((item) => item.state !== "future");
  const logged = past.filter((item) => item.log).length;
  const missing = past.filter((item) => item.state === "missing");
  const left = days.length - past.length;
  const ticketKeys = new Set(days.flatMap((item) => item.log?.tickets.map((ticket) => ticket.key) ?? []));
  // The latest day still without a log, other than the one already open.
  const backfill = missing.filter((item) => item.key !== open?.key).at(-1) ?? null;
  const share = (count: number) => `${days.length ? (count / days.length) * 100 : 0}%`;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <section className="wl-strip2" aria-label="Days of the sprint">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-sm whitespace-nowrap text-text-muted"><b className="font-semibold text-text">{logged} of {past.length}</b> days logged</p>
          <span className="wl-prog" aria-hidden="true">
            <i style={{ width: share(logged) }} />
            <i data-missing style={{ width: share(missing.length) }} />
          </span>
          <p className="text-sm whitespace-nowrap text-text-muted">{left} {left === 1 ? "workday" : "workdays"} left</p>
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-muted max-md:hidden" aria-label="Legend">
            <li className="inline-flex items-center gap-1.5"><i className="wl-dot" aria-hidden="true" />Logged</li>
            <li className="inline-flex items-center gap-1.5"><i className="wl-legend-missing" aria-hidden="true" />No log</li>
            <li className="inline-flex items-center gap-1.5"><i className="wl-legend-today" aria-hidden="true" />Today</li>
          </ul>
        </div>
        <div className="wl-weeks">
          {weeks.map((week, index) => (
            <div key={index} className="wl-week">
              <p className="wl-wk">Week {index + 1}</p>
              <ol className="wl-days">
                {week.map((item) => (
                  <li key={item.key} className="contents">
                    <DayTile item={item} open={item.key === selected} onSelect={() => select(item.key)} />
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      <div className="wl-body">
        {open ? <DayCard key={open.key} item={open} /> : <p className="text-base text-text-subtle">Pick a day above to see its log.</p>}
        <aside className="flex min-w-0 flex-col gap-4" aria-label="Sprint at a glance">
          {backfill ? (
            <section className="wl-backfill">
              <p className="text-xs font-semibold tracking-[0.12em] uppercase opacity-80">Missing day</p>
              <p className="mt-1 mb-3 text-lg font-semibold" style={{ fontFamily: "var(--font-heading)" }}>{backfill.weekdayLong} {backfill.dayNumber} {backfill.month.slice(0, 3)} has no log yet.</p>
              <button type="button" onClick={() => {
                select(backfill.key);
                // On a phone the rail sits under the day card: bring the opened day into view.
                requestAnimationFrame(() => document.getElementById(`wl-day-${backfill.key}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
              }} className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-surface px-4 text-sm font-semibold text-sidebar transition-transform duration-150 active:scale-[0.98]">
                <Plus className="size-4" aria-hidden="true" />Add {backfill.weekdayLong}&rsquo;s log
              </button>
            </section>
          ) : null}
          {open && open.tracker.todos.length ? <div className="wl-rail-card"><Todos todos={open.tracker.todos} /></div> : null}
          <dl className="wl-rail-card grid grid-cols-3 gap-2 p-3.5">
            {[[ticketKeys.size, ticketKeys.size === 1 ? "ticket this sprint" : "tickets this sprint"], [logged, logged === 1 ? "day logged" : "days logged"], [missing.length, "to backfill"]].map(([value, label]) => (
              <div key={label} className="flex flex-col-reverse rounded-xl bg-surface-2 px-3 py-2.5">
                <dt className="text-xs text-text-muted">{label}</dt>
                <dd className="text-2xl font-bold text-sidebar tabular-nums" style={{ fontFamily: "var(--font-heading)" }}>{value}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>
    </div>
  );
}

/** One tile in the strip: weekday, date and what the day holds; future days can't be opened. */
function DayTile({ item, open, onSelect }: { item: DayItem; open: boolean; onSelect: () => void }) {
  const { log } = item;
  const status =
    log && log.dayType !== "Work" ? DAY_OFF_LABEL[log.dayType]
    : log ? (item.ticketCount ? `${item.ticketCount} ${item.ticketCount === 1 ? "ticket" : "tickets"}` : "Logged")
    : item.state === "today" ? "Start log"
    : item.state === "missing" ? "Add log"
    : item.isLast ? "Sprint ends" : "Upcoming";
  const short = log && log.dayType === "Work" ? String(item.ticketCount) : item.state === "missing" ? "Add" : item.state === "today" ? "Start" : log ? status : "—";

  const inner = (
    <>
      <span className="wl-tile-top"><span className="wl-tile-wd">{item.weekday}</span><span className="wl-tile-num">{item.dayNumber}</span></span>
      <span className="wl-tile-s">
        {item.state === "missing" ? <Plus className="size-3.5" aria-hidden="true" /> : log && log.dayType === "Work" ? <i className="wl-tile-dot" aria-hidden="true" /> : null}
        <span className="wl-tile-long">{status}</span>
        {/* Phones show a short form so the tile stays narrow. */}
        <span className="wl-tile-short" aria-hidden="true">{short}</span>
      </span>
      {item.isToday ? <span className="sr-only">, today</span> : null}
    </>
  );

  if (item.state === "future") {
    return <span className="wl-tile" data-state={item.state}>{inner}</span>;
  }
  return (
    <button
      type="button"
      className="wl-tile"
      data-state={item.state}
      data-today={item.isToday || undefined}
      data-open={open || undefined}
      aria-pressed={open}
      aria-controls={`wl-day-${item.key}`}
      onClick={onSelect}
    >
      {inner}
    </button>
  );
}

/** The open day: a date badge and actions, then tickets, summary, follow-ups and notes. */
function DayCard({ item }: { item: DayItem }) {
  const { log, tracker } = item;
  const chip =
    log && log.dayType !== "Work" ? { label: "Day off", icon: null, className: "bg-surface-2 text-text-muted" }
    : log ? { label: "Logged", icon: <Check className="size-3.5" aria-hidden="true" />, className: "bg-primary-subtle text-accent-text" }
    : item.state === "today" ? { label: "Today", icon: <Zap className="size-3.5" aria-hidden="true" />, className: "bg-sidebar text-sidebar-fg" }
    : { label: "No log", icon: null, className: "bg-warning-subtle text-warning" };
  const titleParts = log?.title?.split("|").map((part) => part.trim()).filter(Boolean) ?? [];
  const counts = [
    log?.tickets.length ? `${log.tickets.length} ${log.tickets.length === 1 ? "ticket" : "tickets"}` : null,
    tracker.followUps.length ? `${tracker.followUps.length} ${tracker.followUps.length === 1 ? "follow-up" : "follow-ups"}` : null,
  ].filter(Boolean).join(" · ");
  const hasAnything = hasSummary(item) || tracker.followUps.length > 0 || tracker.notes.length > 0;

  return (
    <section id={`wl-day-${item.key}`} aria-labelledby={`wl-day-${item.key}-heading`} className="wl-day-panel min-w-0">
      <div className="wl-reveal flex flex-col">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border px-5 py-4 md:px-6 md:py-5" style={{ "--i": 0 } as CSSProperties}>
          <span className="wl-datebox" aria-hidden="true"><small>{item.month.slice(0, 3)}</small><b>{item.dayNumber}</b></span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <h2 id={`wl-day-${item.key}-heading`} className="text-xl font-semibold tracking-[-0.02em] text-text" style={{ fontFamily: "var(--font-heading)" }}>
              {item.weekdayLong}<span className="sr-only"> {item.dayNumber} {item.month}</span>
            </h2>
            <p className="flex flex-wrap gap-1.5">
              <span className={cn("inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", chip.className)}>{chip.icon}{chip.label}</span>
              {counts ? <span className="inline-flex rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-text-muted">{counts}</span> : null}
            </p>
          </div>
          {log ? (
            <div className="flex shrink-0 gap-2 max-md:grid max-md:w-full max-md:grid-cols-2 md:ml-auto">
              <Link href={`/work-logs/${log.id}`} className="inline-flex h-11 items-center justify-center rounded-xl border border-border-strong bg-surface px-4 text-sm font-semibold whitespace-nowrap text-sidebar transition-colors duration-150 hover:bg-surface-2 md:h-10">View full log</Link>
              <Link href={`/work-logs/${log.id}/edit`} className="wl-edit inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold whitespace-nowrap text-sidebar-fg transition-transform duration-150 active:scale-[0.98] md:h-10">
                <Pencil className="size-4" aria-hidden="true" />Edit log
              </Link>
            </div>
          ) : (
            // No log yet: start it or mark the day off, in the same right-hand spot.
            <div className="max-md:w-full md:ml-auto"><EmptyDayActions date={item.key} isToday={item.isToday} /></div>
          )}
        </header>

        {titleParts.length ? (
          <p className="px-5 pt-5 text-lg leading-snug font-semibold text-text md:px-6" style={{ "--i": 1 } as CSSProperties}>
            {titleParts.map((part, index) => <span key={index}>{index ? <span className="mx-2 font-normal text-border" aria-hidden="true">|</span> : null}{part}</span>)}
          </p>
        ) : null}

        {hasAnything ? (
          <div className="flex flex-col" style={{ "--i": 2 } as CSSProperties}>
            {hasSummary(item) ? <Summary item={item} /> : null}
            {tracker.followUps.length ? <FollowUps followUps={tracker.followUps} /> : null}
            {tracker.notes.length ? <Notes notes={tracker.notes} /> : null}
          </div>
        ) : (
          <p className="px-5 py-6 text-base text-text-subtle md:px-6" style={{ "--i": 2 } as CSSProperties}>
            {log ? "Nothing recorded for this day." : item.state === "today" ? "Today’s log isn’t started." : "No log for this day yet."}
          </p>
        )}
      </div>
    </section>
  );
}

function Block({ title, count, href, children }: { title: string; count?: number; href?: string; children: ReactNode }) {
  return (
    <section className="wl-block min-w-0 px-5 py-4 md:px-6 md:py-5">
      <h3 className="mb-2 flex items-center text-xs font-semibold tracking-[0.12em] text-text-muted uppercase">
        {title}{count !== undefined ? <span className="ml-1.5 tabular-nums">· {count}</span> : null}
        {href ? (
          <Link href={href} className="group/tr ml-auto -my-2 inline-flex min-h-9 items-center gap-1 px-1 text-sm font-semibold tracking-normal text-accent-text normal-case">
            Open<ArrowRight className="size-3.5 transition-transform duration-200 group-hover/tr:translate-x-0.5" aria-hidden="true" />
          </Link>
        ) : null}
      </h3>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-2 text-base text-text-subtle">{children}</p>;
}

/** First line of a Markdown update, as plain text. */
function firstLine(markdown: string) {
  const line = markdown.split("\n").map((part) => part.replace(/^[\s>*#-]+|\[[ x]\]\s*/gi, "").replace(/[*_`]/g, "").trim()).find(Boolean);
  return line ?? "";
}

/** Summary shows only when there's a log with something to say (no log: the header offers Start log). */
function hasSummary({ log }: DayItem) {
  return log !== null && (log.dayType !== "Work" || Boolean(log.summary) || log.tickets.length > 0);
}

/**
 * The AI summary when there is one, then one row per ticket worked: key, title,
 * the update's first line and its status. A day off says so instead.
 */
function Summary({ item }: { item: DayItem }) {
  const { log } = item;
  if (!log) return null;
  if (log.dayType !== "Work") {
    return <Block title="Summary"><Empty>Marked as {log.dayType === "Holiday" ? "a holiday" : "leave"} — nothing to log.</Empty></Block>;
  }
  return (
    <>
      {log.summary ? <Block title="Summary"><div className="wl-summary-md"><MarkdownContent value={log.summary} className="text-base text-text" /></div></Block> : null}
      {log.tickets.length ? (
        <Block title="Tickets worked">
          <ul className="flex flex-col">
            {log.tickets.map((ticket) => (
              <li key={ticket.id} className="wl-tk-row">
                <span className="wl-key">{ticket.key}</span>
                <span className="min-w-0">
                  <span className="block text-md font-semibold text-text">{ticket.title}</span>
                  {firstLine(ticket.description) ? <span className="mt-0.5 block text-base leading-relaxed text-text-muted">{firstLine(ticket.description)}</span> : null}
                </span>
                <TicketStatusBadge status={ticket.status} />
              </li>
            ))}
          </ul>
        </Block>
      ) : null}
    </>
  );
}

const TODO_ORDER = { overdue: 0, due: 1, added: 2, done: 3 } as const;

/** What a to-do was on that day, under its title (overdue and due read as urgent). */
const TODO_META = {
  overdue: { label: "Overdue", className: "font-semibold text-danger" },
  due: { label: "Due today", className: "font-semibold text-danger" },
  added: { label: "Created", className: "text-accent-text" },
  done: { label: "Done", className: "text-text-subtle" },
} as const;

/** The open day's to-dos as a tick list (Ocean v2): the tick shows done, the line under says the state. */
function Todos({ todos }: { todos: DeckTracker["todos"] }) {
  const sorted = [...todos].sort((a, b) => TODO_ORDER[a.state] - TODO_ORDER[b.state]);
  return (
    <Block title="To-do list" count={todos.length} href="/tracker">
      <ul className="flex flex-col">
        {sorted.map((todo) => {
          // Finished on a later day: keep what it was that day, but tick it and strike it through.
          const struck = todo.state === "done" || Boolean(todo.doneLater);
          const meta = TODO_META[todo.state];
          return (
            <li key={todo.id} className="flex gap-3 py-2">
              <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2", struck ? "border-status-completed bg-status-completed text-primary-fg" : "border-text-subtle")} aria-hidden="true">
                {struck ? <Check className="size-3" strokeWidth={3.5} /> : null}
              </span>
              <span className="min-w-0 flex-1 text-base leading-snug">
                {struck ? <span className="sr-only">Done: </span> : null}
                <span className={struck ? "text-text-subtle line-through" : "text-text"}>{todo.subject}</span>
                <span className={cn("mt-0.5 block text-sm", struck ? TODO_META.done.className : meta.className)}>
                  {struck ? `Done${todo.doneOn ? ` ${todo.doneOn}` : ""}` : `${meta.label}${todo.state === "overdue" && todo.due ? ` · due ${todo.due}` : ""}`}
                </span>
              </span>
              {todo.pinned ? <Star className="mt-1 size-3.5 shrink-0 fill-current text-warning" aria-label="Important" /> : null}
            </li>
          );
        })}
      </ul>
    </Block>
  );
}

function FollowUps({ followUps }: { followUps: DeckTracker["followUps"] }) {
  return (
    <Block title="Follow-ups" count={followUps.length} href="/tracker?view=followups">
      <ul className="flex flex-col">
        {followUps.map((entry) => {
          const person = entry.person ?? "Someone";
          const state = entry.done ? "Closed" : entry.fromThem ? "Replied" : "Waiting";
          return (
            <li key={entry.id} className="flex items-start gap-3 py-2.5">
              <span className="tk-avatar tk-avatar-sm mt-0.5" aria-hidden="true">{person.trim().charAt(0).toUpperCase()}</span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-base font-semibold text-text">
                  {entry.subject}
                  {entry.ticketKey ? <span className="wl-key ml-1.5 align-[0.1em]">{entry.ticketKey}</span> : null}
                </span>
                <span className="line-clamp-2 text-sm text-text-muted">
                  {entry.fromThem ? <><MessageSquareReply className="mr-1 inline size-3.5 align-[-0.125em]" aria-hidden="true" />{person} replied</> : `Waiting on ${person}`}
                  {entry.note ? ` · “${entry.note}”` : ""}
                </span>
              </span>
              <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", entry.done ? "bg-surface-2 text-text-muted" : entry.fromThem ? "bg-primary-subtle text-accent-text" : "bg-warning-subtle text-warning")}>{state}</span>
            </li>
          );
        })}
      </ul>
    </Block>
  );
}

function Notes({ notes }: { notes: DeckTracker["notes"] }) {
  return (
    <Block title="Notes" count={notes.length} href="/tracker?view=notes">
      {notes.length ? (
        <ul className="flex flex-col gap-2">
          {notes.map((note) => (
            <li key={note.id} className="rounded-xl bg-primary-subtle px-3.5 py-2.5">
              <p className="text-base font-semibold text-text">{note.subject}</p>
              {note.note ? <p className="mt-1 line-clamp-3 text-base text-text-muted">{note.note}</p> : null}
              {note.tags.length ? <p className="mt-1.5 flex flex-wrap gap-1.5">{note.tags.map((tag) => <span key={tag} className="text-sm text-accent-text">#{tag}</span>)}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Block>
  );
}

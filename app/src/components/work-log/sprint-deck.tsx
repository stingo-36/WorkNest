"use client";

import { ArrowRight, Check, Clock3, Contrast, MessageSquareReply, Pencil, Plus, Star, TriangleAlert, Zap } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { cn } from "@/components/cn";
import { OPEN_DAY_EVENT } from "@/components/work-log/deck-search";
import { EmptyDayActions } from "@/components/work-log/open-day-bar";
import { MarkdownContent } from "@/components/work-log/markdown-editor";
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

/**
 * The sprint as an accordion of day columns (2026-10-09 redesign): every
 * weekday is a slim column; the selected one grows into the day's log.
 * Selection is client state so the grow/shrink can animate; it's mirrored to
 * `?day=` with replaceState so a reload or shared link lands on the same day.
 * Below lg the columns become rows and the open day expands in place.
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
      document.getElementById(`wl-day-${key}`)?.closest(".wl-col")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    window.addEventListener(OPEN_DAY_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_DAY_EVENT, onOpen);
  }, []);

  return (
    <ol className="wl-strip" aria-label="Days of the sprint">
      {items.map((item, index) => {
        const style = { "--i": index } as CSSProperties;
        if (item.kind === "weekend") {
          return (
            <li key={item.key} className="wl-col wl-weekend" style={style} aria-hidden="true">
              <span className="wl-vert text-2xs font-semibold tracking-[0.18em] text-text-subtle uppercase">Weekend</span>
            </li>
          );
        }
        const open = item.key === selected;
        return (
          <li key={item.key} className="wl-col" data-state={item.state} data-today={item.isToday || undefined} data-open={open || undefined} style={style}>
            <DayFace item={item} open={open} onSelect={() => select(item.key)} />
            {open ? <DayCard item={item} /> : null}
          </li>
        );
      })}
    </ol>
  );
}

/** The collapsed column (a row below lg): date on top, a vertical label, a state mark. */
function DayFace({ item, open, onSelect }: { item: DayItem; open: boolean; onSelect: () => void }) {
  const { log } = item;
  const counts = `${item.ticketCount} ${item.ticketCount === 1 ? "ticket" : "tickets"} · ${item.meetingCount} ${item.meetingCount === 1 ? "meeting" : "meetings"}`;
  let label: ReactNode;
  if (log && log.dayType !== "Work") label = <><b>{DAY_OFF_LABEL[log.dayType]}</b> · day off</>;
  else if (log) label = <><b>{log.title ?? "Work day"}</b> · {counts}</>;
  else if (item.state === "today") label = <b>Today · start log</b>;
  else if (item.state === "missing") label = <b>No log · add one</b>;
  else label = item.isLast ? "Sprint ends" : "Upcoming";

  const mark =
    item.state === "today" && !log ? <Zap className="wl-zap size-4" aria-hidden="true" />
    : item.state === "missing" ? <Plus className="size-4" aria-hidden="true" />
    : log && log.dayType === "Work" ? <span className="wl-dot" aria-hidden="true" />
    : null;

  const inner = (
    <>
      <span className="wl-face-date">
        <span className="text-2xs font-semibold tracking-[0.1em] uppercase opacity-80">{item.weekday}</span>
        {/* Spaces for screen readers: the name read out is "Wed 30, No log · add one", not "Wed30No log". */}
        <span className="sr-only"> </span>
        <span className="text-xl font-semibold tabular-nums">{item.dayNumber}</span>
      </span>
      <span className="sr-only">, </span>
      <span className="wl-face-label">{label}</span>
      <span className="wl-face-mark">{mark}</span>
    </>
  );

  if (item.state === "future") {
    return <span className="wl-face" aria-label={`${item.weekdayLong} ${item.dayNumber}: ${item.isLast ? "sprint ends" : "upcoming"}`}>{inner}</span>;
  }
  return (
    <button type="button" className="wl-face" onClick={onSelect} aria-expanded={open} aria-controls={`wl-day-${item.key}`} tabIndex={open ? -1 : 0}>
      {inner}
    </button>
  );
}

/** The open day: the big date and title, then Summary and To-dos beside Follow-ups and Notes. */
function DayCard({ item }: { item: DayItem }) {
  const { log, tracker } = item;
  const chip =
    log && log.dayType !== "Work" ? { label: "Day off", icon: null, className: "bg-surface-2 text-text-muted" }
    : log ? { label: "Logged", icon: <Check className="size-3.5" aria-hidden="true" />, className: "bg-primary-subtle text-accent-text" }
    : item.state === "today" ? { label: "Today", icon: <Zap className="size-3.5" aria-hidden="true" />, className: "bg-sidebar text-sidebar-fg" }
    : { label: "No log", icon: null, className: "bg-warning-subtle text-warning" };
  const titleParts = log?.title?.split("|").map((part) => part.trim()).filter(Boolean) ?? [];

  return (
    <section id={`wl-day-${item.key}`} aria-labelledby={`wl-day-${item.key}-heading`} className="wl-card-open wl-scroll">
      <div className="wl-reveal @container flex flex-col gap-5 p-5 md:p-6 xl:p-8">
        {/* Date, day and actions on one row; they wrap only on a narrow card. */}
        <header className={cn("flex flex-wrap items-center gap-x-4 gap-y-3", log && "@lg:flex-nowrap")} style={{ "--i": 0 } as CSSProperties}>
          <span className="wl-numeral shrink-0" aria-hidden="true">{item.dayNumber}</span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="text-xs font-semibold tracking-[0.14em] whitespace-nowrap text-text-muted uppercase">{item.weekdayLong} · {item.month}</p>
            <span className={cn("inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", chip.className)}>{chip.icon}{chip.label}</span>
          </div>
          {log ? (
            <div className="ml-auto flex shrink-0 gap-2">
              <Link href={`/work-logs/${log.id}`} className="inline-flex h-11 items-center rounded-full border border-border bg-surface px-4 text-sm font-semibold whitespace-nowrap text-text transition-colors duration-150 hover:border-text-subtle hover:bg-surface-2 md:h-10">View full log</Link>
              <Link href={`/work-logs/${log.id}/edit`} className="inline-flex h-11 items-center gap-2 rounded-full bg-sidebar px-4 text-sm font-semibold whitespace-nowrap text-sidebar-fg transition-[background-color,transform] duration-150 hover:bg-sidebar-3 active:scale-[0.98] md:h-10">
                <Pencil className="size-4" aria-hidden="true" />Edit log
              </Link>
            </div>
          ) : (
            // No log yet: start it or mark the day off, in the same right-hand spot.
            <div className="ml-auto"><EmptyDayActions date={item.key} isToday={item.isToday} /></div>
          )}
        </header>

        <h2 id={`wl-day-${item.key}-heading`} className="text-xl leading-snug font-semibold tracking-[-0.015em] text-text lg:text-2xl" style={{ "--i": 1 } as CSSProperties}>
          {titleParts.length
            ? titleParts.map((part, index) => <span key={index}>{index ? <span className="mx-2 font-normal text-border" aria-hidden="true">|</span> : null}{part}</span>)
            : log ? (log.dayType === "Work" ? "Work day" : `${DAY_OFF_LABEL[log.dayType]} · day off`)
            : item.state === "today" ? "Today’s log isn’t started" : "No log for this day"}
        </h2>

        {(() => {
          // The day's Tracker lists in a fixed order (to-dos, follow-ups, notes); only
          // the ones with something in them. The first goes on the right; the second
          // drops under Summary on the left to balance; a third goes back on the right
          // (owner, 2026-10-09).
          const lists = [
            tracker.todos.length ? <Todos key="t" todos={tracker.todos} /> : null,
            tracker.followUps.length ? <FollowUps key="f" followUps={tracker.followUps} /> : null,
            tracker.notes.length ? <Notes key="n" notes={tracker.notes} /> : null,
          ].filter(Boolean);
          const left = [hasSummary(item) ? <Summary key="s" item={item} /> : null, lists[1] ?? null].filter(Boolean);
          const right = [lists[0] ?? null, lists[2] ?? null].filter(Boolean);
          const columns = [left, right].filter((column) => column.length);
          if (!columns.length) return <p className="text-base text-text-subtle" style={{ "--i": 2 } as CSSProperties}>Nothing recorded for this day.</p>;
          return (
            <div className={cn("grid items-start gap-x-8 gap-y-7", columns.length === 2 && "@lg:grid-cols-2")}>
              {columns.map((column, index) => (
                <div key={index} className="flex min-w-0 flex-col gap-6" style={{ "--i": 2 + index } as CSSProperties}>{column}</div>
              ))}
            </div>
          );
        })()}
      </div>
    </section>
  );
}

function Block({ title, count, href, children }: { title: string; count?: number; href?: string; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <h3 className="flex items-center border-b border-border pb-2.5 text-xs font-semibold tracking-[0.14em] text-text-muted uppercase">
        {title}{count !== undefined ? <span className="ml-1.5 tabular-nums">{count}</span> : null}
        {href ? (
          <Link href={href} className="group/tr ml-auto -my-2 inline-flex min-h-9 items-center gap-1 px-1 text-sm font-semibold tracking-normal text-accent-text normal-case">
            Open<ArrowRight className="size-3.5 transition-transform duration-200 group-hover/tr:translate-x-0.5" aria-hidden="true" />
          </Link>
        ) : null}
      </h3>
      <div className="pt-2">{children}</div>
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

const DONE: WorkflowStatus[] = ["Done", "Released"];

/** Summary shows only when there's a log with something to say (no log: the header offers Start log). */
function hasSummary({ log }: DayItem) {
  return log !== null && (log.dayType !== "Work" || Boolean(log.summary) || log.tickets.length > 0);
}

/**
 * The AI summary when there is one; otherwise one row per ticket update, marked
 * by its status. A day without a log offers to start one.
 */
function Summary({ item }: { item: DayItem }) {
  const { log } = item;
  return (
    <Block title="Summary">
      {!log ? null : log.dayType !== "Work" ? (
        <Empty>Marked as {log.dayType === "Holiday" ? "a holiday" : "leave"} — nothing to log.</Empty>
      ) : log.summary ? (
        <div className="wl-summary-md"><MarkdownContent value={log.summary} className="text-base text-text" /></div>
      ) : log.tickets.length ? (
        <ul className="flex flex-col">
          {log.tickets.map((ticket) => {
            const done = DONE.includes(ticket.status);
            const progress = ticket.status === "InProgress";
            return (
              <li key={ticket.id} className="flex gap-3 border-b border-border py-2.5 text-base leading-relaxed text-text last:border-b-0">
                <span className={cn("mt-px grid size-5.5 shrink-0 place-items-center rounded-full", done ? "bg-primary text-primary-fg" : progress ? "bg-status-progress-bg text-status-progress" : "bg-surface-2 text-text-subtle")} aria-hidden="true">
                  {done ? <Check className="size-3.5" strokeWidth={3} /> : progress ? <Contrast className="size-3.5" /> : <Clock3 className="size-3.5" />}
                </span>
                <span>
                  {done ? "Completed" : progress ? "Made progress on" : "Worked on"} ticket{" "}
                  <span className={cn("rounded-md px-1.5 py-0.5 tabular-nums", progress ? "bg-status-progress-bg text-status-progress-fg" : "bg-primary-subtle text-accent-text")}>{ticket.key}</span>{" "}
                  {firstLine(ticket.description) || ticket.title}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </Block>
  );
}

const TODO_ORDER = { overdue: 0, due: 1, added: 2, done: 3 } as const;

/**
 * Every to-do is the same tinted card (owner's pick, 2026-10-09): an icon disc,
 * the state in bold, then the to-do. The tint says the state: overdue amber,
 * due red, created that day teal, done green (tick only, no word).
 */
const TODO_LOOK = {
  overdue: { label: "Overdue", card: "bg-warning-subtle", disc: "bg-wl-amber text-text", meta: "text-warning", Icon: TriangleAlert },
  due: { label: "Due today", card: "bg-danger-subtle", disc: "bg-danger text-danger-fg", meta: "text-danger", Icon: Clock3 },
  added: { label: "Created", card: "bg-primary-subtle", disc: "bg-primary text-primary-fg", meta: "text-accent-text", Icon: Plus },
  done: { label: null, card: "bg-status-completed-bg", disc: "bg-status-completed text-primary-fg", meta: "text-status-completed-fg", Icon: Check },
} as const;

function Todos({ todos }: { todos: DeckTracker["todos"] }) {
  const sorted = [...todos].sort((a, b) => TODO_ORDER[a.state] - TODO_ORDER[b.state]);
  return (
    <Block title="To-do list" count={todos.length} href="/tracker">
      {sorted.length ? (
        <ul className="flex flex-col gap-2">
          {sorted.map((todo) => {
            // Finished on a later day: keep what it was that day, but tint it done and strike it through.
            const look = todo.doneLater ? { ...TODO_LOOK[todo.state], card: TODO_LOOK.done.card, disc: TODO_LOOK.done.disc, meta: TODO_LOOK.done.meta, Icon: Check } : TODO_LOOK[todo.state];
            const struck = todo.state === "done" || todo.doneLater;
            return (
              <li key={todo.id} className={cn("flex gap-3 rounded-2xl px-3.5 py-2.5 text-base leading-relaxed text-text", look.card)}>
                <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full", look.disc)} aria-hidden="true">
                  <look.Icon className="size-3.5" strokeWidth={2.5} />
                </span>
                <span className="min-w-0 flex-1">
                  {/* Done needs no word — the tick says it. */}
                  {look.label ? <><b className="font-semibold">{look.label}:</b>{" "}</> : <span className="sr-only">Done: </span>}
                  <span className={struck ? "line-through decoration-text-subtle" : undefined}>{todo.subject}</span>
                  {todo.state === "overdue" && todo.due ? <span className={look.meta}> · due {todo.due}</span> : null}
                  {struck && todo.doneOn ? <span className={look.meta}> · done {todo.doneOn}</span> : null}
                </span>
                {todo.pinned ? <Star className="mt-1.5 size-3.5 shrink-0 fill-current text-warning" aria-label="Important" /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </Block>
  );
}

function FollowUps({ followUps }: { followUps: DeckTracker["followUps"] }) {
  return (
    <Block title="Follow-ups" count={followUps.length} href="/tracker?view=followups">
      {followUps.length ? (
        <ul className="flex flex-col">
          {followUps.map((entry) => (
            <li key={entry.id} className="flex gap-3 border-b border-border py-3 last:border-b-0">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sidebar text-sm font-semibold text-sidebar-fg" aria-hidden="true">
                {(entry.person ?? "?").trim().charAt(0).toUpperCase()}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-base text-text">
                  <b className="font-semibold">{entry.person ?? "Someone"}</b> · {entry.subject}
                  {entry.ticketKey ? <span className="ml-1.5 rounded-md bg-primary-subtle px-1.5 py-0.5 text-sm text-accent-text tabular-nums">{entry.ticketKey}</span> : null}
                </span>
                {entry.note ? <span className="line-clamp-2 text-base text-text-muted">{entry.fromThem ? <MessageSquareReply className="mr-1 inline size-3.5 align-[-0.125em]" aria-label="Their reply:" /> : null}{entry.note}</span> : null}
                <span className="text-sm text-text-subtle">{entry.done ? "Closed" : entry.fromThem ? "They replied" : "Waiting on them"}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
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

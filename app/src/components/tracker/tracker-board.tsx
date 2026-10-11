"use client";

import {
  ArrowRight,
  CalendarDays,
  Check,
  Hash,
  MessageSquareReply,
  Plus,
  RotateCcw,
  Send,
  Star,
  Trash2,
  UserRound,
} from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { differenceInCalendarDays, format, parseISO } from "date-fns";

import {
  addFollowUpUpdate,
  createFollowUp,
  deleteFollowUp,
  rescheduleFollowUp,
  setFollowUpPinned,
  setFollowUpStatus,
  setFollowUpTags,
} from "@/actions/follow-ups";
import { cn } from "@/components/cn";
import { PageHead, SearchPill } from "@/components/shell/page-head";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Field, FormError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { TagInput } from "@/components/ui/tag-input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import type {
  EntryKind,
  FollowUpStatus,
} from "@/generated/prisma/enums";

type TrackerUpdate = {
  id: string;
  note: string;
  /** Free text from the user's channel list (Profile). */
  channel: string;
  occurredAt: string;
  /** Their reply, not something you said. Only meaningful on a follow-up. */
  fromThem: boolean;
  createdAt: string;
};

export type TrackerEntry = {
  id: string;
  kind: EntryKind;
  /** Only a follow-up is addressed to someone; to-dos and notes are yours. */
  person: string | null;
  subject: string;
  ticketKey: string | null;
  status: FollowUpStatus;
  /** Starred as a favourite — sorts first, shows in Favourites. */
  pinned: boolean;
  /** Lowercase labels; only notes use them. */
  tags: string[];
  /** "YYYY-MM-DD" or null. A plain calendar day — no time, no timezone. */
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Newest first. */
  updates: TrackerUpdate[];
};

/**
 * The board is three plain lists, one per tab. Each kind has one job:
 *   to-do      something you owe — tick it off
 *   follow-up  something you told someone — waiting on them, or they replied
 *   note       something to keep — add updates to it over time
 */
export type TrackerView = "todo" | "followups" | "notes";

const VIEWS: Array<{ id: TrackerView; kind: EntryKind; label: string }> = [
  { id: "todo", kind: "Task", label: "To-do" },
  { id: "followups", kind: "FollowUp", label: "Follow-ups" },
  { id: "notes", kind: "Note", label: "Notes" },
];

const KIND_LABEL: Record<EntryKind, string> = { Task: "To-do", FollowUp: "Follow-up", Note: "Note" };

/**
 * The user's lists from Profile, read deep in the tree (add forms, popups)
 * without threading props through every view.
 */
const ListsContext = createContext<{ channels: string[]; noteTags: string[] }>({ channels: [], noteTags: [] });

/** The channel dropdown: the user's list, plus the current value if it's since been removed. */
function ChannelSelect({ id, value, onChange, className }: { id: string; value: string; onChange: (value: string) => void; className?: string }) {
  const { channels } = useContext(ListsContext);
  const options = value && !channels.includes(value) ? [...channels, value] : channels;
  return (
    <Select id={id} value={value} className={className} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </Select>
  );
}

/** Sets `--tone` for the tinted recipes below (tokens in globals.css). */
function tone(value: string) {
  return { "--tone": value } as React.CSSProperties;
}

function todayIso() {
  // Local calendar day, not UTC: "today" means the user's today.
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** The clock never notifies us; a re-render is close enough for a date. */
function subscribeNever() {
  return () => {};
}

/** "today", "yesterday", "3d ago", or a date once it's more than a week old. */
function ago(iso: string, today: string) {
  const days = differenceInCalendarDays(parseISO(today), parseISO(iso));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return format(parseISO(iso), "d MMM");
}

const plural = (count: number, one: string, many = `${one}s`) => (count === 1 ? one : many);

/** "Thu 8 Oct" */
const dayLabel = (iso: string) => format(parseISO(iso), "EEE d MMM");

/** Run a server action, toast the outcome, refresh the board. */
function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function run(action: () => Promise<{ ok: boolean; error?: { message: string } }>, success?: string, after?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error?.message ?? "Something went wrong");
        return;
      }
      if (success) toast.success(success);
      after?.();
      router.refresh();
    });
  }
  return { run, pending };
}

// --- follow-up state ---------------------------------------------------------

type FollowState = "replied" | "waiting" | "closed";

/** Derived from the record, never stored: whoever spoke last decides it. */
function followStateOf(entry: TrackerEntry): FollowState {
  if (entry.status === "Done") return "closed";
  return entry.updates[0]?.fromThem ? "replied" : "waiting";
}

const FOLLOW_STATE: Record<FollowState, { label: string; tone: string }> = {
  replied: { label: "They replied", tone: "var(--c-tk-replied)" },
  waiting: { label: "Waiting on them", tone: "var(--c-tk-waiting)" },
  closed: { label: "Closed", tone: "var(--c-tk-done)" },
};

// --- what needs you ------------------------------------------------------------

const isOpen = (entry: TrackerEntry) => entry.status !== "Done";

/**
 * The amber "needs you" set: to-dos overdue or due today, follow-ups where they
 * replied (your turn) or whose nudge date has come. Notes never need you.
 */
function needsYou(entry: TrackerEntry, today: string) {
  if (!isOpen(entry)) return false;
  if (entry.kind === "Task") return Boolean(entry.dueDate && entry.dueDate <= today);
  if (entry.kind !== "FollowUp") return false;
  const state = followStateOf(entry);
  return state === "replied" || Boolean(entry.dueDate && entry.dueDate <= today);
}

/** The day something started needing you: the reply's day, else the due/nudge date. */
function neededSince(entry: TrackerEntry) {
  if (entry.kind === "FollowUp" && followStateOf(entry) === "replied") return entry.updates[0]!.occurredAt.slice(0, 10);
  return entry.dueDate ?? "";
}

const important = (a: TrackerEntry, b: TrackerEntry) => Number(b.pinned) - Number(a.pinned);
const byRecent = (a: TrackerEntry, b: TrackerEntry) => important(a, b) || b.updatedAt.localeCompare(a.updatedAt);
/** Dated first (soonest first), undated last. */
const byDue = (a: TrackerEntry, b: TrackerEntry) => important(a, b) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || byRecent(a, b);
/** Longest-waiting first. */
const byNeed = (a: TrackerEntry, b: TrackerEntry) => important(a, b) || neededSince(a).localeCompare(neededSince(b)) || byRecent(a, b);
const byCompleted = (a: TrackerEntry, b: TrackerEntry) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt);

function matches(entry: TrackerEntry, needle: string) {
  if (!needle) return true;
  return [entry.subject, entry.person, entry.ticketKey, ...entry.tags.map((tag) => `#${tag}`), ...entry.updates.map((u) => u.note)].join(" ").toLowerCase().includes(needle);
}

/** "in 3 days", "tomorrow", "today", "2 days late" / "3 days ago". */
function fromToday(iso: string, today: string, past: "late" | "ago") {
  const days = differenceInCalendarDays(parseISO(iso), parseISO(today));
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days > 1) return `in ${days} days`;
  return `${-days} ${plural(-days, "day")} ${past}`;
}

// --- board -------------------------------------------------------------------

/**
 * Layout "F" (2026-10-10, from the owner's Tracker redesign canvas): the page
 * title with the tab pills and search on one row; then a summary column — one
 * huge count, a bar per item, four small counts — beside a numbered queue with
 * an add pill on top. Amber (dashed) marks what needs you. The teal-and-ink
 * palette is the Work Logs deck's, scoped by `.tk-focus`. An entry opens in a
 * dialog at every width.
 */
export function TrackerBoard({
  entries,
  people,
  channels,
  savedNoteTags,
  serverToday,
  initialView,
  loadError,
}: {
  entries: TrackerEntry[];
  people: string[];
  /** Profile → Dropdown lists → Follow-up channels. */
  channels: string[];
  /** Profile → Tags → Notes: tags saved ahead of use. */
  savedNoteTags: string[];
  serverToday: string;
  initialView: TrackerView;
  loadError?: string;
}) {
  const [view, setView] = useState<TrackerView>(initialView);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const today = useSyncExternalStore(subscribeNever, todayIso, () => serverToday);
  const needle = query.trim().toLowerCase();

  const byKind = useMemo(() => {
    const next: Record<EntryKind, TrackerEntry[]> = { Task: [], FollowUp: [], Note: [] };
    for (const entry of entries) next[entry.kind].push(entry);
    return next;
  }, [entries]);

  // Tab badges: what's still open, not the grand total.
  const badge: Record<TrackerView, number> = {
    todo: byKind.Task.filter(isOpen).length,
    followups: byKind.FollowUp.filter(isOpen).length,
    notes: byKind.Note.filter(isOpen).length,
  };
  const opened = entries.find((entry) => entry.id === openId) ?? null;
  const lists = useMemo(() => ({ channels, noteTags: savedNoteTags }), [channels, savedNoteTags]);
  const tagSuggestions = mergeTags(noteTags(byKind.Note).map(([tag]) => tag), savedNoteTags);
  const openEntry = (entry: TrackerEntry) => setOpenId(entry.id);

  function choose(next: TrackerView) {
    setView(next);
    setQuery("");
    setOpenId(null);
    setShowDone(false);
    // Shallow URL update so a refresh or a link lands on the same tab, without
    // a server round-trip on every switch.
    window.history.replaceState(null, "", next === "todo" ? "/tracker" : `/tracker?view=${next}`);
  }

  function toggleDone() {
    const next = !showDone;
    setShowDone(next);
    if (!next) return;
    // The finished list renders at the foot of the queue; bring it into view.
    requestAnimationFrame(() => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.getElementById("tracker-done")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    });
  }

  function onTabKey(event: React.KeyboardEvent) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const index = VIEWS.findIndex((v) => v.id === view);
    const next = VIEWS[(index + (event.key === "ArrowRight" ? 1 : VIEWS.length - 1)) % VIEWS.length];
    choose(next.id);
    document.getElementById(`tracker-tab-${next.id}`)?.focus();
  }

  return (
    <ListsContext.Provider value={lists}>
    <div className="tk-focus flex w-full min-w-0 flex-col gap-11">
      <PageHead
        title="Tracker"
        meta={format(parseISO(today), "EEEE d MMM yyyy")}
        actions={
          <>
            <div role="tablist" aria-label="Tracker lists" onKeyDown={onTabKey} className="flex flex-wrap gap-2 md:gap-2.5">
              {VIEWS.map((item) => {
                const active = view === item.id;
                return (
                  <button
                    key={item.id}
                    id={`tracker-tab-${item.id}`}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    aria-controls="tracker-panel"
                    tabIndex={active ? 0 : -1}
                    onClick={() => choose(item.id)}
                    className={cn(
                      "inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full border px-4 text-md font-semibold whitespace-nowrap transition-colors duration-150 md:h-12 md:gap-2.5 md:px-5.5 md:text-lg",
                      active ? "border-sidebar bg-sidebar text-sidebar-fg" : "border-border bg-surface text-text hover:border-text",
                    )}
                  >
                    {item.label}
                    <span className={cn("min-w-6 rounded-full px-1.75 py-px text-center text-sm font-bold tabular-nums", active ? "bg-surface text-text" : "bg-surface-2 text-text")}>{badge[item.id]}</span>
                  </button>
                );
              })}
            </div>
            <SearchPill id="tracker-search" label="Search this list" value={query} placeholder="Search, or #tag" onChange={setQuery} shortcut className="w-full md:w-72" />
          </>
        }
      />

      {loadError ? <FormError>{loadError}</FormError> : null}

      <div className="flex flex-wrap items-start gap-x-12 gap-y-11 xl:gap-x-20">
        <Summary view={view} entries={entries} today={today} showDone={showDone} onToggleDone={toggleDone} />

        <section
          id="tracker-panel"
          role="tabpanel"
          aria-labelledby={`tracker-tab-${view}`}
          className="tk-queue flex min-w-0 flex-[999_1_33rem] flex-col"
        >
          {view === "todo" ? <TodoQueue entries={entries} today={today} needle={needle} showDone={showDone} onOpen={openEntry} /> : null}
          {view === "followups" ? <FollowUpQueue entries={byKind.FollowUp} people={people} today={today} needle={needle} showDone={showDone} onOpen={openEntry} /> : null}
          {view === "notes" ? <NoteQueue entries={byKind.Note} suggestions={tagSuggestions} today={today} needle={needle} showDone={showDone} onOpen={openEntry} onTag={(tag) => setQuery(`#${tag}`)} /> : null}
        </section>
      </div>

      {opened ? (
        <Modal open size="lg" onClose={() => setOpenId(null)} eyebrow={<EntryEyebrow entry={opened} />} title={<EntryTitle entry={opened} />}>
          <EntryBody key={opened.id} entry={opened} tagSuggestions={tagSuggestions} onDeleted={() => setOpenId(null)} />
        </Modal>
      ) : null}
    </div>
    </ListsContext.Provider>
  );
}

// --- summary column -------------------------------------------------------------

/**
 * The left column: an eyebrow, one huge count with a line under it, a bar per
 * item (dashed amber = needs you), the four counts, and the way into the
 * finished items. Always counts everything — search only narrows the queue.
 */
function Summary({ view, entries, today, showDone, onToggleDone }: { view: TrackerView; entries: TrackerEntry[]; today: string; showDone: boolean; onToggleDone: () => void }) {
  const open = entries.filter(isOpen);
  const tasks = open.filter((e) => e.kind === "Task");
  const follows = open.filter((e) => e.kind === "FollowUp");
  const notes = open.filter((e) => e.kind === "Note");

  const stats = [
    { label: "Open to-dos", value: tasks.length },
    { label: "Due this week", value: tasks.filter((e) => e.dueDate && differenceInCalendarDays(parseISO(e.dueDate), parseISO(today)) <= 7).length },
    { label: "Waiting on others", value: follows.filter((e) => followStateOf(e) === "waiting").length },
    { label: "Notes", value: notes.length },
  ];

  let hero: { eyebrow: string; needs: boolean; count: number; line: string; sub: string; bars: [number, number]; caption: string; done: number; doneLabel: string };

  if (view === "todo") {
    const needs = open.filter((e) => needsYou(e, today));
    const coming = tasks.length - needs.filter((e) => e.kind === "Task").length;
    const overdue = needs.filter((e) => e.kind === "Task" && e.dueDate! < today).length;
    const dueToday = needs.filter((e) => e.kind === "Task" && e.dueDate === today).length;
    const replies = needs.filter((e) => e.kind === "FollowUp" && followStateOf(e) === "replied").length;
    const nudges = needs.length - overdue - dueToday - replies;
    const parts = [
      overdue ? `${overdue} overdue ${plural(overdue, "to-do")}` : "",
      dueToday ? `${dueToday} due today` : "",
      replies ? `${replies} ${plural(replies, "reply", "replies")}` : "",
      nudges ? `${nudges} ${plural(nudges, "nudge")}` : "",
    ].filter(Boolean);
    hero = {
      eyebrow: "Needs you today",
      needs: true,
      count: needs.length,
      line: needs.length === 0 ? "all caught up" : plural(needs.length, "thing needs you", "things need you"),
      sub: parts.length ? parts.join(" · ") : "Nothing overdue or waiting on you",
      bars: [needs.length, coming],
      caption: `${needs.length} ${plural(needs.length, "needs", "need")} you · ${coming} coming up`,
      done: entries.filter((e) => e.kind === "Task" && !isOpen(e)).length,
      doneLabel: "completed",
    };
  } else if (view === "followups") {
    const needs = follows.filter((e) => needsYou(e, today)).sort(byNeed);
    const replies = needs.filter((e) => followStateOf(e) === "replied").length;
    const nudges = needs.length - replies;
    const first = needs[0];
    const later = follows.length - needs.length;
    hero = {
      eyebrow: "Waiting on others",
      needs: true,
      count: needs.length,
      line:
        needs.length === 0 ? "nothing due yet"
        : replies === 0 ? plural(nudges, "nudge is due", "nudges are due")
        : nudges === 0 ? plural(replies, "reply to answer", "replies to answer")
        : "need a move from you",
      sub: first
        ? `${first.person ?? "Someone"}${needs.length > 1 ? ` and ${needs.length - 1} more` : ""} · since ${dayLabel(neededSince(first))}`
        : later ? `${later} waiting, none due` : "No one to chase",
      bars: [needs.length, later],
      caption: `${follows.length} ${plural(follows.length, "follow-up")} · ${nudges} ${plural(nudges, "needs", "need")} a nudge${replies ? ` · ${replies} replied` : ""}`,
      done: entries.filter((e) => e.kind === "FollowUp" && !isOpen(e)).length,
      doneLabel: "closed",
    };
  } else {
    hero = {
      eyebrow: "Notes",
      needs: false,
      count: notes.length,
      line: plural(notes.length, "note saved", "notes saved"),
      sub: "Find one with search or a #tag",
      bars: [0, notes.length],
      caption: `${notes.length} ${plural(notes.length, "note")}`,
      done: entries.filter((e) => e.kind === "Note" && !isOpen(e)).length,
      doneLabel: "archived",
    };
  }

  // One bar per item, capped so a long list doesn't become a wall.
  const BAR_CAP = 40;
  const amberBars = Math.min(hero.bars[0], BAR_CAP);
  const tealBars = Math.min(hero.bars[1], BAR_CAP - amberBars);

  return (
    <section aria-label="Summary" className="flex min-w-0 flex-[1_1_22.5rem] flex-col gap-7.5 lg:sticky lg:top-6">
      <div className="flex flex-col gap-3.5">
        <p className={cn("tk-eyebrow", hero.needs ? "text-warning" : "text-accent-text")}>{hero.eyebrow}</p>
        <h2 className="flex flex-col gap-5">
          <span className="tk-hero">{hero.count}</span>
          <span className="tk-hero-line">{hero.line}</span>
        </h2>
        <p className="text-lg text-text-muted" suppressHydrationWarning>{hero.sub}</p>
      </div>

      {amberBars + tealBars > 0 ? (
        <div className="flex flex-col gap-2.5">
          <div aria-hidden="true" className="flex flex-wrap gap-1.5">
            {Array.from({ length: amberBars }, (_, i) => <span key={`a${i}`} className="tk-bar" data-needs="" />)}
            {Array.from({ length: tealBars }, (_, i) => <span key={`t${i}`} className="tk-bar" />)}
          </div>
          <p className="text-base text-text-muted">{hero.caption}</p>
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-[var(--c-tk-rule)] py-6">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-row-reverse items-baseline justify-end gap-3">
            <dt className="tk-label text-text-muted">{stat.label}</dt>
            <dd className="tk-stat">{stat.value}</dd>
          </div>
        ))}
      </dl>

      {hero.done > 0 ? (
        <button
          type="button"
          aria-expanded={showDone}
          aria-controls="tracker-done"
          onClick={onToggleDone}
          className="flex h-11 cursor-pointer items-center gap-2 self-start text-lg font-semibold text-accent-text hover:underline"
        >
          {hero.done} {hero.doneLabel}
          <ArrowRight className={cn("size-4.5 transition-transform duration-150 motion-reduce:transition-none", showDone && "rotate-90")} strokeWidth={2} aria-hidden="true" />
        </button>
      ) : null}
    </section>
  );
}

// --- queue parts ---------------------------------------------------------------

/** An uppercase group label over numbered rows; an empty group keeps its rule and says so. */
function Group({ id, label, count, needs = false, first = false, empty, children }: { id?: string; label: string; count: number; needs?: boolean; first?: boolean; empty: string; children?: React.ReactNode }) {
  return (
    <section id={id} aria-label={label} className="scroll-mt-6">
      <h3 className={cn("tk-eyebrow pb-3.5", !first && "border-t border-border pt-9", needs ? "text-warning" : "text-accent-text")}>
        {label} · <span className="tabular-nums">{count}</span>
      </h3>
      {count === 0 ? (
        <p className={cn("border-t-2 py-5.5 text-lg text-text-muted", needs ? "border-dashed border-[var(--c-wl-dash)]" : "border-text")}>{empty}</p>
      ) : (
        <ol>{children}</ol>
      )}
    </section>
  );
}

/**
 * One numbered row: big index, title (opens the entry), a meta line, actions.
 * The first row of a group carries the heavy rule — dashed amber when it needs you.
 */
function Row({ index, needs, first, muted = false, title, meta, actions, onOpen }: { index: number; needs: boolean; first: boolean; muted?: boolean; title: string; meta: React.ReactNode; actions: React.ReactNode; onOpen: () => void }) {
  return (
    <li className={cn("flex flex-wrap items-center gap-x-6 gap-y-3 py-5.5", first ? (needs ? "border-t-2 border-dashed border-[var(--c-wl-dash)]" : "border-t-2 border-text") : "border-t border-border")}>
      <span className="tk-index" data-needs={needs ? "" : undefined} aria-hidden="true">{String(index).padStart(2, "0")}</span>
      <div className="flex min-w-0 flex-[1_1_12rem] flex-col gap-1.5 md:flex-[1_1_18.75rem]">
        <button type="button" onClick={onOpen} className={cn("tk-row-title min-h-7 w-fit max-w-full cursor-pointer py-0.5 text-left [overflow-wrap:anywhere] decoration-2 underline-offset-4 hover:underline", muted && "text-text-muted line-through")}>
          {title}
        </button>
        {meta}
      </div>
      <div className="flex flex-none items-center gap-1.5 max-md:pl-25">{actions}</div>
    </li>
  );
}

const PILL = "inline-flex h-11 shrink-0 cursor-pointer items-center rounded-full border px-5 text-md font-semibold whitespace-nowrap transition-colors duration-150 disabled:cursor-wait disabled:opacity-60";
const PILL_INK = "border-sidebar bg-sidebar text-sidebar-fg hover:bg-sidebar-3";
const PILL_LINE = "border-[var(--c-tk-rule)] bg-surface text-text hover:border-text";

/** A row's text button that runs one server action. */
function ActionPill({ ink = false, label, action, success }: { ink?: boolean; label: string; action: () => Promise<{ ok: boolean; error?: { message: string } }>; success: string }) {
  const { run, pending } = useRun();
  return (
    <button type="button" disabled={pending} onClick={() => run(action, success)} className={cn(PILL, ink ? PILL_INK : PILL_LINE)}>
      {label}
    </button>
  );
}

function OpenPill({ ink = false, onOpen }: { ink?: boolean; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} className={cn(PILL, ink ? PILL_INK : PILL_LINE)}>Open</button>;
}

/** The star on a row: favourite on/off (favourites sort first and show in Favourites). */
function FavouriteToggle({ entry }: { entry: TrackerEntry }) {
  const { run, pending } = useRun();
  const label = entry.pinned ? "Remove from favourites" : "Mark as favourite";
  return (
    <button
      type="button"
      aria-pressed={entry.pinned}
      aria-label={`${label}: ${entry.subject}`}
      title={label}
      disabled={pending}
      onClick={() => run(() => setFollowUpPinned({ followUpId: entry.id, pinned: !entry.pinned }), entry.pinned ? "Removed from favourites" : "Added to favourites")}
      className={cn("grid size-11 shrink-0 cursor-pointer place-items-center rounded-full transition-colors duration-150 hover:bg-surface-2 disabled:cursor-wait", entry.pinned ? "text-[var(--c-wl-dash)]" : "text-text-subtle hover:text-text")}
    >
      <Star className={cn("size-5", entry.pinned && "fill-current")} strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}

/** Keeps the actions column aligned on rows that have no star (as in the mockup). */
function Spacer() {
  return <span aria-hidden="true" className="size-11 shrink-0" />;
}

function Avatar({ name }: { name: string }) {
  return (
    <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-wl-amber text-sm font-bold text-text">
      {initials(name)}
    </span>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase() || "?";
}

const markDone = (entry: TrackerEntry) => () => setFollowUpStatus({ followUpId: entry.id, status: "Done" });
const markOpen = (entry: TrackerEntry) => () => setFollowUpStatus({ followUpId: entry.id, status: "Open" });

/** "Mark nudged": record that you chased them (append-only), then clear the nudge date. */
function useNudge(entry: TrackerEntry) {
  const { channels } = useContext(ListsContext);
  return async () => {
    const recorded = await addFollowUpUpdate({ followUpId: entry.id, note: "Nudged", channel: entry.updates[0]?.channel ?? channels[0] ?? "Slack", fromThem: false });
    if (!recorded.ok) return recorded;
    return rescheduleFollowUp({ followUpId: entry.id, dueDate: null });
  };
}

function NudgePill({ entry, ink }: { entry: TrackerEntry; ink: boolean }) {
  const nudge = useNudge(entry);
  return <ActionPill ink={ink} label="Mark nudged" action={nudge} success="Nudge recorded" />;
}

// --- add pill ------------------------------------------------------------------

/**
 * The dashed pill at the top of each queue: a text field, a few tool buttons
 * (each may open a small panel under the pill) and Add. Enter saves.
 */
function AddPill({ label, inputId, placeholder, value, onChange, onSubmit, pending, error, tools, panel }: {
  label: string;
  inputId: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  pending: boolean;
  error?: string;
  tools: React.ReactNode;
  panel: React.ReactNode;
}) {
  return (
    <form aria-label={label} onSubmit={(event) => { event.preventDefault(); onSubmit(); }} className="relative mb-8">
      <div className="tk-add flex items-center gap-0.5 rounded-full bg-surface py-1 pr-1 pl-5.5">
        <label htmlFor={inputId} className="flex h-13 min-w-0 flex-1 items-center gap-3.5 text-primary">
          <Plus className="size-5 shrink-0" strokeWidth={2.2} aria-hidden="true" />
          <span className="sr-only">{label}</span>
          <input
            id={inputId}
            value={value}
            maxLength={300}
            placeholder={placeholder}
            aria-invalid={error ? true : undefined}
            onChange={(event) => onChange(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-lg text-text outline-none placeholder:text-text-muted"
          />
        </label>
        {tools}
        <button type="submit" disabled={pending} className="h-13 shrink-0 cursor-pointer rounded-full bg-sidebar px-5 text-lg font-semibold text-sidebar-fg transition-colors duration-150 hover:bg-sidebar-3 disabled:cursor-wait disabled:opacity-60 md:px-6.5">
          Add
        </button>
      </div>
      {panel}
      {error ? <p className="mt-2 px-5.5 text-base font-medium text-danger" role="alert">{error}</p> : null}
    </form>
  );
}

/** An icon button inside the add pill. `expanded` for panel triggers, `pressed` for toggles. */
function ToolButton({ label, expanded, pressed, onClick, className, children }: { label: string; expanded?: boolean; pressed?: boolean; onClick: () => void; className?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-expanded={expanded}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn("inline-flex h-13 min-w-11 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full px-2.5 text-base font-semibold text-text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-text md:min-w-12", className)}
    >
      {children}
    </button>
  );
}

/** A small panel under the add pill. Escape or a click outside the form closes it. */
function PillPanel({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("input, select, button")?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }
    function onPointerDown(event: MouseEvent) {
      if (!ref.current?.closest("form")?.contains(event.target as Node)) onCloseRef.current();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, []);

  return (
    <div ref={ref} role="group" aria-label={label} className="t-dropdown absolute top-full right-0 z-30 mt-2 flex w-80 max-w-full flex-col gap-4 rounded-xl border border-border bg-surface p-4 shadow-md">
      {children}
      <Button size="sm" variant="secondary" className="self-end" onClick={onClose}>Done</Button>
    </div>
  );
}

/** Shared date panel for due / nudge dates. */
function DatePanel({ id, label, value, onChange, onClose }: { id: string; label: string; value: string; onChange: (value: string) => void; onClose: () => void }) {
  return (
    <PillPanel label={label} onClose={onClose}>
      <Field label={label} htmlFor={id}>
        <Input id={id} type="date" value={value} onChange={(event) => onChange(event.target.value)} />
      </Field>
      {value ? <button type="button" onClick={() => onChange("")} className="w-fit cursor-pointer text-sm font-semibold text-accent-text hover:underline">Clear date</button> : null}
    </PillPanel>
  );
}

function DateTool({ label, value, expanded, onClick }: { label: string; value: string; expanded: boolean; onClick: () => void }) {
  return (
    <ToolButton label={value ? `${label}: ${dayLabel(value)}` : label} expanded={expanded} onClick={onClick} className={value ? "text-text" : undefined}>
      <CalendarDays className="size-5" strokeWidth={1.8} aria-hidden="true" />
      {value ? <span className="hidden md:inline">{format(parseISO(value), "d MMM")}</span> : null}
    </ToolButton>
  );
}

function StarTool({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return (
    <ToolButton label="Mark as favourite" pressed={value} onClick={() => onChange(!value)} className="text-warning hover:text-warning">
      <Star className={cn("size-5", value && "fill-current")} strokeWidth={1.8} aria-hidden="true" />
    </ToolButton>
  );
}

/** Create an entry, then star it if asked. Shared by the three add pills. */
function useCreate(onSaved: () => void) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  function create(
    input: { kind: EntryKind; subject: string; person?: string; note?: string; channel?: string; dueDate?: string | null; tags?: string[] },
    pinned: boolean,
  ) {
    startTransition(async () => {
      const result = await createFollowUp(input);
      if (!result.ok) {
        const fields = result.error.fields ?? {};
        setError(Object.values(fields)[0] ?? result.error.message);
        return;
      }
      if (pinned) await setFollowUpPinned({ followUpId: result.data.id, pinned: true });
      toast.success(`${KIND_LABEL[input.kind]} added`);
      setError(undefined);
      onSaved();
      router.refresh();
    });
  }
  return { create, pending, error, setError };
}

// --- to-do ---------------------------------------------------------------------

/**
 * Needs you (overdue / due-today to-dos, plus follow-ups whose nudge is due or
 * who replied) → Coming up (later and undated to-dos) → Completed on request.
 */
function TodoQueue({ entries, today, needle, showDone, onOpen }: { entries: TrackerEntry[]; today: string; needle: string; showDone: boolean; onOpen: (entry: TrackerEntry) => void }) {
  const { needs, coming, done } = useMemo(() => {
    const groups = { needs: [] as TrackerEntry[], coming: [] as TrackerEntry[], done: [] as TrackerEntry[] };
    for (const entry of entries) {
      if (entry.kind === "Note" || !matches(entry, needle)) continue;
      if (needsYou(entry, today)) groups.needs.push(entry);
      else if (entry.kind !== "Task") continue;
      else if (isOpen(entry)) groups.coming.push(entry);
      else groups.done.push(entry);
    }
    groups.needs.sort(byNeed);
    groups.coming.sort(byDue);
    groups.done.sort(byCompleted);
    return groups;
  }, [entries, today, needle]);

  const nothing = needle ? "Nothing matches." : undefined;
  let index = 0;

  return (
    <>
      <AddTodo />
      <Group label="Needs you" count={needs.length} needs first empty={nothing ?? "Nothing overdue, due today or waiting on you."}>
        {needs.map((entry, i) => entry.kind === "Task"
          ? <TodoRow key={entry.id} index={++index} entry={entry} today={today} needs first={i === 0} onOpen={() => onOpen(entry)} />
          : <FollowUpRow key={entry.id} index={++index} entry={entry} today={today} needs first={i === 0} inTodo onOpen={() => onOpen(entry)} />)}
      </Group>
      <Group label="Coming up" count={coming.length} empty={nothing ?? "Nothing else on the list. Add a to-do above."}>
        {coming.map((entry, i) => <TodoRow key={entry.id} index={++index} entry={entry} today={today} needs={false} first={i === 0} onOpen={() => onOpen(entry)} />)}
      </Group>
      {showDone && done.length ? (
        <Group id="tracker-done" label="Completed" count={done.length} empty="">
          {done.map((entry, i) => <TodoRow key={entry.id} index={++index} entry={entry} today={today} needs={false} first={i === 0} onOpen={() => onOpen(entry)} />)}
        </Group>
      ) : null}
    </>
  );
}

function AddTodo() {
  const [subject, setSubject] = useState("");
  const [date, setDate] = useState("");
  const [pinned, setPinned] = useState(false);
  const [panel, setPanel] = useState(false);
  const { create, pending, error, setError } = useCreate(() => { setSubject(""); setDate(""); setPinned(false); setPanel(false); });

  function save() {
    if (pending) return;
    // The button is always live (a greyed CTA reads as broken); empty → point at the field.
    if (!subject.trim()) { setError("Write the to-do first"); document.getElementById("add-todo")?.focus(); return; }
    create({ kind: "Task", subject: subject.trim().slice(0, 300), dueDate: date || null }, pinned);
  }

  return (
    <AddPill
      label="Add a to-do"
      inputId="add-todo"
      placeholder="Add a to-do…"
      value={subject}
      onChange={(value) => { setSubject(value); setError(undefined); }}
      onSubmit={save}
      pending={pending}
      error={error}
      tools={
        <>
          <DateTool label="Set due date" value={date} expanded={panel} onClick={() => setPanel(!panel)} />
          <StarTool value={pinned} onChange={setPinned} />
        </>
      }
      panel={panel ? <DatePanel id="add-todo-date" label="Due date" value={date} onChange={setDate} onClose={() => setPanel(false)} /> : null}
    />
  );
}

/** "Overdue · due Thu 8 Oct · 2 days late", "Due Tue 13 Oct · in 3 days", "Someday · no date". */
function todoMeta(entry: TrackerEntry, today: string) {
  if (!isOpen(entry)) return entry.completedAt ? `Done ${format(parseISO(entry.completedAt), "EEE d MMM")}` : "Done";
  if (!entry.dueDate) return "Someday · no date";
  if (entry.dueDate < today) return `Overdue · due ${dayLabel(entry.dueDate)} · ${fromToday(entry.dueDate, today, "late")}`;
  if (entry.dueDate === today) return "Due today";
  return `Due ${dayLabel(entry.dueDate)} · ${fromToday(entry.dueDate, today, "late")}`;
}

function TodoRow({ index, entry, today, needs, first, onOpen }: { index: number; entry: TrackerEntry; today: string; needs: boolean; first: boolean; onOpen: () => void }) {
  const done = !isOpen(entry);
  const notes = entry.updates.length;
  return (
    <Row
      index={index}
      needs={needs}
      first={first}
      muted={done}
      title={entry.subject}
      onOpen={onOpen}
      meta={
        <p className={cn("text-base font-medium", needs ? "text-warning" : "text-text-muted")} suppressHydrationWarning>
          {todoMeta(entry, today)}{notes ? ` · ${notes} ${plural(notes, "note")}` : ""}
        </p>
      }
      actions={
        <>
          {done
            ? <ActionPill label="Reopen" action={markOpen(entry)} success="Reopened" />
            : <ActionPill ink={needs} label="Mark done" action={markDone(entry)} success="Done" />}
          <FavouriteToggle entry={entry} />
        </>
      }
    />
  );
}

// --- follow-ups ------------------------------------------------------------------

/**
 * Your turn (they replied) → Nudge due → Waiting, not due yet → Closed on
 * request. "Got it" closes a follow-up; "Mark nudged" records a nudge.
 */
function FollowUpQueue({ entries, people, today, needle, showDone, onOpen }: { entries: TrackerEntry[]; people: string[]; today: string; needle: string; showDone: boolean; onOpen: (entry: TrackerEntry) => void }) {
  const groups = useMemo(() => {
    const next = { replied: [] as TrackerEntry[], due: [] as TrackerEntry[], waiting: [] as TrackerEntry[], closed: [] as TrackerEntry[] };
    for (const entry of entries) {
      if (!matches(entry, needle)) continue;
      const state = followStateOf(entry);
      if (state === "closed") next.closed.push(entry);
      else if (state === "replied") next.replied.push(entry);
      else if (needsYou(entry, today)) next.due.push(entry);
      else next.waiting.push(entry);
    }
    next.replied.sort(byNeed);
    next.due.sort(byNeed);
    // Not due yet: soonest nudge first, then whoever has waited longest.
    next.waiting.sort((a, b) => important(a, b) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.updatedAt.localeCompare(b.updatedAt));
    next.closed.sort(byCompleted);
    return next;
  }, [entries, today, needle]);

  const nothing = needle ? "Nothing matches." : undefined;
  let index = 0;
  const hasReplies = groups.replied.length > 0;

  return (
    <>
      <AddFollowUp people={people} />
      {hasReplies ? (
        <Group label="Your turn" count={groups.replied.length} needs first empty="">
          {groups.replied.map((entry, i) => <FollowUpRow key={entry.id} index={++index} entry={entry} today={today} needs first={i === 0} onOpen={() => onOpen(entry)} />)}
        </Group>
      ) : null}
      <Group label="Nudge due" count={groups.due.length} needs first={!hasReplies} empty={nothing ?? "No nudges due."}>
        {groups.due.map((entry, i) => <FollowUpRow key={entry.id} index={++index} entry={entry} today={today} needs first={i === 0} onOpen={() => onOpen(entry)} />)}
      </Group>
      <Group label="Waiting, not due yet" count={groups.waiting.length} empty={nothing ?? "Nothing else is waiting on anyone."}>
        {groups.waiting.map((entry, i) => <FollowUpRow key={entry.id} index={++index} entry={entry} today={today} needs={false} first={i === 0} onOpen={() => onOpen(entry)} />)}
      </Group>
      {showDone && groups.closed.length ? (
        <Group id="tracker-done" label="Closed" count={groups.closed.length} empty="">
          {groups.closed.map((entry, i) => <FollowUpRow key={entry.id} index={++index} entry={entry} today={today} needs={false} first={i === 0} onOpen={() => onOpen(entry)} />)}
        </Group>
      ) : null}
    </>
  );
}

function AddFollowUp({ people }: { people: string[] }) {
  const { channels } = useContext(ListsContext);
  const [subject, setSubject] = useState("");
  const [person, setPerson] = useState("");
  const [channel, setChannel] = useState(channels[0] ?? "Slack");
  const [date, setDate] = useState("");
  const [pinned, setPinned] = useState(false);
  const [panel, setPanel] = useState<"who" | "date" | null>(null);
  const { create, pending, error, setError } = useCreate(() => { setSubject(""); setPerson(""); setDate(""); setPinned(false); setPanel(null); });

  function save() {
    if (pending) return;
    if (!subject.trim()) { setError("Write what you're waiting on first"); document.getElementById("add-follow-up")?.focus(); return; }
    if (!person.trim()) { setError("Who are you waiting on?"); setPanel("who"); return; }
    create(
      {
        kind: "FollowUp",
        person: person.trim(),
        subject: subject.trim().slice(0, 300),
        // The first message is a real record row, so "you wrote 3d ago via Slack"
        // comes from the same place as every later nudge.
        note: subject.trim(),
        channel,
        dueDate: date || null,
      },
      pinned,
    );
  }

  return (
    <AddPill
      label="Add a follow-up"
      inputId="add-follow-up"
      placeholder="Add a follow-up…"
      value={subject}
      onChange={(value) => { setSubject(value); setError(undefined); }}
      onSubmit={save}
      pending={pending}
      error={error}
      tools={
        <>
          <ToolButton label={person ? `Waiting on ${person}` : "Choose who you are waiting on"} expanded={panel === "who"} onClick={() => setPanel(panel === "who" ? null : "who")}>
            {person ? <Avatar name={person} /> : <UserRound className="size-5" strokeWidth={1.8} aria-hidden="true" />}
          </ToolButton>
          <DateTool label="Set nudge date" value={date} expanded={panel === "date"} onClick={() => setPanel(panel === "date" ? null : "date")} />
        </>
      }
      panel={
        panel === "who" ? (
          <PillPanel label="Who and where" onClose={() => setPanel(null)}>
            <Field label="Who" htmlFor="add-fu-person" required>
              <Input id="add-fu-person" value={person} list="add-fu-people" placeholder="e.g. Ashwini" maxLength={120} onChange={(event) => { setPerson(event.target.value); setError(undefined); }} />
              <datalist id="add-fu-people">{people.map((name) => <option key={name} value={name} />)}</datalist>
            </Field>
            <Field label="Where" htmlFor="add-fu-channel">
              <ChannelSelect id="add-fu-channel" value={channel} onChange={setChannel} />
            </Field>
          </PillPanel>
        ) : panel === "date" ? (
          <DatePanel id="add-fu-date" label="Nudge on" value={date} onChange={setDate} onClose={() => setPanel(null)} />
        ) : null
      }
    />
  );
}

/** "· nudge due Wed 7 Oct · 3 days ago", "· replied 2d ago", "· you wrote 3d ago via Slack · nudge Tue 13 Oct". */
function followMeta(entry: TrackerEntry, today: string) {
  const state = followStateOf(entry);
  const last = entry.updates[0];
  if (state === "closed") return entry.completedAt ? `closed ${ago(entry.completedAt, today)}` : "closed";
  if (state === "replied") return `replied ${ago(last!.occurredAt, today)}`;
  if (entry.dueDate && entry.dueDate <= today) return `nudge due ${dayLabel(entry.dueDate)} · ${fromToday(entry.dueDate, today, "ago")}`;
  const wrote = last ? `you wrote ${ago(last.occurredAt, today)}${last.channel ? ` via ${last.channel}` : ""}` : `added ${ago(entry.createdAt, today)}`;
  return entry.dueDate ? `${wrote} · nudge ${dayLabel(entry.dueDate)}` : wrote;
}

function FollowUpRow({ index, entry, today, needs, first, inTodo = false, onOpen }: { index: number; entry: TrackerEntry; today: string; needs: boolean; first: boolean; inTodo?: boolean; onOpen: () => void }) {
  const state = followStateOf(entry);
  const person = entry.person ?? "Someone";
  return (
    <Row
      index={index}
      needs={needs}
      first={first}
      muted={state === "closed"}
      title={entry.subject}
      onOpen={onOpen}
      meta={
        inTodo ? (
          <p className="text-base font-medium text-warning" suppressHydrationWarning>Follow-up · {person} · {followMeta(entry, today)}</p>
        ) : (
          <p className={cn("flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-base font-medium", needs ? "text-warning" : "text-text-muted")}>
            <Avatar name={person} />
            <span className="font-semibold text-text">{person}</span>
            <span suppressHydrationWarning>· {followMeta(entry, today)}</span>
          </p>
        )
      }
      actions={
        state === "closed" ? (
          <ActionPill label="Reopen" action={markOpen(entry)} success="Reopened" />
        ) : state === "replied" ? (
          <>
            <ActionPill ink label="Got it" action={markDone(entry)} success="Closed" />
            {inTodo ? <Spacer /> : <OpenPill onOpen={onOpen} />}
          </>
        ) : inTodo ? (
          <>
            <NudgePill entry={entry} ink />
            <Spacer />
          </>
        ) : (
          <>
            <NudgePill entry={entry} ink={needs} />
            <ActionPill label="Got it" action={markDone(entry)} success="Closed" />
          </>
        )
      }
    />
  );
}

// --- notes -----------------------------------------------------------------------

/** Used tags first (most used first), then saved-but-unused ones from Profile. */
function mergeTags(used: string[], saved: string[]) {
  return [...used, ...saved.filter((tag) => !used.includes(tag))];
}

/** Every tag used on these notes, most used first. */
function noteTags(entries: TrackerEntry[]) {
  const counts = new Map<string, number>();
  for (const entry of entries) for (const tag of entry.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** All notes (favourites first, then recently updated) → Archived on request. A tag chip searches for it. */
function NoteQueue({ entries, suggestions, today, needle, showDone, onOpen, onTag }: { entries: TrackerEntry[]; suggestions: string[]; today: string; needle: string; showDone: boolean; onOpen: (entry: TrackerEntry) => void; onTag: (tag: string) => void }) {
  const { live, archived } = useMemo(() => {
    const next = { live: [] as TrackerEntry[], archived: [] as TrackerEntry[] };
    for (const entry of entries) {
      if (!matches(entry, needle)) continue;
      (isOpen(entry) ? next.live : next.archived).push(entry);
    }
    next.live.sort(byRecent);
    next.archived.sort(byCompleted);
    return next;
  }, [entries, needle]);

  let index = 0;

  return (
    <>
      <AddNote suggestions={suggestions} />
      <Group label="All notes" count={live.length} first empty={needle ? "Nothing matches." : "No notes yet. Write one above."}>
        {live.map((entry, i) => <NoteRow key={entry.id} index={++index} entry={entry} today={today} first={i === 0} onOpen={() => onOpen(entry)} onTag={onTag} />)}
      </Group>
      {showDone && archived.length ? (
        <Group id="tracker-done" label="Archived" count={archived.length} empty="">
          {archived.map((entry, i) => <NoteRow key={entry.id} index={++index} entry={entry} today={today} first={i === 0} onOpen={() => onOpen(entry)} onTag={onTag} />)}
        </Group>
      ) : null}
    </>
  );
}

function AddNote({ suggestions }: { suggestions: string[] }) {
  const [subject, setSubject] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [pinned, setPinned] = useState(false);
  const [panel, setPanel] = useState(false);
  const { create, pending, error, setError } = useCreate(() => { setSubject(""); setTags([]); setPinned(false); setPanel(false); });

  function save() {
    if (pending) return;
    if (!subject.trim()) { setError("Give the note a title"); document.getElementById("add-note")?.focus(); return; }
    // Title (and tags) now; the note's text goes in as updates once it's open.
    create({ kind: "Note", subject: subject.trim().slice(0, 300), tags }, pinned);
  }

  return (
    <AddPill
      label="Add a note"
      inputId="add-note"
      placeholder="Write a note…"
      value={subject}
      onChange={(value) => { setSubject(value); setError(undefined); }}
      onSubmit={save}
      pending={pending}
      error={error}
      tools={
        <>
          <ToolButton label={tags.length ? `Tags: ${tags.join(", ")}` : "Add a tag"} expanded={panel} onClick={() => setPanel(!panel)} className={tags.length ? "text-text" : undefined}>
            <Hash className="size-5" strokeWidth={1.8} aria-hidden="true" />
            {tags.length ? <span className="tabular-nums">{tags.length}</span> : null}
          </ToolButton>
          <StarTool value={pinned} onChange={setPinned} />
        </>
      }
      panel={
        panel ? (
          <PillPanel label="Tags" onClose={() => setPanel(false)}>
            <Field label="Tags" htmlFor="add-note-tags" hint="Enter or comma adds a tag.">
              <TagInput id="add-note-tags" value={tags} onChange={setTags} suggestions={suggestions} placeholder="e.g. drupal, deploy" />
            </Field>
          </PillPanel>
        ) : null
      }
    />
  );
}

function NoteRow({ index, entry, today, first, onOpen, onTag }: { index: number; entry: TrackerEntry; today: string; first: boolean; onOpen: () => void; onTag: (tag: string) => void }) {
  const archived = !isOpen(entry);
  const firstLine = entry.updates[0]?.note.split("\n").find((line) => line.trim())?.trim();
  return (
    <Row
      index={index}
      needs={false}
      first={first}
      title={entry.subject}
      onOpen={onOpen}
      meta={
        <>
          {firstLine ? <p className="line-clamp-1 text-md text-text-muted [overflow-wrap:anywhere]">{firstLine}</p> : null}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-base font-medium text-text-muted">
            {entry.tags.map((tag) => (
              <button key={tag} type="button" onClick={() => onTag(tag)} title={`Show notes tagged #${tag}`} className="cursor-pointer rounded-full bg-primary-subtle px-2.5 py-0.5 font-semibold text-accent-text hover:underline">
                #{tag}
              </button>
            ))}
            <span suppressHydrationWarning>
              {entry.updates.length > 1 ? `${entry.updates.length} updates · ` : ""}{archived ? "Archived" : "Updated"} {ago(entry.updatedAt, today)}
            </span>
          </div>
        </>
      }
      actions={
        <>
          {archived ? <ActionPill label="Restore" action={markOpen(entry)} success="Restored" /> : <OpenPill onOpen={onOpen} />}
          <FavouriteToggle entry={entry} />
        </>
      }
    />
  );
}

// --- the opened entry ----------------------------------------------------------

function EntryEyebrow({ entry }: { entry: TrackerEntry }) {
  return (
    <span className="flex items-center gap-1.5">
      {KIND_LABEL[entry.kind]}
      {entry.pinned ? <><span aria-hidden="true">·</span><Star className="size-3.5 fill-current text-warning" aria-hidden="true" />Favourite</> : null}
    </span>
  );
}

function EntryTitle({ entry }: { entry: TrackerEntry }) {
  return <span className={cn("[overflow-wrap:anywhere]", entry.status === "Done" && entry.kind !== "Note" && "text-text-muted line-through")}>{entry.subject}</span>;
}


/** Facts, date, actions, add-an-update and the history — the opened entry's dialog. */
function EntryBody({ entry, tagSuggestions, onDeleted }: { entry: TrackerEntry; tagSuggestions: string[]; onDeleted: () => void }) {
  const { run, pending } = useRun();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isDone = entry.status === "Done";
  const kind = entry.kind;
  const state = kind === "FollowUp" ? followStateOf(entry) : null;

  const doneLabel = kind === "Note" ? (isDone ? "Restore" : "Archive") : kind === "FollowUp" ? (isDone ? "Reopen" : "Close") : isDone ? "Reopen" : "Mark done";
  const doneToast = kind === "Note" ? (isDone ? "Restored" : "Archived") : isDone ? "Reopened" : kind === "FollowUp" ? "Closed" : "Done";

  const facts: Array<{ label: string; value: React.ReactNode }> = [
    ...(entry.person ? [{ label: "With", value: entry.person }] : []),
    ...(state ? [{ label: "Status", value: <span style={tone(FOLLOW_STATE[state].tone)} className="font-semibold text-[color-mix(in_srgb,var(--tone)_80%,var(--c-text))]">{FOLLOW_STATE[state].label}</span> }] : []),
    ...(kind === "Task" ? [{ label: "Status", value: isDone ? `Done${entry.completedAt ? ` · ${format(parseISO(entry.completedAt), "d MMM")}` : ""}` : "Open" }] : []),
    ...(entry.ticketKey ? [{ label: "Ticket", value: <span className="font-mono">{entry.ticketKey}</span> }] : []),
    { label: "Added", value: format(parseISO(entry.createdAt), "d MMM yyyy") },
  ];

  return (
    <div className={cn("flex max-w-3xl flex-col gap-6", pending && "opacity-60")}>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <dl className="flex flex-wrap gap-x-8 gap-y-4">
          {facts.map((fact) => (
            <div key={fact.label} className="min-w-0">
              <dt className="text-xs text-text-subtle">{fact.label}</dt>
              <dd className="mt-1 text-sm font-medium text-text">{fact.value}</dd>
            </div>
          ))}
        </dl>
        {kind !== "Note" && !isDone ? (
          <div className="min-w-0">
            <label htmlFor={`due-${entry.id}`} className="block text-xs text-text-subtle">{kind === "Task" ? "Due" : "Nudge on"}</label>
            <Input
              id={`due-${entry.id}`}
              type="date"
              value={entry.dueDate ?? ""}
              className="mt-1 w-44"
              onChange={(event) => run(() => rescheduleFollowUp({ followUpId: entry.id, dueDate: event.target.value || null }), event.target.value ? "Date set" : "Date cleared")}
            />
          </div>
        ) : null}
      </div>

      {kind === "Note" ? <NoteTagsEditor entry={entry} suggestions={tagSuggestions} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={isDone ? "secondary" : "primary"} onClick={() => run(() => setFollowUpStatus({ followUpId: entry.id, status: isDone ? "Open" : "Done" }), doneToast)}>
          {isDone ? <RotateCcw aria-hidden="true" /> : <Check aria-hidden="true" />}
          {doneLabel}
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            aria-pressed={entry.pinned}
            aria-label={entry.pinned ? "Remove from favourites" : "Mark as favourite"}
            title={entry.pinned ? "Remove from favourites" : "Mark as favourite"}
            onClick={() => run(() => setFollowUpPinned({ followUpId: entry.id, pinned: !entry.pinned }), entry.pinned ? "Removed from favourites" : "Added to favourites")}
          >
            <Star aria-hidden="true" className={cn(entry.pinned && "fill-current text-warning")} />
          </Button>
          <Button size="sm" variant="ghost" iconOnly className="hover:text-danger" aria-label={`Delete ${entry.subject}`} title="Delete" onClick={() => setConfirmDelete(true)}>
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </div>

      <AddUpdateForm key={entry.updates.length} entry={entry} />

      <Timeline entry={entry} />

      <ConfirmationDialog
        open={confirmDelete}
        title={`Delete “${entry.subject}”?`}
        description="This removes it and everything recorded on it. It can't be undone."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          onDeleted();
          run(() => deleteFollowUp({ followUpId: entry.id }), "Deleted");
        }}
      />
    </div>
  );
}


/** Tags are labels, not history: edited in place, saved on every change. */
function NoteTagsEditor({ entry, suggestions }: { entry: TrackerEntry; suggestions: string[] }) {
  const { run } = useRun();
  // Local copy so chips update instantly; the server copy catches up on refresh.
  const [tags, setTags] = useState(entry.tags);
  return (
    <Field label="Tags" htmlFor={`tags-${entry.id}`}>
      <TagInput
        id={`tags-${entry.id}`}
        value={tags}
        suggestions={suggestions}
        placeholder="Add a tag"
        onChange={(next) => {
          setTags(next);
          run(() => setFollowUpTags({ followUpId: entry.id, tags: next }));
        }}
      />
    </Field>
  );
}

/**
 * Appends to the record. A follow-up picks who spoke — you, or them — so the
 * board knows whether it's still waiting. Nothing here edits an earlier row.
 */
function AddUpdateForm({ entry }: { entry: TrackerEntry }) {
  const { run, pending } = useRun();
  const isFollowUp = entry.kind === "FollowUp";
  const [fromThem, setFromThem] = useState(isFollowUp && followStateOf(entry) === "waiting");
  const [note, setNote] = useState("");
  const { channels } = useContext(ListsContext);
  const [channel, setChannel] = useState(entry.updates[0]?.channel ?? (isFollowUp ? (channels[0] ?? "Slack") : "Other"));
  const person = entry.person ?? "They";

  const label = isFollowUp ? (fromThem ? `What did ${person} say?` : "What did you tell them?") : entry.kind === "Task" ? "Add a note" : "Add an update";
  const canSave = fromThem || note.trim().length > 0;

  function save() {
    if (!canSave) return;
    run(
      () => addFollowUpUpdate({ followUpId: entry.id, note, channel: isFollowUp ? channel : "Other", fromThem: isFollowUp ? fromThem : false }),
      isFollowUp ? (fromThem ? "Reply recorded" : "Message recorded") : "Added",
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
      {isFollowUp ? (
        <div role="radiogroup" aria-label="Who said it" className="flex w-fit gap-1 rounded-full border border-border bg-surface p-0.5">
          {[
            { value: false, label: "I followed up", Icon: Send },
            { value: true, label: `${person} replied`, Icon: MessageSquareReply },
          ].map((option) => (
            <button
              key={String(option.value)}
              type="button"
              role="radio"
              aria-checked={fromThem === option.value}
              onClick={() => setFromThem(option.value)}
              className={cn(
                "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors duration-150",
                fromThem === option.value ? "bg-sidebar text-sidebar-fg" : "text-text-muted hover:text-text",
              )}
            >
              <option.Icon className="size-3.5" aria-hidden="true" />
              {option.label}
            </button>
          ))}
        </div>
      ) : null}

      <Field label={label} htmlFor={`note-${entry.id}`} hint={isFollowUp && fromThem ? "Optional — leave blank to just mark it replied." : undefined}>
        <Textarea
          id={`note-${entry.id}`}
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); save(); } }}
        />
      </Field>

      <div className="flex flex-wrap items-center gap-2">
        {isFollowUp ? (
          <>
            <label htmlFor={`channel-${entry.id}`} className="sr-only">Where</label>
            <ChannelSelect id={`channel-${entry.id}`} value={channel} onChange={setChannel} className="w-36" />
          </>
        ) : null}
        <Button size="sm" className="ml-auto" onClick={save} loading={pending} disabled={!canSave}>
          <Plus aria-hidden="true" />
          {isFollowUp ? (fromThem ? "Save reply" : "Save") : "Add"}
        </Button>
      </div>
    </div>
  );
}

function Timeline({ entry }: { entry: TrackerEntry }) {
  const isFollowUp = entry.kind === "FollowUp";
  const heading = isFollowUp ? "Conversation" : entry.kind === "Task" ? "Notes" : "Updates";
  return (
    <section aria-label={heading} className="border-t border-border pt-5">
      <h3 className="text-sm font-semibold text-text">
        {heading} <span className="font-normal text-text-subtle tabular-nums">· {entry.updates.length}</span>
      </h3>
      {entry.updates.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">Nothing recorded yet.</p>
      ) : (
        <ol className="mt-4 flex flex-col">
          {entry.updates.map((update, index) => {
            const who = isFollowUp ? (update.fromThem ? (entry.person ?? "They") : "You") : null;
            return (
              <li key={update.id} className="relative flex gap-4 pb-5 last:pb-0">
                {index < entry.updates.length - 1 ? <span aria-hidden="true" className="absolute top-4 bottom-0 left-[0.3125rem] w-px bg-border" /> : null}
                <span
                  aria-hidden="true"
                  style={update.fromThem ? tone(FOLLOW_STATE.replied.tone) : undefined}
                  className={cn("relative mt-1.5 size-2.5 shrink-0 rounded-full", update.fromThem ? "bg-[var(--tone)]" : "bg-sidebar")}
                />
                <div className="min-w-0">
                  <p className="text-xs text-text-muted">
                    {who ? <span className="font-semibold text-text">{who} · </span> : null}
                    <time dateTime={update.occurredAt}>{format(parseISO(update.occurredAt), "EEE d MMM yyyy, HH:mm")}</time>
                    {isFollowUp ? ` · ${update.channel}` : ""}
                  </p>
                  {update.note ? (
                    <p className="mt-1 whitespace-pre-wrap text-md leading-6 text-text [overflow-wrap:anywhere]">{update.note}</p>
                  ) : (
                    <p className="mt-1 text-sm text-text-muted italic">{update.fromThem ? "Replied" : "—"}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

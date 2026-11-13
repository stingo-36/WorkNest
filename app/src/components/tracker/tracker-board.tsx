"use client";

import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  CalendarDays,
  Clock,
  Pencil,
  Check,
  ChevronDown,
  Hash,
  MessageSquareReply,
  MessagesSquare,
  Plus,
  RotateCcw,
  Send,
  Star,
  Trash2,
  UserRound,
} from "lucide-react";
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { addDays, differenceInCalendarDays, endOfWeek, format, parseISO, startOfWeek } from "date-fns";

import {
  addFollowUpUpdate,
  createFollowUp,
  deleteFollowUp,
  editPersonalTodo,
  rescheduleFollowUp,
  setFollowUpArchived,
  setFollowUpPinned,
  setFollowUpStatus,
  setFollowUpTags,
} from "@/actions/follow-ups";
import { cn } from "@/components/cn";
import { SearchPill } from "@/components/shell/page-head";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Field, FormError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Menu, menuItemClass } from "@/components/shell/menu";
import { TagInput } from "@/components/ui/tag-input";
import { toast } from "@/components/ui/toast";
import { FormattedNote } from "@/components/tracker/note-text";
import { UpdateDoc, UpdateEditor, type EditorValue } from "@/components/tracker/update-editor";
import { isStatusNote, TODO_STATUS_NOTES } from "@/lib/rich-text";
import { tagChipClass, tagChipStyle } from "@/components/ui/tag-chip";
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
  /** Rich text (TipTap JSON) when written in the editor; `note` is its plain text. */
  doc?: unknown;
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
  /** A personal to-do — shown as a sticky note under To-do → Personal. */
  personal: boolean;
  /** "YYYY-MM-DD" or null. A plain calendar day — no time, no timezone. */
  dueDate: string | null;
  completedAt: string | null;
  /** Put away from the lists (Archived tab); null = live. Notes archive through `status` instead. */
  archivedAt: string | null;
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
export type TrackerView = "todo" | "followups" | "notes" | "archived";

const VIEWS: Array<{ id: TrackerView; label: string }> = [
  { id: "todo", label: "To-do" },
  { id: "followups", label: "Follow-ups" },
  { id: "notes", label: "Notes" },
  { id: "archived", label: "Archived" },
];

const KIND_LABEL: Record<EntryKind, string> = { Task: "To-do", FollowUp: "Follow-up", Note: "Note" };

/** The To-do tab's two lists. Work is the default every time the page opens (owner, 2026-10-21). */
type TodoScope = "work" | "personal";

const entryLabel = (entry: TrackerEntry) => (entry.personal ? "Personal to-do" : KIND_LABEL[entry.kind]);

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

/** Search saved people as the user types, while still allowing a new name. */
/**
 * Who field. Filters saved names as you type and also completes inline: typing
 * "Fa" fills in "Fatima" with "tima" selected, so Tab / Enter keeps it and
 * typing on or Backspace drops it. Any new name is still accepted.
 */
function PersonAutocomplete({ id, value, options, onChange }: { id: string; value: string; options: string[]; onChange: (value: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  // What the user actually typed; `value` may also hold the selected completion.
  const [typed, setTyped] = useState(value);
  const pendingSelection = useRef<[number, number] | null>(null);
  const query = value.toLowerCase().startsWith(typed.toLowerCase()) ? typed : value;

  // Select the completed part after React writes the new value into the input.
  useLayoutEffect(() => {
    const range = pendingSelection.current;
    pendingSelection.current = null;
    if (range && inputRef.current && document.activeElement === inputRef.current) inputRef.current.setSelectionRange(range[0], range[1]);
  }, [value]);

  return (
    <Autocomplete<string, false, false, true>
      id={id}
      freeSolo
      autoHighlight
      openOnFocus
      value={null}
      inputValue={value}
      options={options}
      filterOptions={(all) => {
        const needle = query.trim().toLowerCase();
        return all
          .filter((option) => option.toLowerCase() !== value.trim().toLowerCase() || query !== value)
          .filter((option) => option.toLowerCase().includes(needle))
          // Names that start with what you typed first, so Enter picks the completion.
          .sort((a, b) => Number(b.toLowerCase().startsWith(needle)) - Number(a.toLowerCase().startsWith(needle)));
      }}
      onInputChange={(event, next, reason) => {
        if (reason === "reset") return;
        setTyped(next);
        const inserting = reason === "input" && ((event?.nativeEvent as InputEvent | undefined)?.inputType ?? "").startsWith("insert");
        const match = inserting && next.trim() ? options.find((option) => option.length > next.length && option.toLowerCase().startsWith(next.toLowerCase())) : undefined;
        if (match) {
          pendingSelection.current = [next.length, match.length];
          onChange(next + match.slice(next.length));
        } else {
          onChange(next);
        }
      }}
      onChange={(_event, next) => {
        if (typeof next === "string") { setTyped(next); onChange(next); }
      }}
      noOptionsText={value.trim() ? "No saved name matches — keep typing to add it" : "No saved names yet — type a new one"}
      renderInput={(params) => (
        <TextField
          {...params}
          inputRef={inputRef}
          placeholder="Type a name"
          slotProps={{
            ...params.slotProps,
            htmlInput: { ...params.slotProps.htmlInput, maxLength: 120 },
          }}
        />
      )}
    />
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

/** Prefer Slack regardless of the order saved in Profile. */
function defaultChannel(channels: string[]) {
  return channels.find((channel) => channel.toLowerCase() === "slack") ?? channels[0] ?? "Slack";
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

/** One-line previews show the words, not the **markers**. */
const stripMarks = (text: string) => text.replace(/\*\*([^*\n]+)\*\*/g, "$1").replace(/\*([^*\n]+)\*/g, "$1");

const plural = (count: number, one: string, many = `${one}s`) => (count === 1 ? one : many);

/** "Thu 8 Oct" */
const dayLabel = (iso: string) => format(parseISO(iso), "EEE d MMM");

/**
 * A highlight that slides to the picked option (Ocean, 2026-11-01): the box's
 * ::before is moved and sized to the `[data-on]` child. Until measured (first
 * paint, no JS) the picked option draws its own fill, so nothing flashes.
 */
function useSlidingPill<T extends HTMLElement>(picked: string) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const place = () => {
      const on = box.querySelector<HTMLElement>("[data-on]");
      if (!on) return;
      box.style.setProperty("--sx", `${on.offsetLeft}px`);
      box.style.setProperty("--sy", `${on.offsetTop}px`);
      box.style.setProperty("--sw", `${on.offsetWidth}px`);
      box.style.setProperty("--sh", `${on.offsetHeight}px`);
      box.dataset.slide = "on";
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(box);
    return () => observer.disconnect();
  }, [picked]);
  return ref;
}

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
/** Shown on the Archived tab: put away with Archive, or a note archived the old way (Done). */
const isArchived = (entry: TrackerEntry) => entry.archivedAt !== null || (entry.kind === "Note" && entry.status === "Done");
const byArchived = (a: TrackerEntry, b: TrackerEntry) => (b.archivedAt ?? b.completedAt ?? b.updatedAt).localeCompare(a.archivedAt ?? a.completedAt ?? a.updatedAt);

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
 * The page title, tab pills and search sit above one readable full-width queue.
 * Latest updates stay on the rows; finished records remain visible in date
 * groups instead of hiding behind summary counts. Amber (dashed) marks what
 * needs you. An entry opens in a dialog at every width.
 */
export function TrackerBoard({
  entries,
  people,
  channels,
  savedNoteTags,
  serverToday,
  initialView,
  loadError,
  greetingName = null,
  sprint = null,
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
  /** First name for the greeting (Profile name); none → just "Good morning". */
  greetingName?: string | null;
  /** The current sprint, for the header ("Sprint day 3 of 10") and "done this sprint". */
  sprint?: { start: string; day: number; total: number } | null;
}) {
  const [view, setView] = useState<TrackerView>(initialView);
  const [scope, setScope] = useState<TodoScope>("work");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const today = useSyncExternalStore(subscribeNever, todayIso, () => serverToday);
  const needle = query.trim().toLowerCase();

  // Archived entries leave every list (and every count) for the Archived tab.
  const live = useMemo(() => entries.filter((entry) => entry.archivedAt === null), [entries]);
  const archived = useMemo(() => entries.filter(isArchived), [entries]);
  const byKind = useMemo(() => {
    const next: Record<EntryKind, TrackerEntry[]> = { Task: [], FollowUp: [], Note: [] };
    for (const entry of live) next[entry.kind].push(entry);
    return next;
  }, [live]);
  const workEntries = useMemo(() => live.filter((entry) => !entry.personal), [live]);
  const personalTodos = useMemo(() => byKind.Task.filter((entry) => entry.personal), [byKind]);
  const scopeCounts: Record<TodoScope, number> = {
    work: byKind.Task.filter((entry) => !entry.personal && isOpen(entry)).length,
    personal: personalTodos.filter(isOpen).length,
  };

  // Tab badges: what's still open, not the grand total.
  const badge: Record<TrackerView, number> = {
    todo: scopeCounts.work + scopeCounts.personal,
    followups: byKind.FollowUp.filter(isOpen).length,
    notes: byKind.Note.filter(isOpen).length,
    archived: archived.length,
  };
  const opened = entries.find((entry) => entry.id === openId) ?? null;
  const lists = useMemo(() => ({ channels, noteTags: savedNoteTags }), [channels, savedNoteTags]);
  const tagSuggestions = mergeTags(noteTags(byKind.Note).map(([tag]) => tag), savedNoteTags);
  const openEntry = (entry: TrackerEntry) => setOpenId(entry.id);

  // `?open=<id>` (links from Ask) opens that entry on its tab. The param is then
  // dropped, so following the same link again opens it again.
  const linkedId = useSearchParams().get("open");
  const linked = linkedId ? entries.find((entry) => entry.id === linkedId) : undefined;
  const linkedTab: TrackerView = linked?.archivedAt ? "archived" : linked?.kind === "FollowUp" ? "followups" : linked?.kind === "Note" ? "notes" : "todo";
  const [handledLink, setHandledLink] = useState<string | null>(null);
  if ((linked?.id ?? null) !== handledLink) {
    setHandledLink(linked?.id ?? null);
    if (linked) {
      setView(linkedTab);
      if (linked.kind === "Task") setScope(linked.personal ? "personal" : "work");
      setOpenId(linked.id);
    }
  }
  useEffect(() => {
    if (linkedId) window.history.replaceState(null, "", linkedTab === "todo" ? "/tracker" : `/tracker?view=${linkedTab}`);
  }, [linkedId, linkedTab]);

  function choose(next: TrackerView) {
    setView(next);
    setQuery("");
    setOpenId(null);
    // Shallow URL update so a refresh or a link lands on the same tab, without
    // a server round-trip on every switch.
    window.history.replaceState(null, "", next === "todo" ? "/tracker" : `/tracker?view=${next}`);
  }

  function onTabKey(event: React.KeyboardEvent) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const index = VIEWS.findIndex((v) => v.id === view);
    const next = VIEWS[(index + (event.key === "ArrowRight" ? 1 : VIEWS.length - 1)) % VIEWS.length];
    choose(next.id);
  }

  const tabsRef = useSlidingPill<HTMLElement>(view);

  // Follow-ups badge turns amber when one needs you.
  const followNeeds = byKind.FollowUp.some((entry) => needsYou(entry, today));

  // The greeting's numbers: overdue work to-dos, everything that needs you, and
  // to-dos finished since the sprint (else the week) began.
  const summaryFrom = sprint?.start ?? format(startOfWeek(parseISO(today), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const summary = {
    overdue: workEntries.filter((entry) => entry.kind === "Task" && isOpen(entry) && entry.dueDate !== null && entry.dueDate < today).length,
    needs: workEntries.filter((entry) => entry.kind !== "Note" && isOpen(entry) && needsYou(entry, today)).length,
    done: byKind.Task.filter((entry) => !isOpen(entry) && entry.completedAt && localDay(entry.completedAt) >= summaryFrom).length,
  };

  return (
    <ListsContext.Provider value={lists}>
    <div className="tk-focus flex w-full min-w-0 flex-col gap-12">
      {/* Ocean redesign v3 (2026-11-01): date + sprint eyebrow, a greeting with today's
          numbers, the lists as pill tabs beside search; then one command bar to add. */}
      {/* relative z-20: the page's entrance animation leaves each block in its own stacking
          layer, so without this the content below paints over (and swallows clicks on) the
          add field's date / who panels. */}
      <header className="relative z-20 flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="tk-eyebrow text-text-muted" suppressHydrationWarning>
              {format(parseISO(today), "EEEE, d MMMM")}{sprint ? ` · Sprint day ${sprint.day} of ${sprint.total}` : ""}
            </p>
            <h1 className="tk-greeting">
              <span className="sr-only">Tracker — </span>
              <span suppressHydrationWarning>{greeting()}</span>{greetingName ? `, ${greetingName}` : ""}
            </h1>
            <p className="text-md text-text-muted" suppressHydrationWarning>
              {summary.overdue ? <><b className="font-semibold text-danger">{summary.overdue} overdue</b> · </> : null}
              {summary.needs ? <><b className="font-semibold text-warning">{summary.needs} {summary.needs === 1 ? "needs" : "need"} you</b> · </> : null}
              {summary.done} done {sprint ? "this sprint" : "this week"}
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <nav ref={tabsRef} aria-label="Tracker lists" onKeyDown={onTabKey} className="tk-tabs tk-slide">
              {VIEWS.map((item) => {
                const on = item.id === view;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={on ? "page" : undefined}
                    data-on={on || undefined}
                    onClick={() => choose(item.id)}
                    className="tk-tab"
                  >
                    {item.label}
                    <span className={cn("text-sm font-semibold tabular-nums", item.id === "followups" && followNeeds ? "text-warning" : "text-text-muted")}>{badge[item.id]}</span>
                  </button>
                );
              })}
            </nav>
            <SearchPill id="tracker-search" label="Search the Tracker" value={query} placeholder="Search, or #tag" onChange={setQuery} shortcut className="h-11 w-full md:w-60" />
          </div>
        </div>
        <div className="tk-command">
          {view === "todo" ? <ScopeToggle value={scope} counts={scopeCounts} onChange={(next) => { setScope(next); setQuery(""); }} /> : null}
          <div className="min-w-0 flex-[1_1_18rem]">
            {view === "todo" ? <AddTodo key={scope} today={today} personal={scope === "personal"} /> : null}
            {view === "followups" ? <p className="px-2 py-3 text-md text-text-muted">Start a follow-up below — the newest update shows on each card.</p> : null}
            {view === "notes" ? <p className="px-2 py-3 text-md text-text-muted">Your notes, newest first. Press New note to write one; open a note to add to it.</p> : null}
            {view === "archived" ? <p className="px-2 py-3 text-md text-text-muted">Put away from your lists, kept with their history. Restore puts one back.</p> : null}
          </div>
        </div>
      </header>

      <section id="tracker-panel" aria-label={`${VIEWS.find((item) => item.id === view)?.label ?? "Tracker"} list`} className="flex min-w-0 flex-col">
        {loadError ? <FormError>{loadError}</FormError> : null}
        {needle ? (
          <p className="mb-6 flex flex-wrap items-center gap-x-3 text-md text-text-muted">
            Showing matches for <b className="font-semibold text-text">{query.trim()}</b>
            <button type="button" onClick={() => setQuery("")} className="min-h-11 cursor-pointer font-semibold text-accent-text hover:underline">Clear</button>
          </p>
        ) : null}
        {/* Re-keyed per list so switching tab or Work/Personal fades the new list in. */}
        <div key={`${view}-${scope}`} className="tk-swap">
        {view === "todo" && scope === "work" ? (
          <TodoQueue
            entries={workEntries}
            personal={personalTodos}
            today={today}
            needle={needle}
            onOpen={openEntry}
            onShowFollowUps={() => choose("followups")}
            onShowPersonal={() => { setScope("personal"); setQuery(""); }}
          />
        ) : null}
        {view === "todo" && scope === "personal" ? <StickyBoard entries={personalTodos} today={today} needle={needle} onOpen={openEntry} /> : null}
        {view === "followups" ? <FollowUpQueue entries={byKind.FollowUp} people={people} today={today} needle={needle} onOpen={openEntry} /> : null}
        {view === "archived" ? <ArchiveList entries={archived} today={today} needle={needle} onOpen={openEntry} /> : null}
        {view === "notes" ? <NoteQueue entries={byKind.Note} suggestions={tagSuggestions} today={today} needle={needle} onOpen={openEntry} /> : null}
        </div>
      </section>

      {opened ? (
        <Modal open size="xl" onClose={() => setOpenId(null)} eyebrow={<EntryEyebrow entry={opened} />} title={<EntryTitle entry={opened} />}>
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

// Kept temporarily for compatibility with the previous layout while the queue
// owns the visible information architecture.
void Summary;

/** Finished entries are always visible and grouped by the day they were finished. */
function finishedByDay(entries: TrackerEntry[]) {
  const days = new Map<string, TrackerEntry[]>();
  for (const entry of entries) {
    const key = (entry.completedAt ?? entry.updatedAt).slice(0, 10);
    days.set(key, [...(days.get(key) ?? []), entry]);
  }
  return [...days.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, items]) => ({ key, label: format(parseISO(key), "EEEE d MMM"), items }));
}

/** Two lanes from lg (Today | Upcoming, …); stacked on smaller screens. */
function Columns({ children }: { children: React.ReactNode }) {
  return <div className="grid min-w-0 gap-4 md:gap-5 lg:grid-cols-2 lg:items-start">{children}</div>;
}

/** A lane (Ocean, 2026-11-01): frosted panel, dot + title + count; warm when something needs you. */
function Column({ title, count, needs = false, tone, aside, children }: { title: string; count?: number; needs?: boolean; tone?: "overdue" | "upcoming" | "someday"; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-label={title} data-tone={tone} className={cn("tk-lane flex min-w-0 flex-col", needs && "tk-lane-needs")}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 pb-2">
        <h2 className="tk-col-title flex items-center gap-2.5">
          <span aria-hidden="true" className={cn("tk-lane-dot size-2.5 shrink-0 rounded-full", needs ? "bg-warning" : "bg-primary")} />
          {title}
          {count !== undefined ? <span className={cn("rounded-full px-2.5 py-0.5 text-sm font-semibold tabular-nums", needs ? "bg-warning-subtle text-warning" : "bg-surface text-text-muted")}>{count}</span> : null}
        </h2>
        {aside ? <p className={cn("text-sm font-medium", needs ? "text-warning" : "text-text-muted")} suppressHydrationWarning>{aside}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 rounded-2xl border-2 border-dashed border-[var(--c-tk-rule)] px-4 py-5 text-md text-text-muted">{children}</p>;
}

/** A small sub-label inside a column ("Thu 15 Oct", "Your turn") over its own rows. */
function Bucket({ label, needs = false, children }: { label: string; needs?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <h3 className={cn("tk-label px-1 pt-4 pb-2", needs ? "text-warning" : "text-text-muted")} suppressHydrationWarning>{label}</h3>
      <ol>{children}</ol>
    </div>
  );
}

/**
 * Finished entries collapsed under one line — "✓ 2 completed today · Show" —
 * grouped by the day they were finished. A search opens it.
 */
function FinishedGroup({ verb, entries, today, needle, render }: { verb: string; entries: TrackerEntry[]; today: string; needle: string; render: (entry: TrackerEntry) => React.ReactNode }) {
  const [show, setShow] = useState(false);
  if (entries.length === 0) return null;
  const days = finishedByDay(entries);
  const open = show || Boolean(needle);
  const allToday = days.length === 1 && days[0].key === today;
  return (
    <div className="pt-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`finished-${verb}`}
        onClick={() => setShow(!show)}
        className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-4 border-b border-border pb-2 text-left"
      >
        <span className="flex items-center gap-2 text-md text-text-muted" suppressHydrationWarning>
          <Check className="size-4 text-primary" strokeWidth={2.4} aria-hidden="true" />
          {entries.length} {verb}{allToday ? " today" : ""}
        </span>
        <span className="flex items-center gap-1 text-md font-semibold text-text">
          {open ? "Hide" : "Show"}
          <ChevronDown className={cn("size-4 transition-transform duration-150 motion-reduce:transition-none", open && "rotate-180")} aria-hidden="true" />
        </span>
      </button>
      {open ? (
        <div id={`finished-${verb}`}>
          {days.map((day) => (
            <Bucket key={day.key} label={day.key === today ? "Today" : day.label}>{day.items.map(render)}</Bucket>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** One row: optional leading tick, a status eyebrow, the title (opens the entry), extra lines, actions. */
function Row({ muted = false, needs = false, wide = false, eyebrow, leading, title, meta, actions, onOpen }: { muted?: boolean; needs?: boolean; wide?: boolean; eyebrow?: React.ReactNode; leading?: React.ReactNode; title: string; meta?: React.ReactNode; actions?: React.ReactNode; onOpen: () => void }) {
  return (
    <li className="tk-item group mb-2 flex flex-wrap items-center gap-x-5 gap-y-2 px-3 py-3 md:px-4">
      <div className={cn("flex min-w-0 items-start gap-3", wide ? "flex-[1_1_18rem]" : "flex-[1_1_10rem]")}>
        {leading}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {eyebrow ? <p className={cn("tk-label", needs ? "text-warning" : "text-text-muted")} suppressHydrationWarning>{eyebrow}</p> : null}
          <button type="button" onClick={onOpen} className={cn("tk-row-title tap-area min-h-7 w-fit max-w-full cursor-pointer py-0.5 text-left [overflow-wrap:anywhere] decoration-2 underline-offset-4 hover:underline", muted && "text-text-muted line-through")}>
            {title}
          </button>
          {meta}
        </div>
      </div>
      {actions ? <div className="ml-auto flex flex-none items-center gap-1.5">{actions}</div> : null}
    </li>
  );
}

/** The round tick before a row: done / close in one click, or reopen. */
function DoneCircle({ entry }: { entry: TrackerEntry }) {
  const { run, pending } = useRun();
  const done = !isOpen(entry);
  const verb = entry.kind === "FollowUp" ? "Close" : "Mark done";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? `Reopen: ${entry.subject}` : `${verb}: ${entry.subject}`}
      title={done ? "Reopen" : verb}
      disabled={pending}
      onClick={() => run(done ? markOpen(entry) : markDone(entry), done ? "Reopened" : entry.kind === "FollowUp" ? "Closed" : "Done")}
      className="group -my-2 -ml-2.5 grid size-11 shrink-0 cursor-pointer place-items-center rounded-full disabled:cursor-wait"
    >
      <span className={cn("grid size-5.5 place-items-center rounded-full border-2 transition-colors duration-150", done ? "border-primary bg-primary text-primary-fg" : "border-text-subtle group-hover:border-primary")}>
        {done ? <Check className="size-3.5" strokeWidth={3} aria-hidden="true" /> : null}
      </span>
    </button>
  );
}

/** One-line preview of the newest message, shown on rows in every tab. */
function LatestLine({ entry }: { entry: TrackerEntry }) {
  // "Marked done" / "Reopened" are bookkeeping; the preview shows what you wrote.
  const latest = entry.updates.find((update) => !isStatusNote(update));
  const text = latest?.note.trim();
  if (!latest || !text || text === entry.subject) return null;
  return (
    <p className={cn("line-clamp-2 text-md [overflow-wrap:anywhere]", latest.fromThem ? "font-medium text-text" : "text-text-muted")}>
      <span className="text-text-muted">{latest.fromThem ? "Latest reply:" : "Last note:"}</span> {stripMarks(text)}
    </p>
  );
}

const PILL = "inline-flex h-11 shrink-0 cursor-pointer items-center rounded-full border px-5 text-md font-semibold whitespace-nowrap transition-colors duration-150 disabled:cursor-wait disabled:opacity-60";
const PILL_INK = "border-sidebar bg-sidebar text-sidebar-fg hover:bg-sidebar-3";
const PILL_LINE = "border-[var(--c-tk-rule)] bg-surface text-text hover:border-text";
const PILL_SOFT = "border-transparent bg-primary-subtle text-accent-text hover:bg-surface-3";

/** A row's text button that runs one server action. */
function ActionPill({ ink = false, soft = false, label, action, success }: { ink?: boolean; soft?: boolean; label: string; action: () => Promise<{ ok: boolean; error?: { message: string } }>; success: string }) {
  const { run, pending } = useRun();
  return (
    <button type="button" disabled={pending} onClick={() => run(action, success)} className={cn(PILL, ink ? PILL_INK : soft ? PILL_SOFT : PILL_LINE)}>
      {label}
    </button>
  );
}

/**
 * Delete from the row (owner, 2026-10-15) — the dialog also has it. Asks first;
 * removes the entry and everything recorded on it. Shows on hover/focus from md.
 */
function DeleteEntry({ entry }: { entry: TrackerEntry }) {
  const { run, pending } = useRun();
  const [asking, setAsking] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={`Delete: ${entry.subject}`}
        title="Delete"
        disabled={pending}
        onClick={() => setAsking(true)}
        className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-text-subtle transition-[color,background-color,opacity] duration-150 hover:bg-surface-2 hover:text-danger disabled:cursor-wait md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
      >
        <Trash2 className="size-4.5" strokeWidth={1.8} aria-hidden="true" />
      </button>
      <ConfirmationDialog
        open={asking}
        title={`Delete “${entry.subject}”?`}
        description="This removes it and everything recorded on it. It can't be undone."
        confirmLabel="Delete"
        destructive
        onCancel={() => setAsking(false)}
        onConfirm={() => { setAsking(false); run(() => deleteFollowUp({ followUpId: entry.id }), "Deleted"); }}
      />
    </>
  );
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
    const recorded = await addFollowUpUpdate({ followUpId: entry.id, note: "Nudged", channel: defaultChannel(channels), fromThem: false });
    if (!recorded.ok) return recorded;
    return rescheduleFollowUp({ followUpId: entry.id, dueDate: null });
  };
}

function NudgePill({ entry, ink }: { entry: TrackerEntry; ink: boolean }) {
  const nudge = useNudge(entry);
  // When due it's the row's main action, but softer than "Got it" (Ocean, 2026-11-01).
  return <ActionPill soft={ink} label="Mark nudged" action={nudge} success="Nudge recorded" />;
}

// --- add pill ------------------------------------------------------------------

/** Grow a textarea with its text (one line when empty). */
function fitHeight(field: HTMLTextAreaElement | null) {
  if (!field) return;
  field.style.height = "auto";
  field.style.height = `${field.scrollHeight}px`;
}

/** Enter saves, Shift+Enter starts a new line (not while an IME is composing). */
function onEnterSave(save: () => void) {
  return (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    save();
  };
}

/**
 * The dashed pill at the top of each queue: a text field, a few tool buttons
 * (each may open a small panel under the pill) and Add. Enter saves;
 * `multiline` (sticky notes) makes Shift+Enter a new line.
 */
function AddPill({ label, inputId, placeholder, value, onChange, onSubmit, pending, error, tools, panel, multiline = false }: {
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
  multiline?: boolean;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  // Shrink back to one line once a saved note clears the field.
  useEffect(() => fitHeight(area.current), [value]);
  return (
    <form aria-label={label} onSubmit={(event) => { event.preventDefault(); onSubmit(); }} className="relative">
      <div className="tk-add flex items-end gap-0.5 py-2 pl-1">
        <label htmlFor={inputId} className={cn("flex min-h-11 min-w-0 flex-1 gap-3.5 text-text-muted", multiline ? "items-start py-2.5" : "items-center")}>
          <Plus className={cn("size-5 shrink-0", multiline && "mt-0.5")} strokeWidth={2.2} aria-hidden="true" />
          <span className="sr-only">{label}</span>
          {multiline ? (
            <textarea
              ref={area}
              id={inputId}
              rows={1}
              value={value}
              maxLength={1000}
              placeholder={placeholder}
              aria-invalid={error ? true : undefined}
              aria-describedby={`${inputId}-keys`}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={onEnterSave(onSubmit)}
              className="max-h-60 min-w-0 flex-1 resize-none bg-transparent text-lg leading-snug text-text outline-none placeholder:text-text-muted"
            />
          ) : (
            <input
              id={inputId}
              value={value}
              maxLength={300}
              placeholder={placeholder}
              aria-invalid={error ? true : undefined}
              onChange={(event) => onChange(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-lg text-text outline-none placeholder:text-text-muted"
            />
          )}
        </label>
        {tools}
        <button type="submit" disabled={pending} className="ml-1 h-11 shrink-0 cursor-pointer rounded-full bg-sidebar px-5 text-md font-semibold text-sidebar-fg transition-colors duration-150 hover:bg-sidebar-3 disabled:cursor-wait disabled:opacity-60 md:px-6">
          Add
        </button>
      </div>
      {panel}
      {/* Read out, not shown: a visible hint made the add bar taller on Personal (Ocean, 2026-11-01). */}
      {multiline ? <p id={`${inputId}-keys`} className="sr-only">Enter to add · Shift+Enter for a new line</p> : null}
      {error ? <p className="mt-2 px-1 text-base font-medium text-danger" role="alert">{error}</p> : null}
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
      className={cn("inline-flex h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full px-2.5 text-base font-semibold text-text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-text md:min-w-12", className)}
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
    // preventScroll: the panel opens mid-animation below the card; letting the browser
    // scroll it into view yanks the page every time a pill is clicked.
    ref.current?.querySelector<HTMLElement>("input, select, button")?.focus({ preventScroll: true });
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
function DatePanel({ id, label, hint, value, onChange, onClose }: { id: string; label: string; hint?: string; value: string; onChange: (value: string) => void; onClose: () => void }) {
  return (
    <PillPanel label={label} onClose={onClose}>
      <Field label={label} htmlFor={id} hint={hint}>
        <Input id={id} type="date" value={value} onChange={(event) => onChange(event.target.value)} />
      </Field>
      {value ? <button type="button" onClick={() => onChange("")} className="w-fit cursor-pointer text-sm font-semibold text-accent-text hover:underline">Clear date</button> : null}
    </PillPanel>
  );
}

/** `prefix` says what the date means when it isn't a reminder ("Said: Today"). */
function DateTool({ label, prefix, value, today, expanded, onClick }: { label: string; prefix?: string; value: string; today: string; expanded: boolean; onClick: () => void }) {
  return (
    <ToolButton label={value ? `${label}: ${dayLabel(value)}` : label} expanded={expanded} onClick={onClick} className={value ? "text-text" : undefined}>
      <CalendarDays className="size-5" strokeWidth={1.8} aria-hidden="true" />
      {value ? <span className="hidden md:inline">{prefix ? <span className="font-normal text-text-muted">{prefix}: </span> : null}{value === today ? "Today" : format(parseISO(value), "d MMM")}</span> : null}
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
    input: { kind: EntryKind; subject: string; person?: string; note?: string; doc?: unknown; channel?: string; dueDate?: string | null; occurredAt?: string | null; fromThem?: boolean; tags?: string[]; personal?: boolean },
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
      toast.success(input.personal ? "Sticky note added" : `${KIND_LABEL[input.kind]} added`);
      setError(undefined);
      onSaved();
      router.refresh();
    });
  }
  return { create, pending, error, setError };
}

// --- to-do ---------------------------------------------------------------------

/** Open work after today: Thu 15 Oct (tomorrow) · Later this week · Next week · Later · No date. */
function upcomingBuckets(items: TrackerEntry[], today: string) {
  const start = parseISO(today);
  const tomorrow = format(addDays(start, 1), "yyyy-MM-dd");
  const weekEnd = format(endOfWeek(start, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const nextWeekEnd = format(addDays(endOfWeek(start, { weekStartsOn: 1 }), 7), "yyyy-MM-dd");
  const buckets = [
    { key: "tomorrow", label: dayLabel(tomorrow), items: [] as TrackerEntry[] },
    { key: "week", label: "Later this week", items: [] as TrackerEntry[] },
    { key: "next", label: "Next week", items: [] as TrackerEntry[] },
    { key: "later", label: "Later", items: [] as TrackerEntry[] },
    { key: "someday", label: "No date", items: [] as TrackerEntry[] },
  ];
  for (const entry of items) {
    const due = entry.dueDate;
    const i = !due ? 4 : due <= tomorrow ? 0 : due <= weekEnd ? 1 : due <= nextWeekEnd ? 2 : 3;
    buckets[i].items.push(entry);
  }
  return buckets.filter((bucket) => bucket.items.length);
}

/** "Both need you", "Needs you", "3 need you". */
function needLine(count: number) {
  return count === 0 ? undefined : count === 1 ? "Needs you" : count === 2 ? "Both need you" : `${count} need you`;
}

/** "Good morning" / "Good afternoon" / "Good evening" by the browser's clock. */
function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/** An ISO instant as the browser's own calendar day, "YYYY-MM-DD". */
const localDay = (iso: string) => format(parseISO(iso), "yyyy-MM-dd");

/**
 * The Work to-do view (Ocean redesign v3, 2026-11-01): a "Next up" card for the
 * most urgent to-do, then one compact list in groups — Overdue, Due today,
 * Needs you (follow-ups), Upcoming by day, Someday — and the collapsed
 * completed line; beside it (below it on small screens) a rail with this
 * week's progress, who you're waiting on and personal to-dos. Same rows and
 * actions as before.
 */
function TodoQueue({ entries, personal, today, needle, onOpen, onShowFollowUps, onShowPersonal }: {
  entries: TrackerEntry[];
  personal: TrackerEntry[];
  today: string;
  needle: string;
  onOpen: (entry: TrackerEntry) => void;
  onShowFollowUps: () => void;
  onShowPersonal: () => void;
}) {
  const groups = useMemo(() => {
    const next = { overdue: [] as TrackerEntry[], dueToday: [] as TrackerEntry[], needs: [] as TrackerEntry[], coming: [] as TrackerEntry[], someday: [] as TrackerEntry[], done: [] as TrackerEntry[] };
    for (const entry of entries) {
      if (entry.kind === "Note" || !matches(entry, needle)) continue;
      if (needsYou(entry, today)) {
        if (entry.kind === "FollowUp") next.needs.push(entry);
        else if (entry.dueDate && entry.dueDate < today) next.overdue.push(entry);
        else next.dueToday.push(entry);
      } else if (!isOpen(entry)) { if (entry.kind === "Task") next.done.push(entry); }
      else if (entry.dueDate) next.coming.push(entry);
      else if (entry.kind === "Task") next.someday.push(entry);
    }
    next.overdue.sort(byDue);
    next.dueToday.sort(byNeed);
    next.needs.sort(byNeed);
    next.coming.sort(byDue);
    next.someday.sort(byDue);
    next.done.sort(byCompleted);
    return next;
  }, [entries, today, needle]);

  const row = (entry: TrackerEntry, mode: "today" | "upcoming" | "done") => entry.kind === "Task"
    ? <TodoRow key={entry.id} entry={entry} today={today} mode={mode} onOpen={() => onOpen(entry)} />
    : <FollowUpRow key={entry.id} entry={entry} today={today} compact={mode !== "today"} onOpen={() => onOpen(entry)} />;
  const nextUp = groups.overdue[0] ?? groups.dueToday[0] ?? null;
  const nothingOpen = !groups.overdue.length && !groups.dueToday.length && !groups.needs.length && !groups.coming.length && !groups.someday.length;

  return (
    <div className="tk-v3">
      <div className="flex min-w-0 flex-col">
        {nextUp && !needle ? <NextUpCard entry={nextUp} today={today} onOpen={() => onOpen(nextUp)} /> : null}
        <div className="tk-list">
          {groups.overdue.length ? <ListGroup title="Overdue" tone="overdue" count={groups.overdue.length}><ol>{groups.overdue.map((entry) => row(entry, "today"))}</ol></ListGroup> : null}
          {groups.dueToday.length ? <ListGroup title="Due today" tone="today" count={groups.dueToday.length}><ol>{groups.dueToday.map((entry) => row(entry, "today"))}</ol></ListGroup> : null}
          {groups.needs.length ? <ListGroup title="Needs you" tone="needs" count={groups.needs.length}><ol>{groups.needs.map((entry) => row(entry, "today"))}</ol></ListGroup> : null}
          <ListGroup title="Upcoming" tone="upcoming" count={groups.coming.length}>
            {groups.coming.length ? (
              upcomingBuckets(groups.coming, today).map((bucket) => (
                <Bucket key={bucket.key} label={bucket.label}>{bucket.items.map((entry) => row(entry, "upcoming"))}</Bucket>
              ))
            ) : (
              <Empty>{needle ? "Nothing matches." : "Nothing scheduled — give a to-do a date and it lands here."}</Empty>
            )}
          </ListGroup>
          {groups.someday.length ? <ListGroup title="Someday" tone="someday" count={groups.someday.length}><ol>{groups.someday.map((entry) => row(entry, "upcoming"))}</ol></ListGroup> : null}
          {nothingOpen && !needle ? <p className="px-1 pt-4 text-md text-text-muted">All clear — add a to-do above.</p> : null}
          <FinishedGroup verb="completed" entries={groups.done} today={today} needle={needle} render={(entry) => row(entry, "done")} />
        </div>
      </div>
      <aside aria-label="Overview" className="tk-rail">
        <WeekCard entries={entries} today={today} />
        <WaitingCard entries={entries} today={today} onShowAll={onShowFollowUps} />
        <PersonalCard entries={personal} onShowAll={onShowPersonal} />
      </aside>
    </div>
  );
}

/** A group in the to-do list: a coloured label with its count, then its rows. */
function ListGroup({ title, tone, count, children }: { title: string; tone: "overdue" | "today" | "needs" | "upcoming" | "someday"; count: number; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="tk-grp" data-tone={tone}>
      <h2 className="tk-grp-head"><span className="tk-grp-dot" aria-hidden="true" />{title}<span className="tk-grp-count">{count}</span></h2>
      <div className="tk-grp-body">{children}</div>
    </section>
  );
}

/** The most urgent to-do, big, with Mark done, Move date (opens it) and its star. */
function NextUpCard({ entry, today, onOpen }: { entry: TrackerEntry; today: string; onOpen: () => void }) {
  const { run, pending } = useRun();
  const late = entry.dueDate ? differenceInCalendarDays(parseISO(today), parseISO(entry.dueDate)) : 0;
  return (
    <section aria-labelledby="tk-next-title" className="tk-next">
      <div className="min-w-0 flex-[1_1_20rem]">
        <p className="tk-next-eyebrow">{late > 0 ? "Next up · most overdue" : "Next up · due today"}</p>
        <h2 id="tk-next-title" className="tk-next-title">{entry.subject}</h2>
        {entry.dueDate ? (
          <p className="tk-next-meta" suppressHydrationWarning>Due {dayLabel(entry.dueDate)}{late > 0 ? <> · <b>{late} {late === 1 ? "day" : "days"} late</b></> : null}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={pending} onClick={() => run(markDone(entry), "Done")} className="tk-next-btn tk-next-primary">
          <Check className="size-4" aria-hidden="true" />Mark done
        </button>
        <button type="button" onClick={onOpen} className="tk-next-btn">Move date</button>
        <span className="tk-next-star"><FavouriteToggle entry={entry} /></span>
      </div>
    </section>
  );
}

/** This week: done vs still due (ring) and to-dos finished per day (bars). */
function WeekCard({ entries, today }: { entries: TrackerEntry[]; today: string }) {
  const monday = startOfWeek(parseISO(today), { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, index) => format(addDays(monday, index), "yyyy-MM-dd"));
  const tasks = entries.filter((entry) => entry.kind === "Task");
  const donePerDay = days.map((day) => tasks.filter((entry) => !isOpen(entry) && entry.completedAt && localDay(entry.completedAt) === day).length);
  const done = donePerDay.reduce((sum, count) => sum + count, 0);
  const left = tasks.filter((entry) => isOpen(entry) && entry.dueDate !== null && entry.dueDate <= days[6]).length;
  const late = tasks.filter((entry) => isOpen(entry) && entry.dueDate !== null && entry.dueDate < today).length;
  const pct = done + left ? Math.round((done / (done + left)) * 100) : 0;
  const most = Math.max(1, ...donePerDay);
  return (
    <section aria-labelledby="tk-week-title" className="tk-card">
      <div className="flex items-center gap-4">
        <div className="tk-ring" style={{ "--p": `${pct}%` } as React.CSSProperties} aria-hidden="true"><span>{pct}%</span></div>
        <div>
          <h2 id="tk-week-title" className="tk-card-title">This week</h2>
          <p className="text-sm text-text-muted" suppressHydrationWarning>{done} done · {left} still due{late ? ` · ${late} late` : ""}</p>
        </div>
      </div>
      <div className="tk-bars" aria-hidden="true">
        {donePerDay.map((count, index) => (
          <span key={days[index]} data-today={days[index] === today || undefined} style={{ height: `${Math.max(8, (count / most) * 100)}%` }} />
        ))}
      </div>
      <div className="tk-bars-days" aria-hidden="true">
        {days.map((day) => <span key={day} data-today={day === today || undefined}>{format(parseISO(day), "EEEEE")}</span>)}
      </div>
      <p className="sr-only">To-dos finished each day this week: {days.map((day, index) => `${format(parseISO(day), "EEEE")} ${donePerDay[index]}`).join(", ")}.</p>
    </section>
  );
}

/** Who you're waiting on: open follow-ups by person; "Your turn" when they replied. */
function WaitingCard({ entries, today, onShowAll }: { entries: TrackerEntry[]; today: string; onShowAll: () => void }) {
  const people = useMemo(() => {
    const byPerson = new Map<string, { threads: number; replied: number; due: number }>();
    for (const entry of entries) {
      if (entry.kind !== "FollowUp" || !isOpen(entry)) continue;
      const name = entry.person ?? "Someone";
      const row = byPerson.get(name) ?? { threads: 0, replied: 0, due: 0 };
      row.threads += 1;
      if (followStateOf(entry) === "replied") row.replied += 1;
      else if (needsYou(entry, today)) row.due += 1;
      byPerson.set(name, row);
    }
    return [...byPerson.entries()].sort((a, b) => b[1].replied - a[1].replied || b[1].due - a[1].due || b[1].threads - a[1].threads).slice(0, 4);
  }, [entries, today]);
  return (
    <section aria-labelledby="tk-wait-title" className="tk-card">
      <div className="flex items-center justify-between gap-3">
        <h2 id="tk-wait-title" className="tk-card-title">Waiting on</h2>
        <button type="button" onClick={onShowAll} className="tap-area cursor-pointer text-sm font-semibold text-accent-text hover:underline">All follow-ups →</button>
      </div>
      {people.length ? (
        <ul className="mt-3 flex flex-col gap-3">
          {people.map(([name, row]) => (
            <li key={name} className="flex items-center gap-3">
              <span className="tk-avatar" aria-hidden="true">{name.trim().charAt(0).toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <b className="block truncate font-semibold text-text">{name}</b>
                <span className="text-sm text-text-muted">{row.threads} {row.threads === 1 ? "thread" : "threads"}{row.replied ? ` · ${row.replied} replied` : ""}</span>
              </span>
              {row.replied ? <span className="tk-chip" data-tone="replied">Your turn</span> : row.due ? <span className="tk-chip" data-tone="due">Nudge due</span> : <span className="tk-chip">Waiting</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-text-muted">Nobody — no open follow-ups.</p>
      )}
    </section>
  );
}

/** A peek at personal to-dos (sticky notes); the button switches to the Personal list. */
function PersonalCard({ entries, onShowAll }: { entries: TrackerEntry[]; onShowAll: () => void }) {
  const open = entries.filter(isOpen);
  return (
    <section aria-labelledby="tk-personal-title" className="tk-card">
      <div className="flex items-center justify-between gap-3">
        <h2 id="tk-personal-title" className="tk-card-title">Personal</h2>
        <button type="button" onClick={onShowAll} className="tap-area cursor-pointer text-sm font-semibold text-accent-text hover:underline">Open · {open.length}</button>
      </div>
      {open.length ? (
        <ul className="mt-3 grid grid-cols-2 gap-2.5">
          {open.slice(0, 4).map((entry, index) => (
            <li key={entry.id} className="tk-mini-sticky" data-tint={index % 4}>{entry.subject}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-text-muted">Nothing personal on the list.</p>
      )}
    </section>
  );
}

/** Personal sticky notes start without a date — they're jotted, not scheduled. */
function AddTodo({ today, personal = false }: { today: string; personal?: boolean }) {
  const startDate = personal ? "" : today;
  const [subject, setSubject] = useState("");
  const [date, setDate] = useState(startDate);
  const [pinned, setPinned] = useState(false);
  const [panel, setPanel] = useState(false);
  const { create, pending, error, setError } = useCreate(() => { setSubject(""); setDate(startDate); setPinned(false); setPanel(false); });

  function save() {
    if (pending) return;
    // The button is always live (a greyed CTA reads as broken); empty → point at the field.
    if (!subject.trim()) { setError("Write the to-do first"); document.getElementById("add-todo")?.focus(); return; }
    create({ kind: "Task", subject: subject.trim().slice(0, personal ? 1000 : 300), dueDate: date || null, personal }, pinned);
  }

  return (
    <AddPill
      label={personal ? "Add a personal to-do" : "Add a to-do"}
      inputId="add-todo"
      multiline={personal}
      placeholder={personal ? "Jot a personal to-do…" : "Add a to-do…"}
      value={subject}
      onChange={(value) => { setSubject(value); setError(undefined); }}
      onSubmit={save}
      pending={pending}
      error={error}
      tools={
        <>
          <DateTool label="Set due date" value={date} today={today} expanded={panel} onClick={() => setPanel(!panel)} />
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

/** Today rows carry a status eyebrow; upcoming rows are just tick + title (the bucket has the date). */
function TodoRow({ entry, today, mode, onOpen }: { entry: TrackerEntry; today: string; mode: "today" | "upcoming" | "done"; onOpen: () => void }) {
  return (
    <Row
      muted={mode === "done"}
      needs={mode === "today"}
      eyebrow={mode === "today" ? todoMeta(entry, today) : undefined}
      leading={<DoneCircle entry={entry} />}
      title={entry.subject}
      onOpen={onOpen}
      meta={<LatestLine entry={entry} />}
      actions={<><DeleteEntry entry={entry} /><FavouriteToggle entry={entry} /></>}
    />
  );
}

// --- personal to-dos ---------------------------------------------------------------

/** Work | Personal, shown on the To-do tab. Arrow keys move between the two. */
function ScopeToggle({ value, counts, onChange }: { value: TodoScope; counts: Record<TodoScope, number>; onChange: (next: TodoScope) => void }) {
  const options: Array<{ id: TodoScope; label: string }> = [
    { id: "work", label: "Work" },
    { id: "personal", label: "Personal" },
  ];
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const next = value === "work" ? "personal" : "work";
    onChange(next);
    event.currentTarget.querySelector<HTMLElement>(`[data-scope="${next}"]`)?.focus();
  }
  const ref = useSlidingPill<HTMLDivElement>(value);
  return (
    <div ref={ref} role="radiogroup" aria-label="To-do list" onKeyDown={onKeyDown} className="tk-scope tk-slide inline-flex shrink-0 rounded-full border border-[var(--c-tk-rule)] bg-surface p-0.5">
      {options.map((option) => {
        const on = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            data-scope={option.id}
            data-on={on || undefined}
            onClick={() => onChange(option.id)}
            className={cn(
              "flex h-10 cursor-pointer items-center gap-2 rounded-full px-4.5 text-md font-semibold whitespace-nowrap transition-colors duration-150",
              on ? "bg-sidebar text-sidebar-fg" : "text-text-muted hover:text-text",
            )}
          >
            {option.label}
            <span className={cn("text-sm tabular-nums", on ? "text-sidebar-muted" : "text-text-subtle")}>{counts[option.id]}</span>
          </button>
        );
      })}
    </div>
  );
}

const STICKY_TILTS = ["-1.2deg", "0.8deg", "-0.5deg", "1.1deg", "-0.9deg"];

/** A stable pick from the id, so a note keeps its colour and tilt between visits. */
function stickyLook(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return { "--sticky": `var(--c-sticky-${(hash % 5) + 1})`, "--tilt": STICKY_TILTS[(hash >>> 3) % STICKY_TILTS.length] } as React.CSSProperties;
}

/** "Overdue · 8 Oct", "Today", "Thu 22 Oct" — or nothing for an undated note. */
function stickyDue(entry: TrackerEntry, today: string) {
  if (!entry.dueDate) return null;
  if (entry.dueDate < today) return { text: `Overdue · ${format(parseISO(entry.dueDate), "d MMM")}`, needs: true };
  if (entry.dueDate === today) return { text: "Today", needs: true };
  return { text: dayLabel(entry.dueDate), needs: false };
}

/**
 * Personal to-dos as a wall of sticky notes: favourites first, then the soonest
 * date, then the newest. Finished ones fold into the usual collapsed line.
 */
function StickyBoard({ entries, today, needle, onOpen }: { entries: TrackerEntry[]; today: string; needle: string; onOpen: (entry: TrackerEntry) => void }) {
  const { open, done } = useMemo(() => {
    const groups = { open: [] as TrackerEntry[], done: [] as TrackerEntry[] };
    for (const entry of entries) {
      if (!matches(entry, needle)) continue;
      (isOpen(entry) ? groups.open : groups.done).push(entry);
    }
    groups.open.sort((a, b) => important(a, b) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || b.createdAt.localeCompare(a.createdAt));
    groups.done.sort(byCompleted);
    return groups;
  }, [entries, needle]);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Column title="Personal" count={open.length} aside="Just for you · kept out of Work Logs">
        {open.length ? (
          <ol className="grid grid-cols-1 gap-6 pt-7 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {open.map((entry) => <StickyNote key={entry.id} entry={entry} today={today} onOpen={() => onOpen(entry)} />)}
          </ol>
        ) : (
          <Empty>{needle ? "Nothing matches." : "No personal to-dos. Jot one above — it lands here as a sticky note."}</Empty>
        )}
      </Column>
      <div className="lg:max-w-[calc(50%-1.75rem)]">
        <FinishedGroup verb="done" entries={done} today={today} needle={needle} render={(entry) => <TodoRow key={entry.id} entry={entry} today={today} mode="done" onOpen={() => onOpen(entry)} />} />
      </div>
    </div>
  );
}

function StickyNote({ entry, today, onOpen }: { entry: TrackerEntry; today: string; onOpen: () => void }) {
  const due = stickyDue(entry, today);
  const [editing, setEditing] = useState(false);
  return (
    <li style={stickyLook(entry.id)} className="tk-sticky group flex min-h-44 min-w-0 flex-col gap-3 p-5">
      {editing ? (
        <StickyEditor entry={entry} onDone={() => setEditing(false)} />
      ) : (
        <>
          <div className="flex min-w-0 items-start gap-3">
            <DoneCircle entry={entry} />
            <button type="button" onClick={onOpen} className="tk-row-title line-clamp-6 min-w-0 flex-1 cursor-pointer text-left whitespace-pre-line [overflow-wrap:anywhere] decoration-2 underline-offset-4 hover:underline">
              {entry.subject}
            </button>
          </div>
          <LatestLine entry={entry} />
          <div className="mt-auto flex items-center justify-between gap-2">
            {due ? <p className={cn("tk-label", due.needs ? "text-warning" : "text-text-muted")} suppressHydrationWarning>{due.text}</p> : <span />}
            <div className="-mr-2 -mb-2 flex items-center">
              <button
                type="button"
                aria-label={`Edit: ${entry.subject}`}
                title="Edit"
                onClick={() => setEditing(true)}
                className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-text-subtle transition-[color,background-color,opacity] duration-150 hover:bg-surface-2 hover:text-text md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
              >
                <Pencil className="size-4.5" strokeWidth={1.8} aria-hidden="true" />
              </button>
              <DeleteEntry entry={entry} />
              <FavouriteToggle entry={entry} />
            </div>
          </div>
        </>
      )}
    </li>
  );
}

/** The note's text in place: Enter saves, Shift+Enter is a new line, Escape cancels. */
function StickyEditor({ entry, onDone }: { entry: TrackerEntry; onDone: () => void }) {
  const { run, pending } = useRun();
  const [text, setText] = useState(entry.subject);
  const [error, setError] = useState<string>();
  const id = `sticky-edit-${entry.id}`;

  function save() {
    if (pending) return;
    const next = text.trim();
    if (!next) { setError("Write something, or delete the note"); return; }
    if (next === entry.subject) { onDone(); return; }
    run(() => editPersonalTodo({ followUpId: entry.id, subject: next }), "Saved", onDone);
  }

  return (
    <form onSubmit={(event) => { event.preventDefault(); save(); }} className="flex min-w-0 flex-1 flex-col gap-3">
      <label htmlFor={id} className="sr-only">Edit the note</label>
      <textarea
        id={id}
        ref={(field) => fitHeight(field)}
        autoFocus
        rows={2}
        value={text}
        maxLength={1000}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-keys`}
        onFocus={(event) => event.currentTarget.setSelectionRange(text.length, text.length)}
        onChange={(event) => { setText(event.target.value); setError(undefined); fitHeight(event.target); }}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); onDone(); return; }
          onEnterSave(save)(event);
        }}
        className="tk-row-title max-h-72 min-h-20 w-full resize-none rounded-md bg-surface/70 p-2 outline-none focus-visible:shadow-[var(--sh-focus)]"
      />
      {error ? <p className="text-sm font-medium text-danger" role="alert">{error}</p> : null}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        <p id={`${id}-keys`} className="text-sm text-text-muted">Enter saves · Shift+Enter new line</p>
        <div className="flex gap-1.5">
          <Button size="sm" variant="secondary" onClick={onDone}>Cancel</Button>
          <Button size="sm" type="submit" disabled={pending}>Save</Button>
        </div>
      </div>
    </form>
  );
}

// --- follow-ups ------------------------------------------------------------------

/**
 * Laid out like Notes (owner, 2026-11-01). Left: the composer and the collapsed
 * closed line. Right: Needs you — Your turn (they replied), Nudge due — then
 * Waiting. "Got it" closes; "Mark nudged" records a nudge.
 */
function FollowUpQueue({ entries, people, today, needle, onOpen }: { entries: TrackerEntry[]; people: string[]; today: string; needle: string; onOpen: (entry: TrackerEntry) => void }) {
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

  const row = (entry: TrackerEntry) => <FollowUpRow key={entry.id} entry={entry} today={today} onOpen={() => onOpen(entry)} />;
  const needCount = groups.replied.length + groups.due.length;

  return (
    <Columns>
      <Column title="New update">
        <div className="relative z-10 pt-5"><AddFollowUp people={people} today={today} /></div>
        <FinishedGroup verb="closed" entries={groups.closed} today={today} needle={needle} render={row} />
      </Column>
      <Column title="Follow-ups" count={needCount + groups.waiting.length} needs={needCount > 0} aside={needLine(needCount)}>
        {groups.replied.length ? <Bucket label="Your turn" needs>{groups.replied.map(row)}</Bucket> : null}
        {groups.due.length ? <Bucket label="Nudge due" needs>{groups.due.map(row)}</Bucket> : null}
        {groups.waiting.length ? <Bucket label="Waiting">{groups.waiting.map(row)}</Bucket> : null}
        {needCount + groups.waiting.length === 0 ? <Empty>{needle ? "Nothing matches." : "Nothing open. Start a follow-up on the left."}</Empty> : null}
      </Column>
    </Columns>
  );
}

/**
 * What a new follow-up records. Not stored as its own field: "they told me" is a
 * first message with `fromThem`, and only "waiting" carries a reminder date — the
 * others use the date as when it was said. "General" is the catch-all for any
 * conversation that isn't clearly one direction: saved like "I told", neutral copy.
 */
const FOLLOW_MODES = {
  general: { label: "General", Icon: MessagesSquare, subject: "What was it about?", body: "Notes (optional)…", who: "Who was it with?", whoTool: (p: string) => `With ${p}`, submit: "Save", datePrefix: "On", date: "Talked on", dateHint: "When the conversation happened. Past dates are fine." },
  waiting: { label: "Waiting on", Icon: Clock, subject: "What are you waiting on?", body: "What you sent them (optional)…", who: "Who are you waiting on?", whoTool: (p: string) => `Waiting on ${p}`, submit: "Add follow-up", datePrefix: "", date: "Remind me on", dateHint: "Choose when you want to follow up again if they have not replied." },
  told: { label: "I told", Icon: Send, subject: "What did you tell them?", body: "Details (optional)…", who: "Who did you tell?", whoTool: (p: string) => `Told ${p}`, submit: "Save", datePrefix: "Said", date: "Told them on", dateHint: "When you told them. Past dates are fine." },
  theyTold: { label: "They told me", Icon: MessageSquareReply, subject: "What did they tell you?", body: "What they said (optional)…", who: "Who told you?", whoTool: (p: string) => `From ${p}`, submit: "Save", datePrefix: "Said", date: "They told me on", dateHint: "When they told you. Past dates are fine." },
} as const;
type FollowMode = keyof typeof FOLLOW_MODES;

/** The same card as New note: the subject, the first message, then type (dropdown) / the first message, then who / when / star. */
function AddFollowUp({ people, today }: { people: string[]; today: string }) {
  const { channels } = useContext(ListsContext);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState<EditorValue>({ doc: null, text: "", hasContent: false });
  // Remounting the editor (new key) is how it clears after a save.
  const [editorKey, setEditorKey] = useState(0);
  const [person, setPerson] = useState("");
  const [channel, setChannel] = useState(defaultChannel(channels));
  const [date, setDate] = useState(today);
  const [pinned, setPinned] = useState(false);
  const [mode, setMode] = useState<FollowMode>("general");
  const copy = FOLLOW_MODES[mode];
  const [panel, setPanel] = useState<"who" | "date" | null>(null);
  const { create, pending, error, setError } = useCreate(() => {
    setSubject(""); setBody({ doc: null, text: "", hasContent: false }); setEditorKey((key) => key + 1);
    setPerson(""); setDate(today); setPinned(false); setPanel(null);
  });

  function save() {
    if (pending) return;
    if (!subject.trim()) { setError("Write what it is about first"); document.getElementById("add-follow-up")?.focus(); return; }
    if (!person.trim()) { setError(copy.who); setPanel("who"); return; }
    const waiting = mode === "waiting";
    create(
      {
        kind: "FollowUp",
        person: person.trim(),
        subject: subject.trim().slice(0, 300),
        // The first message is a real record row, so "you wrote 3d ago via Slack"
        // comes from the same place as every later nudge. No message → the subject.
        ...(body.hasContent ? { doc: body.doc, note: body.text } : { note: subject.trim() }),
        channel,
        // Waiting: the date is the reminder. Told / they told: it is when it was said.
        dueDate: waiting ? date || null : null,
        occurredAt: waiting ? null : date || null,
        fromThem: mode === "theyTold",
      },
      pinned,
    );
  }

  return (
    <form aria-label="Add a follow-up" onSubmit={(event) => { event.preventDefault(); save(); }} className="relative">
      <div className="tk-field flex flex-col rounded-2xl border border-border-strong bg-surface">
        <label htmlFor="add-follow-up" className="sr-only">{copy.subject}</label>
        <input
          id="add-follow-up"
          value={subject}
          maxLength={300}
          placeholder={copy.subject}
          aria-invalid={error ? true : undefined}
          onChange={(event) => { setSubject(event.target.value); setError(undefined); }}
          className="min-w-0 border-b border-border bg-transparent px-5 pt-4 pb-3 text-lg font-semibold text-text outline-none placeholder:font-medium placeholder:text-text-muted"
        />
        <UpdateEditor key={editorKey} id="add-follow-up-body" label="First message" placeholder={`${copy.body} paste formatted text, images or files`} minHeight="min-h-32" onChange={setBody} onSubmit={save} />
        <div className="flex flex-wrap items-center gap-1 border-t border-border py-1.5 pr-1.5 pl-2">
          <FollowModeMenu value={mode} onChange={(next) => { setMode(next); setError(undefined); }} />
          <ToolButton label={person ? copy.whoTool(person) : copy.who} expanded={panel === "who"} onClick={() => setPanel(panel === "who" ? null : "who")} className={person ? "text-text" : undefined}>
            {person ? <Avatar name={person} /> : <UserRound className="size-5" strokeWidth={1.8} aria-hidden="true" />}
            {person ? <span className="max-w-32 truncate">{person}</span> : null}
          </ToolButton>
          <DateTool label={copy.date} prefix={copy.datePrefix} value={date} today={today} expanded={panel === "date"} onClick={() => setPanel(panel === "date" ? null : "date")} />
          <StarTool value={pinned} onChange={setPinned} />
          <span className="ml-auto text-sm text-text-subtle max-md:hidden">⌘/Ctrl + Enter</span>
          <button type="submit" disabled={pending} className="ml-2 h-11 shrink-0 cursor-pointer rounded-full bg-sidebar px-5 text-md font-semibold text-sidebar-fg transition-colors duration-150 hover:bg-sidebar-3 disabled:cursor-wait disabled:opacity-60 max-md:ml-auto">
            {copy.submit}
          </button>
        </div>
      </div>
      {panel === "who" ? (
        <PillPanel label="Who and where" onClose={() => setPanel(null)}>
          <Field label="Who" htmlFor="add-fu-person" hint="Start typing to search saved names, or enter a new one." required>
            <PersonAutocomplete id="add-fu-person" value={person} options={people} onChange={(next) => { setPerson(next); setError(undefined); }} />
          </Field>
          <Field label="Where" htmlFor="add-fu-channel">
            <ChannelSelect id="add-fu-channel" value={channel} onChange={setChannel} />
          </Field>
        </PillPanel>
      ) : panel === "date" ? (
        <DatePanel
          id="add-fu-date"
          label={copy.date}
          hint={copy.dateHint}
          value={date}
          onChange={setDate}
          onClose={() => setPanel(null)}
        />
      ) : null}
      {error ? <p className="mt-2 px-1 text-base font-medium text-danger" role="alert">{error}</p> : null}
    </form>
  );
}

/** The follow-up type as a compact dropdown in the composer's toolbar — one card for every kind of conversation. */
function FollowModeMenu({ value, onChange }: { value: FollowMode; onChange: (mode: FollowMode) => void }) {
  const current = FOLLOW_MODES[value];
  return (
    <Menu
      label="Follow-up type"
      align="start"
      side="top"
      trigger={(props) => (
        <button
          {...props}
          type="button"
          aria-label={`Type: ${current.label}`}
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-primary-subtle px-3 text-sm font-semibold text-primary-strong transition-colors duration-150 hover:bg-surface-3"
        >
          <current.Icon className="size-4" aria-hidden="true" />
          {current.label}
          <ChevronDown className="size-3.5" aria-hidden="true" />
        </button>
      )}
    >
      {(Object.keys(FOLLOW_MODES) as FollowMode[]).map((key) => {
        const option = FOLLOW_MODES[key];
        return (
          <button
            key={key}
            type="button"
            role="menuitemradio"
            aria-checked={value === key}
            onClick={() => onChange(key)}
            className={cn(menuItemClass, value === key && "text-primary-strong")}
          >
            <option.Icon aria-hidden="true" />
            <span className="flex-1 text-left">{option.label}</span>
            {value === key ? <Check aria-hidden="true" /> : null}
          </button>
        );
      })}
    </Menu>
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

/** Eyebrow "NUDGE DUE · ASHWINI" over the title; compact (upcoming / finished) = tick + title + person. */
function FollowUpRow({ entry, today, compact = false, onOpen }: { entry: TrackerEntry; today: string; compact?: boolean; onOpen: () => void }) {
  const state = followStateOf(entry);
  const person = entry.person ?? "Someone";
  const needs = needsYou(entry, today);
  if (compact) {
    return (
      <Row
        muted={state === "closed"}
        leading={<DoneCircle entry={entry} />}
        title={entry.subject}
        onOpen={onOpen}
        meta={<LatestLine entry={entry} />}
        actions={<><span className="text-sm text-text-muted">{person}</span><DeleteEntry entry={entry} /></>}
      />
    );
  }
  const status = state === "closed" ? "Closed" : state === "replied" ? "Replied" : needs ? "Nudge due" : entry.dueDate ? `Nudge ${dayLabel(entry.dueDate)}` : "Waiting";
  return (
    <Row
      // Wide: the text keeps its width and the buttons drop below it in a narrow column.
      wide
      muted={state === "closed"}
      needs={needs}
      eyebrow={`${status} · ${person}`}
      leading={<span className="tk-avatar tk-avatar-sm" aria-hidden="true">{person.trim().charAt(0).toUpperCase()}</span>}
      title={entry.subject}
      onOpen={onOpen}
      meta={
        <>
          <LatestLine entry={entry} />
          {!needs && state !== "closed" ? <p className="text-sm text-text-muted" suppressHydrationWarning>{followMeta(entry, today)}</p> : null}
        </>
      }
      actions={
        <>
          <DeleteEntry entry={entry} />
          {state === "closed" ? (
            <ActionPill label="Reopen" action={markOpen(entry)} success="Reopened" />
          ) : state === "replied" ? (
            <ActionPill ink label="Got it" action={markDone(entry)} success="Closed" />
          ) : needs ? (
            <NudgePill entry={entry} ink />
          ) : (
            <>
              <NudgePill entry={entry} ink={false} />
              <ActionPill label="Got it" action={markDone(entry)} success="Closed" />
            </>
          )}
        </>
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

/** "today", "yesterday", "3 days ago", then the date — the note list's one time column. */
function noteWhen(iso: string, today: string) {
  const days = differenceInCalendarDays(parseISO(today), parseISO(localDay(iso)));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return format(parseISO(iso), "d MMM");
}

/**
 * One card (owner mockup, 2026-11-11): title + count + New note, a search, tag
 * filters, then Pinned · This week · Earlier. The composer opens in a popup so
 * the list is the page. Archived notes stay collapsed at the bottom.
 */
function NoteQueue({ entries, suggestions, today, needle, onOpen }: { entries: TrackerEntry[]; suggestions: string[]; today: string; needle: string; onOpen: (entry: TrackerEntry) => void }) {
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const tags = useMemo(() => noteTags(entries.filter(isOpen)).map(([name]) => name), [entries]);
  const activeTag = tag && tags.includes(tag) ? tag : null;

  const { groups, archived, count } = useMemo(() => {
    const local = search.trim().toLowerCase();
    const next = { pinned: [] as TrackerEntry[], week: [] as TrackerEntry[], earlier: [] as TrackerEntry[] };
    const done: TrackerEntry[] = [];
    let total = 0;
    for (const entry of entries) {
      if (!matches(entry, needle) || (local && !matches(entry, local))) continue;
      if (!isOpen(entry)) { done.push(entry); continue; }
      if (activeTag && !entry.tags.includes(activeTag)) continue;
      total += 1;
      if (entry.pinned) next.pinned.push(entry);
      else if (differenceInCalendarDays(parseISO(today), parseISO(localDay(entry.updatedAt))) < 7) next.week.push(entry);
      else next.earlier.push(entry);
    }
    for (const list of Object.values(next)) list.sort(byRecent);
    done.sort(byCompleted);
    return { groups: next, archived: done, count: total };
  }, [entries, needle, search, activeTag, today]);

  const row = (entry: TrackerEntry) => <NoteRow key={entry.id} entry={entry} today={today} onOpen={() => onOpen(entry)} onTag={setTag} />;
  const group = (label: string, items: TrackerEntry[]) => items.length ? (
    <div>
      <h3 className="tk-label px-1 pt-5 pb-2 text-text-muted">{label}</h3>
      {/* Rows flow into columns as the card widens, so the width holds notes, not gaps. */}
      <ol className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">{items.map(row)}</ol>
    </div>
  ) : null;
  const chip = (on: boolean) => cn(
    "inline-flex h-10 shrink-0 cursor-pointer items-center rounded-full border px-4 text-md font-semibold whitespace-nowrap transition-colors duration-150",
    on ? "border-sidebar bg-sidebar text-sidebar-fg" : "border-border bg-surface text-text hover:border-text",
  );

  return (
    <section aria-labelledby="tk-notes-title" className="tk-notes flex w-full min-w-0 flex-col rounded-2xl border border-border bg-surface p-4 shadow-xs md:p-6">
      {/* Wide screens: title · search · New note on one line; below lg the search drops under. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <h2 id="tk-notes-title" className="flex items-baseline gap-2.5 text-2xl font-bold text-text">
          Notes <span className="text-md font-semibold text-text-muted tabular-nums">{count}</span>
        </h2>
        <SearchPill id="tk-notes-search" label="Search notes" value={search} placeholder="Search notes" onChange={setSearch} className="order-last w-full lg:order-none lg:ml-auto lg:w-96" />
        <button type="button" onClick={() => setAdding(true)} className={cn(PILL, PILL_INK, "gap-2 px-4 max-lg:ml-auto")}>
          <Plus className="size-4.5" strokeWidth={2.4} aria-hidden="true" />
          New note
        </button>
      </div>
      {tags.length ? (
        <div role="group" aria-label="Filter by tag" className="mt-3 flex gap-2 overflow-x-auto pb-1">
          <button type="button" aria-pressed={!activeTag} onClick={() => setTag(null)} className={chip(!activeTag)}>All</button>
          {tags.map((name) => (
            <button key={name} type="button" aria-pressed={activeTag === name} onClick={() => setTag(activeTag === name ? null : name)} className={chip(activeTag === name)}>
              #{name}
            </button>
          ))}
        </div>
      ) : null}
      {count ? (
        <div className="mt-1">
          {group("Pinned", groups.pinned)}
          {group("This week", groups.week)}
          {group("Earlier", groups.earlier)}
        </div>
      ) : (
        <div className="mt-4"><Empty>{needle || search || activeTag ? "Nothing matches." : "No notes yet. Press New note to write one."}</Empty></div>
      )}
      <FinishedGroup verb="archived" entries={archived} today={today} needle={needle || search} render={row} />
      {adding ? (
        <Modal open size="lg" onClose={() => setAdding(false)} title="New note">
          <AddNote suggestions={suggestions} today={today} onSaved={() => setAdding(false)} />
        </Modal>
      ) : null}
    </section>
  );
}

/** `onSaved` set = it lives in the New note popup: panels open in the flow (the popup body would clip a floating one). */
function AddNote({ suggestions, today, onSaved }: { suggestions: string[]; today: string; onSaved?: () => void }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState<EditorValue>({ doc: null, text: "", hasContent: false });
  // Remounting the editor (new key) is how it clears after a save.
  const [editorKey, setEditorKey] = useState(0);
  const [date, setDate] = useState(today);
  const [tags, setTags] = useState<string[]>([]);
  const [pinned, setPinned] = useState(false);
  const [panel, setPanel] = useState<"tags" | "date" | null>(null);
  const { create, pending, error, setError } = useCreate(() => {
    setSubject(""); setBody({ doc: null, text: "", hasContent: false }); setEditorKey((key) => key + 1);
    setDate(today); setTags([]); setPinned(false); setPanel(null);
    onSaved?.();
  });

  function save() {
    if (pending) return;
    if (!subject.trim()) { setError("Give the note a title"); document.getElementById("add-note")?.focus(); return; }
    create(
      {
        kind: "Note",
        subject: subject.trim().slice(0, 300),
        ...(body.hasContent ? { doc: body.doc, note: body.text } : {}),
        channel: "Other",
        // The note's date: now when it's today, else midday of the chosen day (no timezone drift).
        occurredAt: date && date !== today ? new Date(`${date}T12:00:00`).toISOString() : null,
        tags,
      },
      pinned,
    );
  }

  return (
    <form aria-label="Add a note" onSubmit={(event) => { event.preventDefault(); save(); }} className={cn("relative", onSaved && "tk-inline-panels")}>
      <div className="tk-field flex flex-col rounded-2xl border border-border-strong bg-surface">
        <label htmlFor="add-note" className="sr-only">Note title</label>
        <input
          id="add-note"
          autoFocus
          value={subject}
          maxLength={300}
          placeholder="Note title"
          aria-invalid={error ? true : undefined}
          onChange={(event) => { setSubject(event.target.value); setError(undefined); }}
          className="min-w-0 border-b border-border bg-transparent px-5 pt-4 pb-3 text-lg font-semibold text-text outline-none placeholder:font-medium placeholder:text-text-muted"
        />
        <UpdateEditor key={editorKey} id="add-note-body" label="Note" placeholder="Write the note… paste formatted text, images or files" minHeight="min-h-40" onChange={setBody} onSubmit={save} />
        <div className="flex flex-wrap items-center gap-1 border-t border-border py-1.5 pr-1.5 pl-2">
          <DateTool label="Note date" value={date} today={today} expanded={panel === "date"} onClick={() => setPanel(panel === "date" ? null : "date")} />
          <ToolButton label={tags.length ? `Tags: ${tags.join(", ")}` : "Add a tag"} expanded={panel === "tags"} onClick={() => setPanel(panel === "tags" ? null : "tags")} className={tags.length ? "text-text" : undefined}>
            <Hash className="size-5" strokeWidth={1.8} aria-hidden="true" />
            {tags.length ? <span className="max-w-48 truncate">{tags.map((tag) => `#${tag}`).join(" ")}</span> : null}
          </ToolButton>
          <StarTool value={pinned} onChange={setPinned} />
          <span className="ml-auto text-sm text-text-subtle max-md:hidden">⌘/Ctrl + Enter</span>
          <button type="submit" disabled={pending} className="ml-2 h-11 shrink-0 cursor-pointer rounded-full bg-sidebar px-5 text-md font-semibold text-sidebar-fg transition-colors duration-150 hover:bg-sidebar-3 disabled:cursor-wait disabled:opacity-60 max-md:ml-auto">
            Add note
          </button>
        </div>
      </div>
      {panel === "tags" ? (
        <PillPanel label="Tags" onClose={() => setPanel(null)}>
          <Field label="Tags" htmlFor="add-note-tags" hint="Enter or comma adds a tag.">
            <TagInput id="add-note-tags" value={tags} onChange={setTags} suggestions={suggestions} placeholder="e.g. drupal, deploy" />
          </Field>
        </PillPanel>
      ) : panel === "date" ? (
        <DatePanel id="add-note-date" label="Note date" hint="Optional — today unless you pick another day." value={date} onChange={setDate} onClose={() => setPanel(null)} />
      ) : null}
      {error ? <p className="mt-2 px-1 text-base font-medium text-danger" role="alert">{error}</p> : null}
    </form>
  );
}

/** A note row is just its title, tags and when it changed — the text stays inside (owner, 2026-10-14). A bordered card, the same height as its neighbours (title clamps at two lines). */
function NoteRow({ entry, today, onOpen, onTag }: { entry: TrackerEntry; today: string; onOpen: () => void; onTag: (tag: string) => void }) {
  const archived = !isOpen(entry);
  return (
    <li className="group flex min-h-24 items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 transition-[border-color,box-shadow] duration-150 hover:border-border-strong hover:shadow-xs">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <button type="button" onClick={onOpen} className={cn("line-clamp-2 w-fit max-w-full cursor-pointer text-left text-lg font-semibold text-text [overflow-wrap:anywhere] decoration-2 underline-offset-4 hover:underline max-md:text-md", archived && "text-text-muted")}>
          {entry.subject}
        </button>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-md text-text-muted">
          {entry.tags.map((tag) => (
            <button key={tag} type="button" onClick={() => onTag(tag)} title={`Show notes tagged #${tag}`} style={tagChipStyle(tag)} className={cn(tagChipClass, "cursor-pointer rounded-md bg-[color-mix(in_srgb,var(--tag)_14%,transparent)] px-1.5 py-0.5 hover:bg-[color-mix(in_srgb,var(--tag)_24%,transparent)]")}>
              #{tag}
            </button>
          ))}
          <span suppressHydrationWarning>{archived ? `Archived ${noteWhen(entry.completedAt ?? entry.updatedAt, today)}` : noteWhen(entry.updatedAt, today)}</span>
        </div>
      </div>
      {archived ? <ActionPill label="Restore" action={markOpen(entry)} success="Restored" /> : <FavouriteToggle entry={entry} />}
    </li>
  );
}

// --- archived ------------------------------------------------------------------

/** Every archived entry, newest first, grouped by kind. Restore puts it back on its list. */
function ArchiveList({ entries, today, needle, onOpen }: { entries: TrackerEntry[]; today: string; needle: string; onOpen: (entry: TrackerEntry) => void }) {
  const shown = entries.filter((entry) => matches(entry, needle)).sort(byArchived);
  if (shown.length === 0) return <Empty>{needle ? "Nothing matches." : "Nothing archived. Archive a to-do or follow-up from its window to put it here."}</Empty>;
  const groups = (["Task", "FollowUp", "Note"] as const)
    .map((kind) => ({ kind, items: shown.filter((entry) => entry.kind === kind) }))
    .filter((group) => group.items.length);
  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => (
        <Bucket key={group.kind} label={`${group.kind === "Task" ? "To-dos" : group.kind === "FollowUp" ? "Follow-ups" : "Notes"} · ${group.items.length}`}>
          {group.items.map((entry) => (
            <Row
              key={entry.id}
              eyebrow={entryLabel(entry)}
              title={entry.subject}
              onOpen={() => onOpen(entry)}
              meta={
                <span className="text-base font-medium text-text-muted" suppressHydrationWarning>
                  {entry.person ? `${entry.person} · ` : ""}{entry.status === "Done" && entry.kind !== "Note" ? "Done · " : ""}Archived {ago(entry.archivedAt ?? entry.completedAt ?? entry.updatedAt, today)}
                </span>
              }
              actions={
                <>
                  <DeleteEntry entry={entry} />
                  <ActionPill
                    label="Restore"
                    action={() => (entry.archivedAt ? setFollowUpArchived({ followUpId: entry.id, archived: false }) : setFollowUpStatus({ followUpId: entry.id, status: "Open" }))}
                    success="Restored"
                  />
                </>
              }
            />
          ))}
        </Bucket>
      ))}
    </div>
  );
}

// --- the opened entry ----------------------------------------------------------

function EntryEyebrow({ entry }: { entry: TrackerEntry }) {
  return (
    <span className="flex items-center gap-1.5">
      {entryLabel(entry)}
      {entry.pinned ? <><span aria-hidden="true">·</span><Star className="size-3.5 fill-current text-warning" aria-hidden="true" />Favourite</> : null}
    </span>
  );
}

function EntryTitle({ entry }: { entry: TrackerEntry }) {
  return <span className={cn("[overflow-wrap:anywhere]", entry.personal && "whitespace-pre-line", entry.status === "Done" && entry.kind !== "Note" && "text-text-muted line-through")}>{entry.subject}</span>;
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

  // Notes archive through their main button (status); to-dos and follow-ups have their own.
  const canArchive = kind !== "Note";
  const shelved = entry.archivedAt !== null;

  const facts: Array<{ label: string; value: React.ReactNode }> = [
    ...(entry.person ? [{ label: "With", value: entry.person }] : []),
    ...(state ? [{ label: "Status", value: <span style={tone(FOLLOW_STATE[state].tone)} className="font-semibold text-[color-mix(in_srgb,var(--tone)_80%,var(--c-text))]">{FOLLOW_STATE[state].label}</span> }] : []),
    ...(kind === "Task" ? [{ label: "Status", value: isDone ? `Done${entry.completedAt ? ` · ${format(parseISO(entry.completedAt), "d MMM")}` : ""}` : "Open" }] : []),
    ...(entry.ticketKey ? [{ label: "Ticket", value: <span className="font-mono">{entry.ticketKey}</span> }] : []),
    { label: "Added", value: format(parseISO(entry.createdAt), "d MMM yyyy") },
    ...(entry.archivedAt ? [{ label: "Archived", value: format(parseISO(entry.archivedAt), "d MMM yyyy") }] : []),
  ];

  return (
    // Two columns from md: facts, actions and the add form on the left; the history on the right.
    <div className={cn("grid gap-6 md:grid-cols-2 md:gap-8", pending && "opacity-60")}>
      <div className="flex min-w-0 flex-col gap-6">
      {/* Labels on one line, values centred in one 44px row (the date field's height). */}
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
        <dl className="flex flex-wrap gap-x-8 gap-y-4">
          {facts.map((fact) => (
            <div key={fact.label} className="min-w-0">
              <dt className="text-xs text-text-subtle">{fact.label}</dt>
              <dd className="mt-1 flex h-11 items-center text-sm font-medium text-text">{fact.value}</dd>
            </div>
          ))}
        </dl>
        {kind !== "Note" && !isDone ? (
          <div className="min-w-0">
            <label htmlFor={`due-${entry.id}`} className="block text-xs text-text-subtle">{kind === "Task" ? "Due" : "Remind me on"}</label>
            <Input
              id={`due-${entry.id}`}
              type="date"
              value={entry.dueDate ?? ""}
              className="mt-1 h-11 w-44"
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
          {canArchive ? (
            <Button
              size="sm"
              variant="ghost"
              iconOnly
              aria-label={shelved ? "Restore from archive" : "Archive"}
              title={shelved ? "Restore from archive" : "Archive"}
              onClick={() => run(() => setFollowUpArchived({ followUpId: entry.id, archived: !shelved }), shelved ? "Restored" : "Archived")}
            >
              {shelved ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" iconOnly className="hover:text-danger" aria-label={`Delete ${entry.subject}`} title="Delete" onClick={() => setConfirmDelete(true)}>
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </div>

      <AddUpdateForm key={entry.updates.length} entry={entry} />
      </div>

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
  const [value, setValue] = useState<EditorValue>({ doc: null, text: "", hasContent: false });
  const { channels } = useContext(ListsContext);
  const [channel, setChannel] = useState(isFollowUp ? defaultChannel(channels) : "Other");
  const person = entry.person ?? "They";

  const label = isFollowUp ? (fromThem ? `What did ${person} say?` : "What did you tell them?") : entry.kind === "Task" ? "Add a note" : "Add to this note";
  const canSave = fromThem || value.hasContent;

  function save() {
    if (!canSave) return;
    run(
      () => addFollowUpUpdate({ followUpId: entry.id, note: value.text, ...(value.hasContent ? { doc: value.doc } : {}), channel: isFollowUp ? channel : "Other", fromThem: isFollowUp ? fromThem : false }),
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

      {/* One field with its toolbar inside it (like CKEditor), not a separate row. */}
      <div className="flex flex-col gap-1.5">
        {/* The editor is a contenteditable (aria-label = this text), not a form field a <label> can target. */}
        <p aria-hidden="true" className="text-sm font-semibold text-text">{label}</p>
        <UpdateEditor boxed id={`note-${entry.id}`} label={label} placeholder="Write, or paste formatted text, images or files" minHeight={entry.kind === "Note" ? "min-h-44" : "min-h-28"} onChange={setValue} onSubmit={save} />
        <p className="text-sm text-text-muted">{isFollowUp && fromThem ? "Optional — leave blank to just mark it replied." : "⌘/Ctrl + Enter saves. Images and files up to 4 MB."}</p>
      </div>

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
    <section aria-label={heading} className="min-w-0 border-t border-border pt-5 md:border-t-0 md:border-l md:pt-0 md:pl-8">
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
                  {isStatusNote(update) ? (
                    <p className={cn("mt-1 inline-flex items-center gap-1.5 text-sm font-semibold", update.note === TODO_STATUS_NOTES.done ? "text-status-completed-fg" : "text-text-muted")}>
                      {update.note === TODO_STATUS_NOTES.done ? <Check className="size-3.5" strokeWidth={3} aria-hidden="true" /> : <RotateCcw className="size-3.5" aria-hidden="true" />}
                      {update.note}
                    </p>
                  ) : update.doc ? (
                    <UpdateDoc doc={update.doc} className="mt-1 text-md" />
                  ) : update.note ? (
                    <FormattedNote text={update.note} className="mt-1 text-md leading-6 text-text" />
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

"use client";

import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { CalendarDays, Check, ChevronDown, ChevronRight, Plus, Star, Trash2 } from "lucide-react";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { createFollowUp, deleteFollowUp, pingFollowUp, setFollowUpPinned, setFollowUpStatus } from "@/actions/follow-ups";
import { cn } from "@/components/cn";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { isStatusNote } from "@/lib/rich-text";
import { neededSince as neededSinceOf, readEntry, spokeLast } from "@/lib/tracker-rules";
import type { EntryKind, FollowUpStatus } from "@/generated/prisma/enums";

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
  /** When the text was rewritten after saving; null = as first written. */
  editedAt?: string | null;
  /** Earlier versions kept by edits (loaded on demand by `listUpdateRevisions`). */
  revisionCount?: number;
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
export type TrackerView = "todo" | "followups" | "personal" | "notes" | "archived";

export const VIEWS: Array<{ id: TrackerView; label: string }> = [
  { id: "todo", label: "To-do" },
  { id: "followups", label: "Follow-ups" },
  // Its own tab since 2026-11-17 (was a Work | Personal switch on To-do).
  { id: "personal", label: "Personal" },
  { id: "notes", label: "Notes" },
  { id: "archived", label: "Archived" },
];

const KIND_LABEL: Record<EntryKind, string> = { Task: "To-do", FollowUp: "Follow-up", Note: "Note" };

export const entryLabel = (entry: TrackerEntry) => (entry.personal ? "Personal to-do" : KIND_LABEL[entry.kind]);

/**
 * The user's lists from Profile, read deep in the tree (add forms, popups)
 * without threading props through every view.
 */
export const ListsContext = createContext<{ channels: string[]; noteTags: string[]; people: string[] }>({ channels: [], noteTags: [], people: [] });

/**
 * Note types (2026-11-21): Minutes of Meeting or Other. A MoM is a Note tagged
 * `mom` — the same tag work-log meetings already give their linked minutes
 * (`lib/meeting-minutes.ts` MOM_TAG) — with who it was with and the meeting day.
 * Its text is edited in place; Other notes keep the add-to-this-note history.
 */
export const MOM_TAG = "mom";

export type NoteType = "mom" | "other";

export const NOTE_TYPES: Array<{ value: NoteType; label: string }> = [
  { value: "mom", label: "Minutes of meeting" },
  { value: "other", label: "Other" },
];

export const isMom = (entry: TrackerEntry) => entry.kind === "Note" && entry.tags.includes(MOM_TAG);

export const momTitle = (person: string, day: string) => `Meeting with ${person} on ${format(parseISO(day), "d MMM yyyy")}`;

/** The channel dropdown: the user's list, plus the current value if it's since been removed. */
export function ChannelSelect({ id, value, onChange, className }: { id: string; value: string; onChange: (value: string) => void; className?: string }) {
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
export function PersonAutocomplete({ id, value, options, onChange }: { id: string; value: string; options: string[]; onChange: (value: string) => void }) {
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
export function tone(value: string) {
  return { "--tone": value } as React.CSSProperties;
}

export function todayIso() {
  // Local calendar day, not UTC: "today" means the user's today.
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** Prefer Slack regardless of the order saved in Profile. */
export function defaultChannel(channels: string[]) {
  return channels.find((channel) => channel.toLowerCase() === "slack") ?? channels[0] ?? "Slack";
}

/** The clock never notifies us; a re-render is close enough for a date. */
export function subscribeNever() {
  return () => {};
}

/** "today", "yesterday", "3d ago", or a date once it's more than a week old. */
export function ago(iso: string, today: string) {
  const days = differenceInCalendarDays(parseISO(today), parseISO(iso));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return format(parseISO(iso), "d MMM");
}

/** One-line previews show the words, not the **markers**. */
const stripMarks = (text: string) => text.replace(/\*\*([^*\n]+)\*\*/g, "$1").replace(/\*([^*\n]+)\*/g, "$1");

export const plural = (count: number, one: string, many = `${one}s`) => (count === 1 ? one : many);

/** "Thu 8 Oct" */
export const dayLabel = (iso: string) => format(parseISO(iso), "EEE d MMM");

export const STICKY_TITLE_MAX_LENGTH = 80;

/** A personal to-do stores its title and details together. Older entries can be body-only. */
export function splitSticky(subject: string) {
  const [first, ...rest] = subject.split("\n");
  if (first.length > STICKY_TITLE_MAX_LENGTH) return { title: "", body: subject.trim() };
  return { title: first.trim(), body: rest.join("\n").trim() };
}

/** Run a server action, toast the outcome, refresh the board. */
export function useRun() {
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

/** The board's three looks for a follow-up; Time to ping shows as "waiting" with its date. */
type FollowState = "replied" | "waiting" | "closed";

/** Derived from the record, never stored — the rule lives in `lib/tracker-rules.ts`. */
export function followStateOf(entry: TrackerEntry): FollowState {
  if (entry.status === "Done") return "closed";
  return spokeLast(entry) === "them" ? "replied" : "waiting";
}

export const FOLLOW_STATE: Record<FollowState, { label: string; tone: string }> = {
  replied: { label: "They replied", tone: "var(--c-tk-replied)" },
  waiting: { label: "Waiting on them", tone: "var(--c-tk-waiting)" },
  closed: { label: "Closed", tone: "var(--c-tk-done)" },
};

export const isOpen = (entry: TrackerEntry) => entry.status !== "Done";

export const byArchived = (a: TrackerEntry, b: TrackerEntry) => (b.archivedAt ?? b.completedAt ?? b.updatedAt).localeCompare(a.archivedAt ?? a.completedAt ?? a.updatedAt);

/** The amber "needs you" set (GLOSSARY: Needs you) — see `readEntry` in `lib/tracker-rules.ts`. */
export const needsYou = (entry: TrackerEntry, today: string) => readEntry(entry, today).needsYou;

/** The day something started needing you, for longest-waiting-first sorting ("" when undated). */
const neededSince = (entry: TrackerEntry) => neededSinceOf(entry) ?? "";

export const important = (a: TrackerEntry, b: TrackerEntry) => Number(b.pinned) - Number(a.pinned);

export const byRecent = (a: TrackerEntry, b: TrackerEntry) => important(a, b) || b.updatedAt.localeCompare(a.updatedAt);

/** Dated first (soonest first), undated last. */
export const byDue = (a: TrackerEntry, b: TrackerEntry) => important(a, b) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || byRecent(a, b);

/** Longest-waiting first. */
export const byNeed = (a: TrackerEntry, b: TrackerEntry) => important(a, b) || neededSince(a).localeCompare(neededSince(b)) || byRecent(a, b);

export const byCompleted = (a: TrackerEntry, b: TrackerEntry) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt);

export function matches(entry: TrackerEntry, needle: string) {
  if (!needle) return true;
  return [entry.subject, entry.person, entry.ticketKey, ...entry.tags.map((tag) => `#${tag}`), ...entry.updates.map((u) => u.note)].join(" ").toLowerCase().includes(needle);
}

/** "in 3 days", "tomorrow", "today", "2 days late" / "3 days ago". */
export function fromToday(iso: string, today: string, past: "late" | "ago") {
  const days = differenceInCalendarDays(parseISO(iso), parseISO(today));
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days > 1) return `in ${days} days`;
  return `${-days} ${plural(-days, "day")} ${past}`;
}

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

/** A lane (Ocean, 2026-11-01): frosted panel, dot + title + count; warm when something needs you. */
export function Column({ title, count, needs = false, tone, aside, children }: { title: string; count?: number; needs?: boolean; tone?: "overdue" | "upcoming" | "someday"; aside?: React.ReactNode; children: React.ReactNode }) {
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

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 rounded-2xl border-2 border-dashed border-[var(--c-tk-rule)] px-4 py-5 text-md text-text-muted">{children}</p>;
}

/** A small sub-label inside a column ("Thu 15 Oct", "Your turn") over its own rows. */
export function Bucket({ label, needs = false, children }: { label: string; needs?: boolean; children: React.ReactNode }) {
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
export function FinishedGroup({ verb, entries, today, needle, render }: { verb: string; entries: TrackerEntry[]; today: string; needle: string; render: (entry: TrackerEntry) => React.ReactNode }) {
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
export function Row({ muted = false, needs = false, wide = false, highlight = false, eyebrow, leading, title, meta, actions, onOpen }: { muted?: boolean; needs?: boolean; wide?: boolean; highlight?: boolean; eyebrow?: React.ReactNode; leading?: React.ReactNode; title: string; meta?: React.ReactNode; actions?: React.ReactNode; onOpen: () => void }) {
  return (
    <li data-new={highlight || undefined} className="tk-item group mb-2 flex flex-wrap items-center gap-x-5 gap-y-2 px-3 py-3 md:px-4">
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
export function DoneCircle({ entry }: { entry: TrackerEntry }) {
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
export function LatestLine({ entry }: { entry: TrackerEntry }) {
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

// Plain look (mockup, 2026-11-14): small square-cornered buttons in the Tracker's navy ink.
export const PILL = "inline-flex h-10 shrink-0 cursor-pointer items-center rounded-lg border px-4 text-sm font-semibold whitespace-nowrap transition-colors duration-150 disabled:cursor-wait disabled:opacity-60";

export const PILL_INK = "border-[var(--tk-ink)] bg-[var(--tk-ink)] text-white hover:bg-[var(--tk-ink-2)]";

const PILL_LINE = "border-[var(--c-tk-rule)] bg-surface text-text hover:bg-surface-2";

const PILL_SOFT = "border-[var(--c-tk-rule)] bg-surface text-text hover:bg-surface-2";

/** A row's text button that runs one server action. */
export function ActionPill({ ink = false, soft = false, label, action, success }: { ink?: boolean; soft?: boolean; label: string; action: () => Promise<{ ok: boolean; error?: { message: string } }>; success: string }) {
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
export function DeleteEntry({ entry }: { entry: TrackerEntry }) {
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
export function FavouriteToggle({ entry }: { entry: TrackerEntry }) {
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

export function Avatar({ name }: { name: string }) {
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

export const markDone = (entry: TrackerEntry) => () => setFollowUpStatus({ followUpId: entry.id, status: "Done" });

export const markOpen = (entry: TrackerEntry) => () => setFollowUpStatus({ followUpId: entry.id, status: "Open" });

/** "I pinged them" (was "Mark nudged" until 2026-11-17): record that you chased them (append-only), then clear the reminder date. */
function useNudge(entry: TrackerEntry) {
  const { channels } = useContext(ListsContext);
  return async () => {
    return pingFollowUp({ followUpId: entry.id, channel: defaultChannel(channels) });
  };
}

export function NudgePill({ entry, ink }: { entry: TrackerEntry; ink: boolean }) {
  const nudge = useNudge(entry);
  // When due it's the row's main action, but softer than "Done" (Ocean, 2026-11-01).
  return <ActionPill soft={ink} label="I pinged them" action={nudge} success="Noted. It moved to Waiting on them." />;
}

/** Grow a textarea with its text (one line when empty). */
export function fitHeight(field: HTMLTextAreaElement | null) {
  if (!field) return;
  field.style.height = "auto";
  field.style.height = `${field.scrollHeight}px`;
}

/** Enter saves, Shift+Enter starts a new line (not while an IME is composing). */
export function onEnterSave(save: () => void) {
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
export function AddPill({ label, inputId, placeholder, value, onChange, onSubmit, pending, error, tools, panel, below, multiline = false }: {
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
  /** A second field inside the pill, under the main row (Personal's Details). */
  below?: React.ReactNode;
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
              autoComplete="off"
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
      {below}
      {panel}
      {/* Read out, not shown: a visible hint made the add bar taller on Personal (Ocean, 2026-11-01). */}
      {multiline ? <p id={`${inputId}-keys`} className="sr-only">Enter to add · Shift+Enter for a new line</p> : null}
      {error ? <p className="mt-2 px-1 text-base font-medium text-danger" role="alert">{error}</p> : null}
    </form>
  );
}

/** An icon button inside the add pill. `expanded` for panel triggers, `pressed` for toggles. */
export function ToolButton({ label, expanded, pressed, onClick, className, children }: { label: string; expanded?: boolean; pressed?: boolean; onClick: () => void; className?: string; children: React.ReactNode }) {
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
export function PillPanel({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
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
      const target = event.target as Element;
      // MUI portals an Autocomplete's list outside the form (mui-provider.tsx), so a
      // click on a suggested name is not "outside": closing here unmounted the field
      // before the pick landed.
      if (target.closest?.(".MuiPopper-root")) return;
      if (!ref.current?.closest("form")?.contains(target)) onCloseRef.current();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, []);

  // A composer near the bottom of the screen opened its panel below the fold.
  // Open upward instead when there's more room above (measured before paint).
  // Upward, it sits just above the pill that opened it (over the editor), not
  // above the whole card, which would push it under the sticky header.
  const [upBottom, setUpBottom] = useState<number | null>(null);
  useLayoutEffect(() => {
    const box = ref.current;
    const form = box?.parentElement;
    const pill = form?.querySelector<HTMLElement>("[aria-expanded='true']");
    if (!box || !form || !pill) return;
    const formRect = form.getBoundingClientRect();
    const pillTop = pill.getBoundingClientRect().top;
    const below = window.innerHeight - formRect.bottom;
    if (box.offsetHeight + 16 > below && pillTop - 72 > below) setUpBottom(formRect.bottom - pillTop + 8);
  }, []);

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      style={upBottom === null ? undefined : { bottom: upBottom }}
      className={cn("t-dropdown absolute right-0 z-30 flex w-80 max-w-full flex-col gap-4 rounded-xl border border-border bg-surface p-4 shadow-md", upBottom === null ? "top-full mt-2" : "origin-bottom-right")}
    >
      {children}
      <Button size="sm" variant="secondary" className="self-end" onClick={onClose}>Done</Button>
    </div>
  );
}

/** Shared date panel for due / nudge dates. */
export function DatePanel({ id, label, hint, value, min, onChange, onClose }: { id: string; label: string; hint?: string; value: string; min?: string; onChange: (value: string) => void; onClose: () => void }) {
  return (
    <PillPanel label={label} onClose={onClose}>
      <Field label={label} htmlFor={id} hint={hint}>
        <Input id={id} type="date" value={value} min={min} onChange={(event) => onChange(event.target.value)} />
      </Field>
      {value ? <button type="button" onClick={() => onChange("")} className="w-fit cursor-pointer text-sm font-semibold text-accent-text hover:underline">Clear date</button> : null}
    </PillPanel>
  );
}

/** `prefix` says what the date means when it isn't a reminder ("Said: Today"). */
export function DateTool({ label, prefix, value, today, expanded, onClick }: { label: string; prefix?: string; value: string; today: string; expanded: boolean; onClick: () => void }) {
  return (
    <ToolButton label={value ? `${label}: ${dayLabel(value)}` : label} expanded={expanded} onClick={onClick} className={value ? "text-text" : undefined}>
      <CalendarDays className="size-5" strokeWidth={1.8} aria-hidden="true" />
      {value ? <span className="hidden md:inline">{prefix ? <span className="font-normal text-text-muted">{prefix}: </span> : null}{value === today ? "Today" : format(parseISO(value), "d MMM")}</span> : null}
    </ToolButton>
  );
}

export function StarTool({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return (
    <ToolButton label="Mark as favourite" pressed={value} onClick={() => onChange(!value)} className="text-warning hover:text-warning">
      <Star className={cn("size-5", value && "fill-current")} strokeWidth={1.8} aria-hidden="true" />
    </ToolButton>
  );
}

/** Create an entry, then star it if asked. Shared by the three add pills. */
export function useCreate(onSaved: (id: string) => void) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  function create(
    input: { kind: EntryKind; subject: string; person?: string; note?: string; doc?: unknown; channel?: string; dueDate?: string | null; occurredAt?: string | null; fromThem?: boolean; tags?: string[]; personal?: boolean },
    pinned: boolean,
  ) {
    startTransition(async () => {
      const result = await createFollowUp({ ...input, pinned });
      if (!result.ok) {
        const fields = result.error.fields ?? {};
        setError(Object.values(fields)[0] ?? result.error.message);
        return;
      }
      toast.success(input.personal ? "Sticky note added" : `${KIND_LABEL[input.kind]} added`);
      setError(undefined);
      onSaved(result.data.id);
      router.refresh();
    });
  }
  return { create, pending, error, setError };
}

/** An ISO instant as the browser's own calendar day, "YYYY-MM-DD". */
export const localDay = (iso: string) => format(parseISO(iso), "yyyy-MM-dd");

/** A group in the to-do list: a coloured dot, its title and count, an optional hint, then its rows. */
export function ListGroup({ title, tone, count, hint, collapsible = false, open: forceOpen = false, children }: { title: string; tone: "overdue" | "today" | "needs" | "upcoming" | "someday"; count: number; hint?: string; collapsible?: boolean; open?: boolean; children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const open = !collapsible || expanded || forceOpen;
  const id = `tk-grp-${tone}`;
  return (
    <section aria-label={title} className="tk-grp" data-tone={tone}>
      <h2 className="tk-grp-head">
        {collapsible ? (
          <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setExpanded(!expanded)} className="tk-grp-toggle">
            <ChevronRight className={cn("size-4 transition-transform duration-150 motion-reduce:transition-none", open && "rotate-90")} aria-hidden="true" />
            <span className="tk-grp-dot" aria-hidden="true" />{title}<span className="tk-grp-count">{count}</span>
          </button>
        ) : (
          <><span className="tk-grp-dot" aria-hidden="true" />{title}<span className="tk-grp-count">{count}</span></>
        )}
        {hint ? <span className="tk-grp-hint">{hint}</span> : null}
      </h2>
      {open ? <div id={id} className="tk-grp-body">{children}</div> : null}
    </section>
  );
}

/**
 * Focus a popup's first field. The Modal is a native <dialog>: its showModal()
 * runs after the form mounts and moves focus to the Close button, overriding
 * autoFocus. The Modal's effect runs after this child's, so a zero-delay timeout
 * lands after showModal (2026-11-17; a frame callback stalls in background tabs).
 */
export function useFocusInPopup(id: string, inPopup: boolean) {
  useEffect(() => {
    if (!inPopup) return;
    const timer = window.setTimeout(() => document.getElementById(id)?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [id, inPopup]);
}

/** Every tag used on these notes, most used first. */
export function noteTags(entries: TrackerEntry[]) {
  const counts = new Map<string, number>();
  for (const entry of entries) for (const tag of entry.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

"use client";

import { Plus, UserRound } from "lucide-react";
import { useContext, useMemo, useState } from "react";
import { cn } from "@/components/cn";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { UpdateEditor, type EditorValue } from "@/components/tracker/update-editor";
import { nextReminder } from "@/lib/tracker-rules";
import { Avatar, ChannelSelect, DatePanel, DateTool, FinishedGroup, ListGroup, ListsContext, PILL, PILL_INK, PersonAutocomplete, PillPanel, StarTool, ToolButton, type TrackerEntry, byCompleted, byNeed, defaultChannel, followStateOf, important, matches, needsYou, useCreate, useFocusInPopup } from "@/components/tracker/kit";
import { FollowUpRow } from "@/components/tracker/rows";

/**
 * Simpler Tracker (2026-11-17): the list first — Your turn, Time to ping, Waiting on
 * them — and New follow-up opens the form in a popup, like New note (it used to sit
 * beside the list, and above it on phones). "Done" closes; "I pinged them" records a ping.
 */
export function FollowUpQueue({ entries, people, today, needle, onOpen }: { entries: TrackerEntry[]; people: string[]; today: string; needle: string; onOpen: (entry: TrackerEntry) => void }) {
  const [adding, setAdding] = useState(false);
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
    // Not due yet: soonest reminder first, then whoever has waited longest.
    next.waiting.sort((a, b) => important(a, b) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.updatedAt.localeCompare(b.updatedAt));
    next.closed.sort(byCompleted);
    return next;
  }, [entries, today, needle]);

  const row = (entry: TrackerEntry) => <FollowUpRow key={entry.id} entry={entry} today={today} inGroup onOpen={() => onOpen(entry)} />;
  const open = groups.replied.length + groups.due.length + groups.waiting.length;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex justify-end">
        <button type="button" onClick={() => setAdding(true)} className={cn(PILL, PILL_INK, "gap-2")}>
          <Plus className="size-4.5" strokeWidth={2.4} aria-hidden="true" />
          New follow-up
        </button>
      </div>
      {/* The same white list card as To-do (2026-11-17; was the older tinted lane). */}
      <div className="tk-list">
        {groups.replied.length ? <ListGroup title="Your turn" tone="today" count={groups.replied.length} hint="They replied — answer or press Done"><ol>{groups.replied.map(row)}</ol></ListGroup> : null}
        {groups.due.length ? <ListGroup title="Time to ping" tone="needs" count={groups.due.length} hint="No reply by the reminder date"><ol>{groups.due.map(row)}</ol></ListGroup> : null}
        {groups.waiting.length ? <ListGroup title="Waiting on them" tone="upcoming" count={groups.waiting.length}><ol>{groups.waiting.map(row)}</ol></ListGroup> : null}
        {open === 0 ? <p className="tk-list-empty">{needle ? "Nothing matches." : "Nothing open. Press New follow-up to start one."}</p> : null}
        {groups.closed.length ? <div className="tk-grp px-4 pb-3"><FinishedGroup verb="closed" entries={groups.closed} today={today} needle={needle} render={row} /></div> : null}
      </div>
      {adding ? (
        <Modal open size="lg" onClose={() => setAdding(false)} title="New follow-up">
          <AddFollowUp people={people} today={today} onSaved={() => setAdding(false)} />
        </Modal>
      ) : null}
    </div>
  );
}

/**
 * What a new follow-up records (2026-11-17: two types, were General / Waiting on /
 * I told / They told me). "Waiting on" carries a reminder date. "Log a chat" uses
 * the date as when you talked, and "They spoke last" records the first message as
 * theirs (`fromThem`), so it opens in Your turn — what "They told me" did. Saved
 * fields are unchanged, so older follow-ups read the same.
 */
const FOLLOW_MODES = {
  waiting: { label: "Waiting on", subject: "What are you waiting on?", body: "What you sent them (optional)…", who: "Who are you waiting on?", whoTool: (p: string) => `Waiting on ${p}`, submit: "Add follow-up", datePrefix: "", date: "Remind me on", dateHint: "The day WorkNest reminds you to ping them again if they haven't replied." },
  chat: { label: "Log a chat", subject: "What was it about?", body: "Notes (optional)…", who: "Who was it with?", whoTool: (p: string) => `With ${p}`, submit: "Save", datePrefix: "On", date: "Talked on", dateHint: "When the conversation happened. Past dates are fine." },
} as const;

type FollowMode = keyof typeof FOLLOW_MODES;

/**
 * The date a new follow-up starts with. Waiting: a reminder two working days
 * out, so it doesn't land in Needs you the moment it's saved (it used to default
 * to today, 2026-11-21). A chat: the day you talked, today.
 */
function defaultFollowDate(mode: FollowMode, today: string) {
  return mode === "waiting" ? nextReminder(today) : today;
}

/** The New follow-up popup: type, then the same card as New note — subject, first message, then who / when / star. */
function AddFollowUp({ people, today, onSaved }: { people: string[]; today: string; onSaved?: () => void }) {
  const { channels } = useContext(ListsContext);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState<EditorValue>({ doc: null, text: "", hasContent: false });
  // Remounting the editor (new key) is how it clears after a save.
  const [editorKey, setEditorKey] = useState(0);
  const [person, setPerson] = useState("");
  const [channel, setChannel] = useState(defaultChannel(channels));
  const [date, setDate] = useState(today);
  const [pinned, setPinned] = useState(false);
  // Log a chat first, as General was (owner, 2026-11-11).
  const [mode, setMode] = useState<FollowMode>("chat");
  const [theySpokeLast, setTheySpokeLast] = useState(false);
  const copy = FOLLOW_MODES[mode];
  const [panel, setPanel] = useState<"who" | "date" | null>(null);
  useFocusInPopup("add-follow-up", Boolean(onSaved));
  const { create, pending, error, setError } = useCreate(() => {
    setSubject(""); setBody({ doc: null, text: "", hasContent: false }); setEditorKey((key) => key + 1);
    setPerson(""); setDate(defaultFollowDate(mode, today)); setPinned(false); setPanel(null); setTheySpokeLast(false);
    onSaved?.();
  });

  function save() {
    if (pending) return;
    if (!subject.trim()) { setError("Write what it is about first"); document.getElementById("add-follow-up")?.focus(); return; }
    if (!person.trim()) { setError(copy.who); setPanel("who"); return; }
    const waiting = mode === "waiting";
    if (waiting && date && date < today) { setError("Pick a reminder date from today on"); setPanel("date"); return; }
    create(
      {
        kind: "FollowUp",
        person: person.trim(),
        subject: subject.trim().slice(0, 300),
        // The first message is a real record row, so "you wrote 3d ago via Slack"
        // comes from the same place as every later nudge. No message → the subject.
        ...(body.hasContent ? { doc: body.doc, note: body.text } : { note: subject.trim() }),
        channel,
        // Waiting: the date is the reminder. A chat: it is when you talked.
        dueDate: waiting ? date || null : null,
        occurredAt: waiting ? null : date || null,
        fromThem: mode === "chat" && theySpokeLast,
      },
      pinned,
    );
  }

  return (
    <form aria-label="Add a follow-up" onSubmit={(event) => { event.preventDefault(); save(); }} className={cn("relative", onSaved && "tk-inline-panels")}>
      <div role="radiogroup" aria-label="Follow-up type" className="mb-3 flex w-fit gap-1 rounded-full border border-border bg-surface p-0.5">
        {(Object.keys(FOLLOW_MODES) as FollowMode[]).map((key) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={mode === key}
            onClick={() => { setMode(key); setDate(defaultFollowDate(key, today)); setError(undefined); }}
            className={cn(
              "inline-flex h-9 cursor-pointer items-center rounded-full px-4 text-sm font-semibold transition-colors duration-150",
              mode === key ? "bg-sidebar text-sidebar-fg" : "text-text-muted hover:text-text",
            )}
          >
            {FOLLOW_MODES[key].label}
          </button>
        ))}
      </div>
      <div className="tk-field flex flex-col rounded-2xl border border-border-strong bg-surface">
        <label htmlFor="add-follow-up" className="sr-only">{copy.subject}</label>
        <input
          id="add-follow-up"
          autoComplete="off"
          value={subject}
          maxLength={300}
          placeholder={copy.subject}
          aria-invalid={error ? true : undefined}
          onChange={(event) => { setSubject(event.target.value); setError(undefined); }}
          className="min-w-0 border-b border-border bg-transparent px-5 pt-4 pb-3 text-lg font-semibold text-text outline-none placeholder:font-medium placeholder:text-text-muted"
        />
        <UpdateEditor key={editorKey} id="add-follow-up-body" label="First message" placeholder={`${copy.body} paste formatted text, images or files`} minHeight="min-h-32" onChange={setBody} onSubmit={save} />
        <div className="flex flex-wrap items-center gap-1 border-t border-border py-1.5 pr-1.5 pl-2">
          <ToolButton label={person ? copy.whoTool(person) : copy.who} expanded={panel === "who"} onClick={() => setPanel(panel === "who" ? null : "who")} className={person ? "text-text" : undefined}>
            {person ? <Avatar name={person} /> : <UserRound className="size-5" strokeWidth={1.8} aria-hidden="true" />}
            {person ? <span className="max-w-32 truncate">{person}</span> : null}
          </ToolButton>
          <DateTool label={copy.date} prefix={copy.datePrefix} value={date} today={today} expanded={panel === "date"} onClick={() => setPanel(panel === "date" ? null : "date")} />
          <StarTool value={pinned} onChange={setPinned} />
          {mode === "chat" ? (
            <label className="inline-flex h-11 cursor-pointer items-center gap-2 px-2 text-sm font-medium text-text">
              <input type="checkbox" checked={theySpokeLast} onChange={(event) => setTheySpokeLast(event.target.checked)} className="size-4 accent-[var(--tk-ink)]" />
              They spoke last
            </label>
          ) : null}
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
          min={mode === "waiting" ? today : undefined}
          onChange={setDate}
          onClose={() => setPanel(null)}
        />
      ) : null}
      {error ? <p className="mt-2 px-1 text-base font-medium text-danger" role="alert">{error}</p> : null}
    </form>
  );
}

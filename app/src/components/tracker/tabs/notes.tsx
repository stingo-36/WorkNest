"use client";

import { Hash, Plus } from "lucide-react";
import { useContext, useMemo, useState } from "react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { cn } from "@/components/cn";
import { SearchPill } from "@/components/shell/page-head";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { TagInput } from "@/components/ui/tag-input";
import { UpdateEditor, type EditorValue } from "@/components/tracker/update-editor";
import { tagChipClass, tagChipStyle } from "@/components/ui/tag-chip";
import { ActionPill, DatePanel, DateTool, Empty, FavouriteToggle, FinishedGroup, ListsContext, MOM_TAG, NOTE_TYPES, type NoteType, PILL, PILL_INK, PersonAutocomplete, PillPanel, StarTool, ToolButton, type TrackerEntry, byCompleted, byRecent, isMom, isOpen, localDay, markOpen, matches, momTitle, noteTags, useCreate, useFocusInPopup } from "@/components/tracker/kit";

/** Used tags first (most used first), then saved-but-unused ones from Profile. */
export function mergeTags(used: string[], saved: string[]) {
  return [...used, ...saved.filter((tag) => !used.includes(tag))];
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
export function NoteQueue({ entries, suggestions, today, needle, onOpen }: { entries: TrackerEntry[]; suggestions: string[]; today: string; needle: string; onOpen: (entry: TrackerEntry) => void }) {
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
  const { people } = useContext(ListsContext);
  const [noteType, setNoteType] = useState<NoteType>("other");
  const [person, setPerson] = useState("");
  const mom = noteType === "mom";
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState<EditorValue>({ doc: null, text: "", hasContent: false });
  // Remounting the editor (new key) is how it clears after a save.
  const [editorKey, setEditorKey] = useState(0);
  const [date, setDate] = useState(today);
  const [tags, setTags] = useState<string[]>([]);
  const [pinned, setPinned] = useState(false);
  const [panel, setPanel] = useState<"tags" | "date" | null>(null);
  useFocusInPopup("add-note", Boolean(onSaved));
  const { create, pending, error, setError } = useCreate(() => {
    setSubject(""); setBody({ doc: null, text: "", hasContent: false }); setEditorKey((key) => key + 1);
    setDate(today); setTags([]); setPinned(false); setPanel(null); setPerson("");
    onSaved?.();
  });

  function save() {
    if (pending) return;
    if (mom && !person.trim()) { setError("Who was the meeting with?"); document.getElementById("add-note-person")?.focus(); return; }
    if (mom && !date) { setError("Pick the meeting date"); document.getElementById("add-note-day")?.focus(); return; }
    // A MoM without a title gets "Meeting with Ashwini on 4 Nov 2026".
    const title = subject.trim() || (mom ? momTitle(person.trim(), date) : "");
    if (!title) { setError("Give the note a title"); document.getElementById("add-note")?.focus(); return; }
    create(
      {
        kind: "Note",
        subject: title.slice(0, 300),
        ...(mom ? { person: person.trim() } : {}),
        ...(body.hasContent ? { doc: body.doc, note: body.text } : {}),
        channel: "Other",
        // The note's date: now when it's today, else midday of the chosen day (no timezone drift).
        occurredAt: date && date !== today ? new Date(`${date}T12:00:00`).toISOString() : null,
        tags: mom ? [MOM_TAG, ...tags.filter((tag) => tag !== MOM_TAG)] : tags,
      },
      pinned,
    );
  }

  return (
    <form aria-label="Add a note" onSubmit={(event) => { event.preventDefault(); save(); }} className={cn("relative", onSaved && "tk-inline-panels")}>
      <div className="mb-4 grid gap-4 md:grid-cols-[14rem_11rem_minmax(0,1fr)]">
        <Field label="Type" htmlFor="add-note-type">
          <Select id="add-note-type" value={noteType} onChange={(event) => { setNoteType(event.target.value as NoteType); setError(undefined); }}>
            {NOTE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </Select>
        </Field>
        {mom ? (
          <>
            <Field label="Meeting date" htmlFor="add-note-day" required>
              <Input id="add-note-day" type="date" value={date} max={today} onChange={(event) => { setDate(event.target.value); setError(undefined); }} />
            </Field>
            <Field label="With" htmlFor="add-note-person" required>
              <PersonAutocomplete id="add-note-person" value={person} options={people} onChange={(next) => { setPerson(next); setError(undefined); }} />
            </Field>
          </>
        ) : null}
      </div>
      <div className="tk-field flex flex-col rounded-2xl border border-border-strong bg-surface">
        <label htmlFor="add-note" className="sr-only">Note title</label>
        <input
          id="add-note"
          autoComplete="off"
          value={subject}
          maxLength={300}
          placeholder={mom ? (person.trim() && date ? momTitle(person.trim(), date) : "Title (optional) — filled in from who and when") : "Note title"}
          aria-invalid={error ? true : undefined}
          onChange={(event) => { setSubject(event.target.value); setError(undefined); }}
          className="min-w-0 border-b border-border bg-transparent px-5 pt-4 pb-3 text-lg font-semibold text-text outline-none placeholder:font-medium placeholder:text-text-muted"
        />
        <UpdateEditor key={editorKey} id="add-note-body" label={mom ? "Minutes" : "Note"} placeholder={mom ? "Attendees, discussion, decisions, action items… paste formatted text, images or files" : "Write the note… paste formatted text, images or files"} minHeight="min-h-40" onChange={setBody} onSubmit={save} />
        <div className="flex flex-wrap items-center gap-1 border-t border-border py-1.5 pr-1.5 pl-2">
          {mom ? null : <DateTool label="Note date" value={date} today={today} expanded={panel === "date"} onClick={() => setPanel(panel === "date" ? null : "date")} />}
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
          {isMom(entry) ? <span>{entry.person ? `With ${entry.person} · ` : ""}{format(parseISO(entry.createdAt), "d MMM yyyy")}</span> : null}
          <span suppressHydrationWarning>{archived ? `Archived ${noteWhen(entry.completedAt ?? entry.updatedAt, today)}` : noteWhen(entry.updatedAt, today)}</span>
        </div>
      </div>
      {archived ? <ActionPill label="Restore" action={markOpen(entry)} success="Restored" /> : <FavouriteToggle entry={entry} />}
    </li>
  );
}

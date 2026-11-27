"use client";

import { Archive, ArchiveRestore, Pencil, Check, ChevronDown, ChevronRight, History, MessageSquareReply, Plus, RotateCcw, Send, Star, Trash2 } from "lucide-react";
import { useContext, useRef, useState, useTransition } from "react";
import { format, parseISO } from "date-fns";
import { addFollowUpUpdate, editFollowUpUpdate, editPersonalTodo, listUpdateRevisions, setNotePerson, deleteFollowUp, rescheduleFollowUp, setFollowUpAdded, setFollowUpArchived, setFollowUpPinned, setFollowUpStatus, setFollowUpTags } from "@/actions/follow-ups";
import { cn } from "@/components/cn";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Field, FormError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TagInput } from "@/components/ui/tag-input";
import { Textarea } from "@/components/ui/textarea";
import { FormattedNote } from "@/components/tracker/note-text";
import { UpdateDoc, UpdateEditor, type EditorValue } from "@/components/tracker/update-editor";
import type { JSONContent } from "@tiptap/core";
import { isStatusNote, TODO_STATUS_NOTES } from "@/lib/rich-text";
import { tagChipClass, tagChipStyle } from "@/components/ui/tag-chip";
import { ChannelSelect, FOLLOW_STATE, ListsContext, MOM_TAG, NOTE_TYPES, STICKY_TITLE_MAX_LENGTH, PersonAutocomplete, type TrackerEntry, defaultChannel, entryLabel, followStateOf, isMom, localDay, splitSticky, todayIso, tone, useRun } from "@/components/tracker/kit";

export function EntryEyebrow({ entry }: { entry: TrackerEntry }) {
  const hasTitle = !entry.personal || Boolean(splitSticky(entry.subject).title);
  if (!hasTitle && !entry.pinned) return null;
  return (
    <span className="flex items-center gap-1.5">
      {hasTitle ? entryLabel(entry) : null}
      {entry.pinned ? <>{hasTitle ? <span aria-hidden="true">·</span> : null}<Star className="size-3.5 fill-current text-warning" aria-hidden="true" />Favourite</> : null}
    </span>
  );
}

export function EntryTitle({ entry }: { entry: TrackerEntry }) {
  const title = entry.personal ? splitSticky(entry.subject).title || entryLabel(entry) : entry.subject;
  return <span className={cn("[overflow-wrap:anywhere]", entry.status === "Done" && entry.kind !== "Note" && "text-text-muted line-through")}>{title}</span>;
}

/** Facts, date, actions, add-an-update and the history — the opened entry's dialog. */
export function EntryBody({ entry, tagSuggestions, onDeleted }: { entry: TrackerEntry; tagSuggestions: string[]; onDeleted: () => void }) {
  if (entry.kind === "Note") return <NoteBody entry={entry} tagSuggestions={tagSuggestions} onDeleted={onDeleted} />;
  return <TrackedEntryBody entry={entry} onDeleted={onDeleted} />;
}

/** A to-do or follow-up, with an inline timeline for personal to-dos. */
function TrackedEntryBody({ entry, onDeleted }: { entry: TrackerEntry; onDeleted: () => void }) {
  const { run, pending } = useRun();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [editingTodo, setEditingTodo] = useState(false);
  const editTodoButton = useRef<HTMLButtonElement>(null);
  const isDone = entry.status === "Done";
  const kind = entry.kind;
  const state = kind === "FollowUp" ? followStateOf(entry) : null;

  const doneLabel = kind === "Note" ? (isDone ? "Restore" : "Archive") : kind === "FollowUp" ? (isDone ? "Reopen" : "Done") : isDone ? "Reopen" : "Mark done";
  const doneToast = kind === "Note" ? (isDone ? "Restored" : "Archived") : isDone ? "Reopened" : kind === "FollowUp" ? "Closed" : "Done";

  // Notes archive through their main button (status); to-dos and follow-ups have their own.
  const canArchive = kind !== "Note";
  const shelved = entry.archivedAt !== null;

  const facts: Array<{ label: string; value: React.ReactNode }> = [
    ...(entry.person && kind !== "Note" ? [{ label: "With", value: entry.person }] : []),
    ...(state ? [{ label: "Status", value: <span style={tone(FOLLOW_STATE[state].tone)} className="font-semibold text-[color-mix(in_srgb,var(--tone)_80%,var(--c-text))]">{FOLLOW_STATE[state].label}</span> }] : []),
    ...(kind === "Task" ? [{ label: "Status", value: isDone ? `Done${entry.completedAt ? ` · ${format(parseISO(entry.completedAt), "d MMM")}` : ""}` : "Open" }] : []),
    ...(entry.ticketKey ? [{ label: "Ticket", value: <span className="font-mono">{entry.ticketKey}</span> }] : []),
    ...(entry.archivedAt ? [{ label: "Archived", value: format(parseISO(entry.archivedAt), "d MMM yyyy") }] : []),
  ];

  const details = (
    <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
      {facts.length ? <dl className="flex flex-wrap gap-x-8 gap-y-4">
        {facts.map((fact) => (
          <div key={fact.label} className="min-w-0">
            <dt className="text-xs text-text-subtle">{fact.label}</dt>
            <dd className="mt-1 flex h-11 items-center text-sm font-medium text-text">{fact.value}</dd>
          </div>
        ))}
      </dl> : null}
      <div className="min-w-0">
        <label htmlFor={`added-${entry.id}`} className="block text-xs text-text-subtle">Added</label>
        <Input
          id={`added-${entry.id}`}
          type="date"
          value={localDay(entry.createdAt)}
          max={todayIso()}
          required
          className="mt-1 h-11 w-44"
          onChange={(event) => {
            const day = event.target.value;
            if (!day || day === localDay(entry.createdAt)) return;
            // Keep the old time of day; only the calendar day moves.
            const old = parseISO(entry.createdAt);
            const next = parseISO(`${day}T${format(old, "HH:mm:ss")}`);
            run(() => setFollowUpAdded({ followUpId: entry.id, createdAt: next.toISOString() }), "Date changed");
          }}
        />
      </div>
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
  );

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      {entry.personal ? (
        <>
          <Button size="sm" variant="ghost" aria-expanded={detailsOpen} aria-controls={`todo-details-${entry.id}`} onClick={() => setDetailsOpen(!detailsOpen)}>
            Details<ChevronDown aria-hidden="true" className={cn("motion-safe:transition-transform", detailsOpen && "rotate-180")} />
          </Button>
          <Button ref={editTodoButton} size="sm" variant="secondary" aria-disabled={editingTodo} aria-expanded={editingTodo} aria-controls={`todo-editor-${entry.id}`} onClick={() => setEditingTodo(true)}>
            <Pencil aria-hidden="true" />Edit
          </Button>
          <Button size="sm" variant="secondary" aria-expanded={addingNote} aria-controls={`todo-composer-${entry.id}`} onClick={() => setAddingNote(!addingNote)}>
            {addingNote ? "Cancel note" : <><Plus aria-hidden="true" />Add a note</>}
          </Button>
        </>
      ) : null}
      <Button size="sm" variant={isDone ? "secondary" : "primary"} onClick={() => run(() => setFollowUpStatus({ followUpId: entry.id, status: isDone ? "Open" : "Done" }), doneToast)}>
        {isDone ? <RotateCcw aria-hidden="true" /> : <Check aria-hidden="true" />}
        {doneLabel}
      </Button>
      {/* Labelled since 2026-11-17 (simplification phase 4): an unlabelled box icon read as nothing. Notes archive through the button above. */}
      {canArchive ? (
        <Button size="sm" variant="secondary" onClick={() => run(() => setFollowUpArchived({ followUpId: entry.id, archived: !shelved }), shelved ? "Restored" : "Archived. Find it on the Archived tab.")}>
          {shelved ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
          {shelved ? "Restore" : "Archive"}
        </Button>
      ) : null}
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
  );

  const body = entry.personal ? splitSticky(entry.subject).body : "";
  return (
    <div className={cn("min-w-0", pending && "opacity-60")}>
      {entry.personal ? (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border pb-4">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-muted">
              <span className="font-semibold text-text">{isDone ? "Done" : "Open"}</span>
              <span aria-hidden="true">·</span>
              <time dateTime={entry.createdAt}>{format(parseISO(entry.createdAt), "EEE d MMM yyyy")}</time>
              {entry.dueDate && !isDone ? <span>· Due {format(parseISO(entry.dueDate), "d MMM yyyy")}</span> : null}
              {shelved ? <span>· Archived</span> : null}
            </p>
            {actions}
          </div>
          <div id={`todo-details-${entry.id}`} hidden={!detailsOpen} className="rounded-xl border border-border bg-surface-2 p-4">
            {details}
          </div>
          <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-5">
            <div id={`todo-editor-${entry.id}`} hidden={!editingTodo}>
              {editingTodo ? (
                <PersonalTodoEditor entry={entry} onDone={() => {
                  setEditingTodo(false);
                  editTodoButton.current?.focus();
                }} />
              ) : null}
            </div>
            {!editingTodo && body ? <p className="text-md leading-7 whitespace-pre-wrap text-text [overflow-wrap:anywhere]">{body}</p> : null}
            <div id={`todo-composer-${entry.id}`} hidden={!addingNote}>
              {addingNote ? <AddUpdateForm key={entry.updates.length} entry={entry} autoFocus /> : null}
            </div>
            <Timeline entry={entry} className={body || editingTodo || addingNote ? "border-t border-border pt-5" : undefined} />
          </div>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 md:gap-8">
          <div className="flex min-w-0 flex-col gap-6">
            {details}
            {actions}
            <AddUpdateForm key={entry.updates.length} entry={entry} />
          </div>
          <Timeline entry={entry} className="border-t border-border pt-5 md:border-t-0 md:border-l md:pt-0 md:pl-8" />
        </div>
      )}

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

/** Edit the Personal to-do's original text in the reading column. */
function PersonalTodoEditor({ entry, onDone }: { entry: TrackerEntry; onDone: () => void }) {
  const { run, pending } = useRun();
  const initial = splitSticky(entry.subject);
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const hasTitle = Boolean(initial.title);
  const subject = [title.trim(), body.trim()].filter(Boolean).join("\n");
  const tooLong = subject.length > 1000;
  const canSave = Boolean(subject) && !tooLong && (!hasTitle || Boolean(title.trim()));
  const titleId = `todo-title-${entry.id}`;
  const bodyId = `todo-body-${entry.id}`;

  return (
    <form aria-label="Edit personal to-do" className="flex min-w-0 flex-col gap-4" onSubmit={(event) => {
      event.preventDefault();
      if (pending || !canSave) return;
      if (title === initial.title && body === initial.body) { onDone(); return; }
      run(() => editPersonalTodo({ followUpId: entry.id, subject }), "Saved", onDone);
    }}>
      <Field label={hasTitle ? "Title" : "Title (optional)"} htmlFor={titleId} required={hasTitle}>
        <Input id={titleId} value={title} maxLength={STICKY_TITLE_MAX_LENGTH} autoFocus={hasTitle} required={hasTitle} disabled={pending} onChange={(event) => setTitle(event.target.value)} />
      </Field>
      <Field label="Details (optional)" htmlFor={bodyId}>
        <Textarea id={bodyId} value={body} autoFocus={!hasTitle} disabled={pending} onChange={(event) => setBody(event.target.value)} />
      </Field>
      {tooLong ? <FormError>Use 1,000 characters or fewer for the title and details combined.</FormError> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="ghost" disabled={pending} onClick={onDone}>Cancel</Button>
        <Button size="sm" type="submit" loading={pending} disabled={!canSave}>Save</Button>
      </div>
    </form>
  );
}

/** Tags are labels, not history: edited in place, saved on every change. */
function NoteTagsEditor({ entry, suggestions }: { entry: TrackerEntry; suggestions: string[] }) {
  const { run } = useRun();
  // `mom` is the note's type (the Type dropdown), not a tag you edit here.
  const keep = isMom(entry) ? [MOM_TAG] : [];
  // Local copy so chips update instantly; the server copy catches up on refresh.
  const [tags, setTags] = useState(entry.tags.filter((tag) => !keep.includes(tag)));
  return (
    <Field label="Tags" htmlFor={`tags-${entry.id}`}>
      <TagInput
        id={`tags-${entry.id}`}
        value={tags}
        suggestions={suggestions.filter((tag) => !keep.includes(tag))}
        placeholder="Add a tag"
        onChange={(next) => {
          setTags(next);
          run(() => setFollowUpTags({ followUpId: entry.id, tags: [...keep, ...next.filter((tag) => !keep.includes(tag))] }));
        }}
      />
    </Field>
  );
}

/**
 * Appends to the record. A follow-up picks who spoke — you, or them — so the
 * board knows whether it's still waiting. Earlier rows are edited in the Timeline.
 */
function AddUpdateForm({ entry, autoFocus }: { entry: TrackerEntry; autoFocus?: boolean }) {
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
        <UpdateEditor boxed autoFocus={autoFocus} id={`note-${entry.id}`} label={label} placeholder="Write, or paste formatted text, images or files" minHeight={entry.kind === "Note" ? "min-h-44" : "min-h-28"} onChange={setValue} onSubmit={save} />
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

/**
 * The opened note as one readable page (owner, 2026-11-21 — the two-column window
 * left the text squeezed into a scrolling half beside an empty add box).
 * A toolbar (summary · Details · Edit / Add · Archive · ★ · delete), an optional
 * Details panel (type, date, with, tags), then the text full width. A MoM is one
 * body edited in place; an Other note is its entries oldest-first, each with a
 * pencil, and "Add to note" opens an editor at the end.
 */
function NoteBody({ entry, tagSuggestions, onDeleted }: { entry: TrackerEntry; tagSuggestions: string[]; onDeleted: () => void }) {
  const { run, pending } = useRun();
  const mom = isMom(entry);
  const isDone = entry.status === "Done";
  const [details, setDetails] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Which entry is open in the editor: an update id, or null (reading).
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditorValue>({ doc: null, text: "", hasContent: false });
  const entries = [...entry.updates].reverse();
  const empty = entries.length === 0;
  // A note is ONE document (owner, 2026-11-25): its first entry, edited in place
  // with every earlier version kept as a revision. Older notes that had text
  // appended ("Add to note", retired) show those extra entries below it.
  const main = entries[0] ?? null;
  const appended = entries.slice(1);
  const tags = entry.tags.filter((tag) => !(mom && tag === MOM_TAG));

  function addEntry() {
    if (!draft.hasContent || pending) return;
    run(
      () => addFollowUpUpdate({ followUpId: entry.id, note: draft.text, doc: draft.doc, channel: "Other", fromThem: false }),
      mom ? "Minutes saved" : "Saved",
      () => setDraft({ doc: null, text: "", hasContent: false }),
    );
  }

  const summary = [
    mom ? "Minutes of meeting" : "Note",
    ...(mom && entry.person ? [`With ${entry.person}`] : []),
    format(parseISO(entry.createdAt), "EEE d MMM yyyy"),
    ...(entry.archivedAt || isDone ? ["Archived"] : []),
  ];

  return (
    <div className={cn("flex min-w-0 flex-col gap-5", pending && "opacity-60")}>
      {/* Toolbar: what it is on the left, what you can do on the right. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border pb-4">
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-muted">
          {summary.map((part, index) => (
            <span key={part} className={cn(index === 0 && "font-semibold text-text")}>{index > 0 ? <span aria-hidden="true" className="mr-2">·</span> : null}{part}</span>
          ))}
          {tags.map((tag) => <span key={tag} style={tagChipStyle(tag)} className={cn(tagChipClass, "rounded-md bg-[color-mix(in_srgb,var(--tag)_14%,transparent)] px-1.5 py-0.5")}>#{tag}</span>)}
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="ghost" aria-expanded={details} aria-controls={`note-details-${entry.id}`} onClick={() => setDetails(!details)}>
            Details<ChevronDown aria-hidden="true" className={cn("transition-transform duration-150", details && "rotate-180")} />
          </Button>
          {editing === null && main && !isStatusNote(main) ? (
            <Button size="sm" variant="secondary" onClick={() => setEditing(main.id)}><Pencil aria-hidden="true" />Edit</Button>
          ) : null}
          <Button size="sm" variant="secondary" onClick={() => run(() => setFollowUpStatus({ followUpId: entry.id, status: isDone ? "Open" : "Done" }), isDone ? "Restored" : "Archived")}>
            {isDone ? <RotateCcw aria-hidden="true" /> : <Archive aria-hidden="true" />}
            {isDone ? "Restore" : "Archive"}
          </Button>
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

      {details ? (
        <div id={`note-details-${entry.id}`} className="grid gap-4 rounded-xl border border-border bg-surface-2 p-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <NoteTypeFields entry={entry} />
          <NoteDateField entry={entry} label={mom ? "Meeting date" : "Date"} />
          <div className="md:col-span-2">
            <NoteTagsEditor key={mom ? "mom" : "other"} entry={entry} suggestions={tagSuggestions} />
          </div>
        </div>
      ) : null}

      {/* The text, full width at a readable measure. */}
      <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col">
        {empty ? (
          <div className="flex flex-col gap-3">
            <UpdateEditor
              boxed
              autoFocus
              id={`note-add-${entry.id}`}
              label={mom ? "Minutes" : "Write the note"}
              placeholder={mom ? "Attendees, discussion, decisions, action items…" : "Write, or paste formatted text, images or files"}
              minHeight="min-h-[40dvh]"
              onChange={setDraft}
              onSubmit={addEntry}
            />
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="mr-auto text-sm text-text-muted">⌘/Ctrl + Enter saves. Images and files up to 4 MB.</span>
              <Button size="sm" onClick={addEntry} loading={pending} disabled={!draft.hasContent}>{mom ? "Save minutes" : "Save"}</Button>
            </div>
          </div>
        ) : null}

        {main ? (
          <section aria-label="Note" className="min-w-0">
            <NoteEntryText update={main} editing={editing === main.id} onDone={() => setEditing(null)} />
            {editing !== main.id ? <RevisionHistory update={main} /> : null}
          </section>
        ) : null}

        {appended.map((update) => (
          <section key={update.id} aria-label={`Added ${format(parseISO(update.occurredAt), "d MMM yyyy")}`} className="group/entry mt-6 min-w-0 border-t border-border pt-6">
            <div className="mb-2 flex items-center gap-2 text-xs text-text-subtle">
              <span>Added <time dateTime={update.occurredAt}>{format(parseISO(update.occurredAt), "EEE d MMM yyyy, HH:mm")}</time></span>
              {editing !== update.id && !isStatusNote(update) ? (
                <button type="button" onClick={() => setEditing(update.id)} aria-label="Edit this part" title="Edit" className="ml-auto grid size-8 cursor-pointer place-items-center rounded-full text-text-subtle transition-colors duration-150 hover:bg-surface-2 hover:text-text">
                  <Pencil className="size-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <NoteEntryText update={update} editing={editing === update.id} onDone={() => setEditing(null)} />
            {editing !== update.id ? <RevisionHistory update={update} /> : null}
          </section>
        ))}
      </div>

      <ConfirmationDialog
        open={confirmDelete}
        title={`Delete “${entry.subject}”?`}
        description="This removes the note and everything in it. It can't be undone."
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

/** One entry of a note: its text, or the editor when it's being edited. */
function NoteEntryText({ update, editing, onDone }: { update: TrackerEntry["updates"][number]; editing: boolean; onDone: () => void }) {
  if (editing) return <EditUpdateForm update={update} minHeight="min-h-[50dvh]" onDone={onDone} />;
  return update.doc ? <UpdateDoc doc={update.doc} className="text-md" /> : <FormattedNote text={update.note} className="text-md leading-7 text-text" />;
}

type Revision = { id: string; note: string; doc: unknown; createdAt: string };

/**
 * "Edited … · N revisions": every version an edit replaced, newest first,
 * fetched only when opened. Read-only — history is never rewritten.
 */
function RevisionHistory({ update }: { update: TrackerEntry["updates"][number] }) {
  const count = update.revisionCount ?? 0;
  const [open, setOpen] = useState(false);
  // Cached with the count it was loaded at: a later edit adds a revision, and a
  // stale list is simply ignored (and refetched on the next open).
  const [loaded, setLoaded] = useState<{ count: number; list: Revision[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const listId = `revisions-${update.id}`;
  const revisions = loaded && loaded.count === count ? loaded.list : null;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (!next || revisions !== null) return;
    startLoading(async () => {
      const result = await listUpdateRevisions({ updateId: update.id });
      if (result.ok) {
        setLoaded({ count, list: result.data });
        setError(null);
      } else setError(result.error.message);
    });
  }

  if (!update.editedAt && count === 0) return null;

  return (
    <div className="mt-5 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-subtle">
        {update.editedAt ? <span>Edited {format(parseISO(update.editedAt), "EEE d MMM yyyy, HH:mm")}</span> : null}
        {count > 0 ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            onClick={toggle}
            className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full px-2 font-medium text-text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-text"
          >
            <History className="size-3.5" aria-hidden="true" />
            {count} revision{count === 1 ? "" : "s"}
            <ChevronDown className={cn("size-3.5 transition-transform duration-150", open && "rotate-180")} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {open ? (
        <div id={listId} className="mt-3 flex flex-col gap-3">
          {loading && revisions === null ? <p className="text-sm text-text-muted">Loading revisions…</p> : null}
          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          {revisions?.map((revision, index) => (
            <details key={revision.id} className="group/rev rounded-xl border border-border bg-surface-2">
              <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm text-text-muted hover:text-text">
                <ChevronRight className="size-4 shrink-0 transition-transform duration-150 group-open/rev:rotate-90" aria-hidden="true" />
                <span className="font-medium text-text">Version {count - index}</span>
                <span>· replaced {format(parseISO(revision.createdAt), "EEE d MMM yyyy, HH:mm")}</span>
              </summary>
              <div className="border-t border-border bg-surface px-4 py-3">
                {revision.doc ? <UpdateDoc doc={revision.doc} className="text-md" /> : <FormattedNote text={revision.note} className="text-md leading-7 text-text" />}
              </div>
            </details>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** A note's date ("Added", or a MoM's "Meeting date"): moves the day, keeps the time. */
function NoteDateField({ entry, label }: { entry: TrackerEntry; label: string }) {
  const { run } = useRun();
  return (
    <Field label={label} htmlFor={`added-${entry.id}`}>
      <Input
        id={`added-${entry.id}`}
        type="date"
        value={localDay(entry.createdAt)}
        max={todayIso()}
        required
        onChange={(event) => {
          const day = event.target.value;
          if (!day || day === localDay(entry.createdAt)) return;
          const old = parseISO(entry.createdAt);
          const next = parseISO(`${day}T${format(old, "HH:mm:ss")}`);
          run(() => setFollowUpAdded({ followUpId: entry.id, createdAt: next.toISOString() }), "Date changed");
        }}
      />
    </Field>
  );
}

/** Type, and for a MoM who it was with. Switching type adds or drops the `mom` tag. */
function NoteTypeFields({ entry }: { entry: TrackerEntry }) {
  const { run } = useRun();
  const { people } = useContext(ListsContext);
  const mom = isMom(entry);
  const [person, setPerson] = useState(entry.person ?? "");
  function savePerson() {
    const next = person.trim();
    if (next === (entry.person ?? "")) return;
    run(() => setNotePerson({ followUpId: entry.id, person: next || null }), next ? "Saved" : "Cleared");
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Type" htmlFor={`type-${entry.id}`}>
        <Select
          id={`type-${entry.id}`}
          value={mom ? "mom" : "other"}
          onChange={(event) => {
            const toMom = event.target.value === "mom";
            const rest = entry.tags.filter((tag) => tag !== MOM_TAG);
            run(() => setFollowUpTags({ followUpId: entry.id, tags: toMom ? [MOM_TAG, ...rest] : rest }), toMom ? "Now Minutes of meeting" : "Now Other");
          }}
        >
          {NOTE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
        </Select>
      </Field>
      {mom ? (
        <div onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) savePerson(); }}>
          <Field label="With" htmlFor={`with-${entry.id}`} hint="Saved when you leave the field.">
            <PersonAutocomplete id={`with-${entry.id}`} value={person} options={people} onChange={setPerson} />
          </Field>
        </div>
      ) : null}
    </div>
  );
}

/** A plain-text message as a TipTap doc, so older rows open in the editor too. */
function textToDoc(text: string): JSONContent {
  return { type: "doc", content: text.split("\n").map((line) => ({ type: "paragraph", ...(line ? { content: [{ type: "text", text: line }] } : {}) })) };
}

/** Rewrite one message in place: the words only — who, when and where stay. */
function EditUpdateForm({ update, minHeight = "min-h-24", onDone }: { update: TrackerEntry["updates"][number]; minHeight?: string; onDone: () => void }) {
  const { run, pending } = useRun();
  const initial = (update.doc as JSONContent | null) ?? textToDoc(update.note);
  const [value, setValue] = useState<EditorValue>({ doc: initial, text: update.note, hasContent: true });
  function save() {
    if (!value.hasContent || pending) return;
    run(() => editFollowUpUpdate({ updateId: update.id, note: value.text, ...(value.doc ? { doc: value.doc } : {}) }), "Message updated", onDone);
  }
  return (
    <div className="mt-2 flex flex-col gap-2">
      <UpdateEditor boxed autoFocus id={`edit-${update.id}`} label="Edit message" initialContent={initial} minHeight={minHeight} onChange={setValue} onSubmit={save} />
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onDone} disabled={pending}>Cancel</Button>
        <Button size="sm" onClick={save} loading={pending} disabled={!value.hasContent}>Save</Button>
      </div>
    </div>
  );
}

function Timeline({ entry, className }: { entry: TrackerEntry; className?: string }) {
  const isFollowUp = entry.kind === "FollowUp";
  const [editingId, setEditingId] = useState<string | null>(null);
  const heading = isFollowUp ? "Conversation" : entry.kind === "Task" ? "Notes" : "Updates";
  return (
    <section aria-label={heading} className={cn("min-w-0", className)}>
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
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-text-muted">
                    {who ? <span className="font-semibold text-text">{who} · </span> : null}
                    <time dateTime={update.occurredAt}>{format(parseISO(update.occurredAt), "EEE d MMM yyyy, HH:mm")}</time>
                    {isFollowUp ? ` · ${update.channel}` : ""}
                    {update.editedAt ? <span title={`Edited ${format(parseISO(update.editedAt), "EEE d MMM yyyy, HH:mm")}`}> · edited</span> : null}
                    {!isStatusNote(update) && editingId !== update.id ? (
                      <button
                        type="button"
                        onClick={() => setEditingId(update.id)}
                        aria-label="Edit this message"
                        title="Edit"
                        className="ml-1.5 inline-grid size-7 cursor-pointer place-items-center rounded-full align-middle text-text-subtle transition-colors duration-150 hover:bg-surface-2 hover:text-text"
                      >
                        <Pencil className="size-3.5" aria-hidden="true" />
                      </button>
                    ) : null}
                  </p>
                  {isStatusNote(update) ? (
                    <p className={cn("mt-1 inline-flex items-center gap-1.5 text-sm font-semibold", update.note === TODO_STATUS_NOTES.done ? "text-status-completed-fg" : "text-text-muted")}>
                      {update.note === TODO_STATUS_NOTES.done ? <Check className="size-3.5" strokeWidth={3} aria-hidden="true" /> : <RotateCcw className="size-3.5" aria-hidden="true" />}
                      {update.note}
                    </p>
                  ) : editingId === update.id ? (
                    <EditUpdateForm update={update} onDone={() => setEditingId(null)} />
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

"use client";

import { Pencil } from "lucide-react";
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { editPersonalTodo } from "@/actions/follow-ups";
import { cn } from "@/components/cn";
import { Button } from "@/components/ui/button";
import { Column, DeleteEntry, DoneCircle, Empty, FavouriteToggle, FinishedGroup, LatestLine, type TrackerEntry, byCompleted, dayLabel, fitHeight, important, isOpen, matches, onEnterSave, splitSticky, useRun } from "@/components/tracker/kit";
import { TodoRow } from "@/components/tracker/rows";

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
export function StickyBoard({ entries, today, needle, onOpen }: { entries: TrackerEntry[]; today: string; needle: string; onOpen: (entry: TrackerEntry) => void }) {
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
          <ol className="grid grid-cols-1 gap-6 pt-7 md:grid-cols-2 xl:grid-cols-3">
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
  const { title, body } = splitSticky(entry.subject);
  const [editing, setEditing] = useState(false);
  return (
    <li style={stickyLook(entry.id)} className="tk-sticky group flex min-h-44 min-w-0 flex-col gap-3 p-5">
      {editing ? (
        <StickyEditor entry={entry} onDone={() => setEditing(false)} />
      ) : (
        <>
          <div className="flex min-w-0 items-start gap-3">
            <DoneCircle entry={entry} />
            <button type="button" onClick={onOpen} className="min-w-0 flex-1 cursor-pointer text-left decoration-2 underline-offset-4 hover:underline">
              {title ? <span className="tk-row-title line-clamp-3 [overflow-wrap:anywhere]">{title}</span> : null}
              {body ? <span className={cn("line-clamp-8 block text-md leading-relaxed whitespace-pre-line text-text-muted [overflow-wrap:anywhere]", title && "mt-1.5")}>{body}</span> : null}
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

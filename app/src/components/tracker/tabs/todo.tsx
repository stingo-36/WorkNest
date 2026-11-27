"use client";

import { useMemo, useState } from "react";
import { addDays, endOfWeek, format, parseISO } from "date-fns";
import { cn } from "@/components/cn";
import { AddPill, Bucket, DatePanel, DateTool, FinishedGroup, ListGroup, StarTool, type TrackerEntry, byCompleted, byDue, byNeed, dayLabel, fitHeight, followStateOf, isOpen, matches, needsYou, onEnterSave, plural, useCreate } from "@/components/tracker/kit";
import { FollowUpRow, TodoRow } from "@/components/tracker/rows";

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

/** "Good morning" / "Good afternoon" / "Good evening" by the browser's clock. */
export function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/**
 * The Work to-do view (simpler Tracker, 2026-11-17): one list in two groups —
 * Needs you (late first, then due today, then follow-ups that need you; six
 * shown, plus the one you just added) and Coming up (by day, "No date" last) —
 * then the collapsed done line. Beside it (below on small screens) the People
 * card. Replaced the Next up card, five groups and the This week card.
 */
const NEEDS_SHOWN = 6;

export function TodoQueue({ entries, today, needle, justAdded, personalDue, onOpen, onShowFollowUps, onShowPersonal }: {
  entries: TrackerEntry[];
  today: string;
  needle: string;
  justAdded: string | null;
  /** Personal to-dos due or late; shown as one line so they aren't missed on Work. */
  personalDue: number;
  onOpen: (entry: TrackerEntry) => void;
  onShowFollowUps: () => void;
  onShowPersonal: () => void;
}) {
  const groups = useMemo(() => {
    const next = { overdue: [] as TrackerEntry[], dueToday: [] as TrackerEntry[], replies: [] as TrackerEntry[], coming: [] as TrackerEntry[], done: [] as TrackerEntry[] };
    for (const entry of entries) {
      if (entry.kind === "Note" || !matches(entry, needle)) continue;
      if (needsYou(entry, today)) {
        if (entry.kind === "FollowUp") next.replies.push(entry);
        else if (entry.dueDate && entry.dueDate < today) next.overdue.push(entry);
        else next.dueToday.push(entry);
      } else if (!isOpen(entry)) { if (entry.kind === "Task") next.done.push(entry); }
      // Dated follow-ups (a future nudge) and every open to-do, dated or not.
      else if (entry.dueDate || entry.kind === "Task") next.coming.push(entry);
    }
    next.overdue.sort(byDue);
    next.dueToday.sort(byNeed);
    next.replies.sort(byNeed);
    next.coming.sort(byDue);
    next.done.sort(byCompleted);
    return next;
  }, [entries, today, needle]);

  const row = (entry: TrackerEntry, mode: "today" | "upcoming" | "done") => entry.kind === "Task"
    ? <TodoRow key={entry.id} entry={entry} today={today} mode={mode} highlight={entry.id === justAdded} onOpen={() => onOpen(entry)} />
    : <FollowUpRow key={entry.id} entry={entry} today={today} compact={mode !== "today"} onOpen={() => onOpen(entry)} />;

  const needs = [...groups.overdue, ...groups.dueToday, ...groups.replies];
  const [showAll, setShowAll] = useState(false);
  // The first six, plus the to-do you just added wherever it sorts — a new entry never lands out of sight.
  const shown = showAll || needle ? needs : needs.filter((entry, index) => index < NEEDS_SHOWN || entry.id === justAdded);
  const hidden = needs.length - shown.length;

  return (
    <div className="tk-v3">
      <div className="tk-list">
        <ListGroup title="Needs you" tone="overdue" count={needs.length} hint="Late first, then today, then replies">
          {needs.length ? <ol>{shown.map((entry) => row(entry, "today"))}</ol> : <p className="tk-list-empty">{needle ? "Nothing here matches." : "Nothing needs you right now."}</p>}
          {hidden > 0 ? <button type="button" onClick={() => setShowAll(true)} className="tk-more">Show {hidden} more</button> : null}
          {showAll && !needle && needs.length > NEEDS_SHOWN ? <button type="button" onClick={() => setShowAll(false)} className="tk-more">Show fewer</button> : null}
          {personalDue > 0 && !needle ? (
            <p className="tk-pline">
              {personalDue} personal {plural(personalDue, "to-do")} {personalDue === 1 ? "is" : "are"} due or late ·{" "}
              <button type="button" onClick={onShowPersonal} className="tap-area">Open Personal</button>
            </p>
          ) : null}
        </ListGroup>
        <ListGroup title="Coming up" tone="upcoming" count={groups.coming.length}>
          {groups.coming.length
            ? upcomingBuckets(groups.coming, today).map((bucket) => (
              <Bucket key={bucket.key} label={bucket.label}>{bucket.items.map((entry) => row(entry, "upcoming"))}</Bucket>
            ))
            : <p className="tk-list-empty">{needle ? "Nothing here matches." : "Nothing scheduled. Add a to-do with a date above."}</p>}
        </ListGroup>
        {groups.done.length ? <div className="tk-grp px-4 pb-3"><FinishedGroup verb="completed" entries={groups.done} today={today} needle={needle} render={(entry) => row(entry, "done")} /></div> : null}
      </div>
      <aside aria-label="People" className="tk-rail">
        <PeopleCard entries={entries} today={today} onShowAll={onShowFollowUps} onOpen={onOpen} />
      </aside>
    </div>
  );
}

/** A steady pastel per name, so the same person always gets the same avatar. */
function avatarTint(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 5;
}

type PersonLine = { name: string; line: string; action: { label: string; ink: boolean; entry: TrackerEntry } | null };

/**
 * People (2026-11-17, replaced "Waiting on", which listed people waiting on *you*
 * under that title): who is waiting on your reply, with Reply; then who you are
 * waiting on, with Ping once it's due. Someone with threads both ways is in both.
 */
function PeopleCard({ entries, today, onShowAll, onOpen }: { entries: TrackerEntry[]; today: string; onShowAll: () => void; onOpen: (entry: TrackerEntry) => void }) {
  const { yours, theirs } = useMemo(() => {
    const byPerson = new Map<string, { replied: number; waiting: number; due: number; reply: TrackerEntry | null; nudge: TrackerEntry | null }>();
    for (const entry of entries) {
      if (entry.kind !== "FollowUp" || !isOpen(entry)) continue;
      const name = entry.person ?? "Someone";
      const row = byPerson.get(name) ?? { replied: 0, waiting: 0, due: 0, reply: null, nudge: null };
      if (followStateOf(entry) === "replied") {
        row.replied += 1;
        row.reply ??= entry;
      } else {
        row.waiting += 1;
        if (needsYou(entry, today)) { row.due += 1; row.nudge ??= entry; }
      }
      byPerson.set(name, row);
    }
    const people = [...byPerson.entries()];
    return {
      yours: people
        .filter(([, row]) => row.replied)
        .sort((a, b) => b[1].replied - a[1].replied)
        .map(([name, row]): PersonLine => ({ name, line: `${row.replied} ${plural(row.replied, "reply", "replies")} to answer`, action: { label: "Reply", ink: true, entry: row.reply! } })),
      theirs: people
        .filter(([, row]) => row.waiting)
        .sort((a, b) => b[1].due - a[1].due || b[1].waiting - a[1].waiting)
        .map(([name, row]): PersonLine => ({ name, line: `${row.waiting} ${plural(row.waiting, "thread")}${row.due ? " · time to ping" : ""}`, action: row.nudge ? { label: "Ping", ink: false, entry: row.nudge } : null })),
    };
  }, [entries, today]);

  return (
    <section aria-labelledby="tk-people-title" className="tk-card">
      <div className="flex items-center justify-between gap-3">
        <h2 id="tk-people-title" className="tk-card-title">People</h2>
        <button type="button" onClick={onShowAll} className="tap-area cursor-pointer text-sm font-semibold text-accent-text hover:underline">All follow-ups</button>
      </div>
      <PeopleList title="Waiting on you" people={yours} empty="Nobody. You're all caught up." onOpen={onOpen} onMore={onShowAll} />
      <PeopleList title="You're waiting on" people={theirs} empty="Nobody." onOpen={onOpen} onMore={onShowAll} />
    </section>
  );
}

/** Four people at most, then "+N more" (the heading keeps the real total — 2026-11-17, it showed the shown count). */
const PEOPLE_SHOWN = 4;

function PeopleList({ title, people, empty, onOpen, onMore }: { title: string; people: PersonLine[]; empty: string; onOpen: (entry: TrackerEntry) => void; onMore: () => void }) {
  const hidden = people.length - PEOPLE_SHOWN;
  return (
    <>
      <h3 className="tk-people-head">{title} · {people.length}</h3>
      {people.length ? (
        <ul className="flex flex-col gap-3">
          {people.slice(0, PEOPLE_SHOWN).map((person) => (
            <li key={person.name} className="flex items-center gap-3">
              <span className="tk-avatar" data-tint={avatarTint(person.name)} aria-hidden="true">{person.name.trim().charAt(0).toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-base font-semibold text-text">{person.name}</b>
                <span className="text-sm text-text-muted">{person.line}</span>
              </span>
              {person.action ? (
                <button type="button" onClick={() => onOpen(person.action!.entry)} aria-label={`${person.action.label} ${person.name}${person.action.label === "Ping" ? " again" : ""}`} className={cn("tk-mini-btn", person.action.ink && "tk-mini-btn-ink")}>
                  {person.action.label}
                </button>
              ) : <span className="text-sm text-text-muted">Waiting</span>}
            </li>
          ))}
          {hidden > 0 ? (
            <li><button type="button" onClick={onMore} className="tap-area cursor-pointer text-sm font-semibold text-accent-text hover:underline">+{hidden} more</button></li>
          ) : null}
        </ul>
      ) : <p className="text-sm text-text-muted">{empty}</p>}
    </>
  );
}

/** Personal sticky notes start without a date — they're jotted, not scheduled. */
export function AddTodo({ today, personal = false, onAdded }: { today: string; personal?: boolean; onAdded?: (id: string) => void }) {
  const startDate = personal ? "" : today;
  const [subject, setSubject] = useState("");
  // Personal notes: a short title, then details (2026-11-21 — one field made the
  // whole paragraph the sticky's bold title). Stored as one subject: title, newline, details.
  const [details, setDetails] = useState("");
  const [date, setDate] = useState(startDate);
  const [pinned, setPinned] = useState(false);
  const [panel, setPanel] = useState(false);
  const { create, pending, error, setError } = useCreate((id) => { setSubject(""); setDetails(""); setDate(startDate); setPinned(false); setPanel(false); onAdded?.(id); });

  function save() {
    if (pending) return;
    // The button is always live (a greyed CTA reads as broken); empty → point at the field.
    if (!subject.trim()) { setError("Write the to-do first"); document.getElementById("add-todo")?.focus(); return; }
    const text = personal ? [subject.trim(), details.trim()].filter(Boolean).join("\n") : subject.trim();
    create({ kind: "Task", subject: text.slice(0, personal ? 1000 : 300), dueDate: date || null, personal }, pinned);
  }

  return (
    <AddPill
      label={personal ? "Add a personal to-do" : "Add a to-do"}
      inputId="add-todo"
      placeholder={personal ? "Title — jot a personal to-do…" : "Add a to-do…"}
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
      below={personal ? (
        <div className="border-t border-border px-4 py-2.5 md:pl-12">
          <label htmlFor="add-todo-details" className="sr-only">Details (optional)</label>
          <textarea
            id="add-todo-details"
            ref={(field) => fitHeight(field)}
            rows={2}
            value={details}
            maxLength={900}
            placeholder="Details (optional) — paths, links, steps…"
            onChange={(event) => { setDetails(event.target.value); setError(undefined); fitHeight(event.target); }}
            onKeyDown={onEnterSave(save)}
            className="max-h-60 min-h-12 w-full resize-none bg-transparent text-md leading-relaxed text-text outline-none placeholder:text-text-subtle"
          />
        </div>
      ) : null}
    />
  );
}

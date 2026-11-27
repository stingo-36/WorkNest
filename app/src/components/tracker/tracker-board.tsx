"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { SearchPill } from "@/components/shell/page-head";
import { FormError } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { isArchived, tabOf } from "@/lib/tracker-rules";
import type { EntryKind } from "@/generated/prisma/enums";
import { ListsContext, type TrackerEntry, type TrackerView, VIEWS, followStateOf, isOpen, needsYou, noteTags, plural, subscribeNever, todayIso } from "@/components/tracker/kit";
import { EntryBody, EntryEyebrow, EntryTitle } from "@/components/tracker/entry-dialog";
import { AddTodo, TodoQueue, greeting } from "@/components/tracker/tabs/todo";
import { NoteQueue, mergeTags } from "@/components/tracker/tabs/notes";
import { ArchiveList } from "@/components/tracker/tabs/archived";
import { StickyBoard } from "@/components/tracker/tabs/personal";
import { FollowUpQueue } from "@/components/tracker/tabs/follow-ups";

export type { TrackerEntry, TrackerView } from "@/components/tracker/kit";

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
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  // The to-do just added from the add row: kept in view and highlighted (2026-11-17).
  const [justAdded, setJustAdded] = useState<string | null>(null);
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

  // Tab badges mean one thing everywhere (2026-11-17): how many need you. To-do
  // matches its Needs you group (work to-dos + follow-ups); Notes and Archived never need you.
  const followNeeds = byKind.FollowUp.filter((entry) => needsYou(entry, today)).length;
  const personalDue = personalTodos.filter((entry) => needsYou(entry, today)).length;
  const badge: Record<TrackerView, number> = {
    todo: workEntries.filter((entry) => entry.kind !== "Note" && needsYou(entry, today)).length,
    followups: followNeeds,
    personal: personalDue,
    notes: 0,
    archived: 0,
  };
  const opened = entries.find((entry) => entry.id === openId) ?? null;
  const lists = useMemo(() => ({ channels, noteTags: savedNoteTags, people }), [channels, savedNoteTags, people]);
  const tagSuggestions = mergeTags(noteTags(byKind.Note).map(([tag]) => tag), savedNoteTags);
  const openEntry = (entry: TrackerEntry) => setOpenId(entry.id);

  // `?open=<id>` (links from Ask) opens that entry on its tab. The param is then
  // dropped, so following the same link again opens it again.
  const linkedId = useSearchParams().get("open");
  const linked = linkedId ? entries.find((entry) => entry.id === linkedId) : undefined;
  const linkedTab: TrackerView = linked ? tabOf(linked) : "todo";
  const [handledLink, setHandledLink] = useState<string | null>(null);
  if ((linked?.id ?? null) !== handledLink) {
    setHandledLink(linked?.id ?? null);
    if (linked) {
      setView(linkedTab);
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
    setJustAdded(null);
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

  // The header's three pills (2026-11-17, replaced four stat cards and the sprint meter):
  // late work to-dos, follow-ups that need you, and people waiting on your reply.
  const summary = {
    overdue: workEntries.filter((entry) => entry.kind === "Task" && isOpen(entry) && entry.dueDate !== null && entry.dueDate < today).length,
    followNeeds,
    // One per person, however many threads.
    yourTurn: new Set(byKind.FollowUp.filter((entry) => isOpen(entry) && followStateOf(entry) === "replied").map((entry) => entry.person ?? "Someone")).size,
  };

  // From 1024px search lives in the desktop top bar (mockup, 2026-11-14); the bar
  // renders an empty slot for it. Below that it stays on the page.
  const deskSlot = useSyncExternalStore(subscribeNever, () => document.getElementById("app-deskbar-slot"), () => null);

  return (
    <ListsContext.Provider value={lists}>
    <div className="tk-focus tk-plain flex w-full min-w-0 flex-col gap-6">
      {/* Simpler Tracker (2026-11-17): date + sprint day, greeting, three summary pills,
          underline tabs whose counts are what needs you, then the add row. */}
      {/* relative z-20: the page's entrance animation leaves each block in its own stacking
          layer, so without this the content below paints over (and swallows clicks on) the
          add field's date / who panels. */}
      <header className="relative z-20 flex flex-col gap-6">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm text-text-muted" suppressHydrationWarning>
            {format(parseISO(today), "EEEE, d MMMM")}{sprint ? ` · Sprint day ${sprint.day} of ${sprint.total}` : ""}
          </p>
          <h1 className="tk-greeting">
            <span className="sr-only">Tracker — </span>
            <span suppressHydrationWarning>{greeting()}</span>{greetingName ? `, ${greetingName}` : ""}
          </h1>
          <ul aria-label="Today at a glance" className="tk-pills">
            <li>
              <button type="button" className="tk-pill tap-area" data-tone="late" onClick={() => choose("todo")} suppressHydrationWarning>
                {summary.overdue ? <><b>{summary.overdue}</b> overdue</> : "Nothing late"}
              </button>
            </li>
            <li>
              <button type="button" className="tk-pill tap-area" data-tone="needs" onClick={() => choose("followups")}>
                <b>{summary.followNeeds}</b> {summary.followNeeds === 1 ? "follow-up needs you" : "follow-ups need you"}
              </button>
            </li>
            <li>
              <button type="button" className="tk-pill tap-area" data-tone="turn" onClick={() => choose("followups")}>
                <b>{summary.yourTurn}</b> {plural(summary.yourTurn, "person", "people")} waiting on your reply
              </button>
            </li>
          </ul>
        </div>

        <SearchPill id="tracker-search" label="Search the Tracker" value={query} placeholder="Search tasks, people or #tags" onChange={setQuery} className="h-11 w-full lg:hidden" />
        {deskSlot ? createPortal(
          <SearchPill id="tracker-search-desk" label="Search the Tracker" value={query} placeholder="Search tasks, people or #tags" onChange={setQuery} shortcut className="h-10 w-full max-w-md" />,
          deskSlot,
        ) : null}

        <div className="tk-tabrow">
          <nav aria-label="Tracker lists" onKeyDown={onTabKey} className="tk-tabs">
            {VIEWS.map((item) => {
              const on = item.id === view;
              return (
                <button key={item.id} type="button" aria-current={on ? "page" : undefined} onClick={() => choose(item.id)} className="tk-tab">
                  {item.label}
                  {badge[item.id] ? <span className="tk-tab-count" data-needs="">{badge[item.id]}<span className="sr-only"> need you</span></span> : null}
                </button>
              );
            })}
          </nav>
        </div>

        {view === "todo" || view === "personal" ? (
          <div className="tk-command"><AddTodo key={view} today={today} personal={view === "personal"} onAdded={setJustAdded} /></div>
        ) : null}
        {/* No hint boxes on the other tabs (2026-11-17): each list has its own button or empty state. */}
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
        <div key={view} className="tk-swap">
        {view === "todo" ? (
          <TodoQueue
            entries={workEntries}
            today={today}
            needle={needle}
            justAdded={justAdded}
            personalDue={personalDue}
            onOpen={openEntry}
            onShowFollowUps={() => choose("followups")}
            onShowPersonal={() => choose("personal")}
          />
        ) : null}
        {view === "personal" ? <StickyBoard entries={personalTodos} today={today} needle={needle} onOpen={openEntry} /> : null}
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

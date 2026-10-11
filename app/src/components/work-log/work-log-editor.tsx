"use client";

import { Check, ChevronLeft, ChevronRight, ClipboardCheck, Eye, MessagesSquare, Paperclip, Plane, Sun, Ticket } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { useEffect, useRef, useState, useTransition } from "react";

import { detachTicketFromWorkLog, saveTicketWorkUpdate, updateTicket, upsertTicketForWorkLog } from "@/actions/tickets";
import { updateWorkLog } from "@/actions/worklog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/components/cn";
import { DAY_LABEL, DEFAULT_TITLE, type DayType } from "@/components/work-log/day-type";
import { DayTypeToggle } from "@/components/work-log/day-type-toggle";
import { MeetingSection } from "@/components/work-log/meeting-section";
import { SaveStatusIndicator, SaveStatusProvider, type SaveResult } from "@/components/work-log/save-status";
import { AttachmentsSection } from "@/components/work-log/attachments-section";
import { DayTodos, type DayTodo } from "@/components/work-log/day-todos";
import { LearningSection } from "@/components/work-log/learning-section";
import { TicketSearch } from "@/components/work-log/ticket-search";
import { TicketWorkCard } from "@/components/work-log/ticket-work-card";
import { toHistory, type EditorTicket, type EditorWorkLog, type HistoryEntry } from "@/components/work-log/types";
import { toast } from "@/components/ui/toast";
import type { WorkflowStatus } from "@/lib/workflow-status";

type TicketPayload = {
  id: string;
  ticketId: string;
  title: string;
  projectName?: string | null;
  status: WorkflowStatus;
  updatedAt: Date | string;
  currentUpdate?: { description: string; status: WorkflowStatus } | null;
  updates?: Array<{ id: string; description: string; status: WorkflowStatus; createdAt: Date | string; updatedAt: Date | string; workLog?: { id: string; title: string; date: Date | string } | null }>;
};

function toEditorTicket(input: TicketPayload): EditorTicket {
  return { id: input.id, ticketKey: input.ticketId, title: input.title, projectName: input.projectName ?? null, status: input.status, updatedAt: new Date(input.updatedAt), draft: input.currentUpdate ?? { description: "", status: input.status }, history: input.updates ? toHistory(input.updates) : null };
}

/** Auto-generated titles ("Daily Work Log", "Holiday", "Leave") aren't shown in the title field. */
const DEFAULT_TITLES = new Set<string>(Object.values(DEFAULT_TITLE));
const shownTitle = (stored: string) => (DEFAULT_TITLES.has(stored) ? "" : stored);

type AdjacentLog = { id: string; label: string } | null;

/** ‹ / › to the neighbouring work log; a dimmed square when there is none. */
function AdjacentLink({ log, direction }: { log: AdjacentLog; direction: "previous" | "next" }) {
  const Icon = direction === "previous" ? ChevronLeft : ChevronRight;
  const box = "grid size-10 shrink-0 place-items-center rounded-xl border bg-surface transition-[border-color,background-color,box-shadow] duration-150";
  if (!log) {
    return <span className={cn(box, "border-border text-text-subtle opacity-50")} aria-hidden="true"><Icon className="size-4" /></span>;
  }
  return (
    <Link href={`/work-logs/${log.id}/edit`} aria-label={`${direction === "previous" ? "Previous" : "Next"} work log: ${log.label}`} title={log.label} className={cn(box, "border-border-strong text-text shadow-xs hover:border-primary hover:bg-surface-2")}>
      <Icon className="size-4" aria-hidden="true" />
    </Link>
  );
}

/**
 * Leaving the editor (navigating away, closing or reloading the tab) asks the
 * server to refresh the AI summary and auto title in the background. The server
 * only calls the AI if the log's text changed since the last run, so opening a
 * log and leaving it untouched costs nothing. A beacon survives the page closing.
 */
function useAiRefreshOnLeave(workLogId: string) {
  useEffect(() => {
    const mountedAt = Date.now();
    let sent = false;
    function send() {
      // React's dev double-mount unmounts at once — that isn't the user leaving.
      if (sent || Date.now() - mountedAt < 1000) return;
      sent = true;
      const body = new Blob([JSON.stringify({ tzOffset: new Date().getTimezoneOffset() })], { type: "application/json" });
      navigator.sendBeacon(`/api/work-logs/${workLogId}/ai-refresh`, body);
    }
    window.addEventListener("pagehide", send);
    return () => {
      window.removeEventListener("pagehide", send);
      send();
    };
  }, [workLogId]);
}

export function WorkLogEditor({ workLog, relative, adjacent, ticketsEnabled, dayTodos }: { workLog: EditorWorkLog; relative: string; adjacent: { previous: AdjacentLog; next: AdjacentLog }; ticketsEnabled: boolean; /** Tracker to-dos finished/overdue on this day. */ dayTodos: { date: string; todos: DayTodo[] } }) {
  const [title, setTitle] = useState(shownTitle(workLog.title));
  const [savedTitle, setSavedTitle] = useState(workLog.title);
  const [meetingsDone, setMeetingsDone] = useState(workLog.meetings.filter((meeting) => meeting.notes.trim()).length);
  const [learningWritten, setLearningWritten] = useState(workLog.learningNotes.trim().length > 0);
  const [attachmentCount, setAttachmentCount] = useState(workLog.attachments.length);
  const [tickets, setTickets] = useState(workLog.tickets);
  const [dayType, setDayType] = useState<DayType>(workLog.dayType);
  const [renaming, startRename] = useTransition();
  const titleRef = useRef<HTMLInputElement>(null);
  useAiRefreshOnLeave(workLog.id);

  function saveTitle() {
    // An empty field stores the day type's default, which stays hidden here.
    const next = title.trim() || DEFAULT_TITLE[dayType];
    if (next === savedTitle || (!title.trim() && DEFAULT_TITLES.has(savedTitle))) { setTitle(shownTitle(savedTitle)); return; }
    startRename(async () => {
      const result = await updateWorkLog({ workLogId: workLog.id, title: next });
      if (!result.ok) { setTitle(shownTitle(savedTitle)); toast.error(result.error.message); return; }
      setTitle(shownTitle(result.data.title));
      setSavedTitle(result.data.title);
      toast.success(title.trim() ? "Work log renamed" : "Title cleared");
    });
  }

  function changeDayType(next: DayType) {
    if (next === dayType) return;
    const previous = dayType;
    setDayType(next);
    startRename(async () => {
      const result = await updateWorkLog({ workLogId: workLog.id, dayType: next });
      if (!result.ok) { setDayType(previous); toast.error(result.error.message); return; }
      toast.success(next === "Work" ? "Back to a work day" : `Marked as ${DAY_LABEL[next].toLowerCase()}`);
    });
  }

  async function attach(input: { ticketKey: string; title?: string; projectName?: string; status?: WorkflowStatus; description?: string }) {
    const result = await upsertTicketForWorkLog({ workLogId: workLog.id, ticketKey: input.ticketKey, title: input.title, projectName: input.projectName, status: input.status });
    if (!result.ok) { toast.error(result.error.message); return false; }
    let nextTicket = toEditorTicket({ ...result.data.ticket, currentUpdate: result.data.currentUpdate, updates: result.data.ticket.updates });

    // Save the work text BEFORE the card mounts: TicketWorkCard seeds its
    // editor from `ticket.draft` once, so a card added empty and filled in
    // afterwards would never show what was just typed.
    const description = input.description?.trim() ?? "";
    // `status` only seeds a NEW ticket server-side; for an existing ticket the
    // chosen status is applied through this log's work update.
    const status = input.status ?? nextTicket.draft.status;
    if (description || status !== nextTicket.draft.status) {
      const saved = await saveTicketWorkUpdate({ workLogId: workLog.id, ticketId: nextTicket.id, description, status });
      if (saved.ok) nextTicket = { ...nextTicket, draft: { description, status }, status: saved.data.ticket.status, updatedAt: new Date() };
      else toast.error(saved.error.message);
    }

    // upsert only sets the project on a NEW ticket; apply an edit to an existing one here.
    const project = input.projectName?.trim() ?? "";
    if (input.projectName !== undefined && project !== (nextTicket.projectName ?? "")) {
      const updated = await updateTicket({ ticketId: nextTicket.id, projectName: project });
      if (updated.ok) nextTicket = { ...nextTicket, projectName: updated.data.projectName };
      else toast.error(updated.error.message);
    }

    const added = nextTicket;
    setTickets((current) => current.some((ticket) => ticket.id === added.id) ? current.map((ticket) => ticket.id === added.id ? added : ticket) : [...current, added]);
    toast.success(`${added.ticketKey} added to this log`);
    return true;
  }

  async function saveWork(input: { ticketId: string; draft: { description: string; status: WorkflowStatus } }): Promise<SaveResult> {
    const result = await saveTicketWorkUpdate({ workLogId: workLog.id, ticketId: input.ticketId, description: input.draft.description, status: input.draft.status });
    if (!result.ok) return { ok: false, message: result.error.message };
    setTickets((current) => current.map((ticket) => ticket.id === input.ticketId ? { ...ticket, status: result.data.ticket.status, draft: input.draft, updatedAt: new Date() } : ticket));
    return { ok: true };
  }

  /** Project lives on the Ticket, so this updates it everywhere, not just in this log. */
  async function saveProject(ticketId: string, projectName: string) {
    const result = await updateTicket({ ticketId, projectName });
    if (!result.ok) { toast.error(result.error.message); return undefined; }
    const stored = result.data.projectName;
    setTickets((current) => current.map((ticket) => ticket.id === ticketId ? { ...ticket, projectName: stored } : ticket));
    toast.success(stored ? "Project saved" : "Project cleared");
    return stored;
  }

  async function detach(ticketId: string) {
    const result = await detachTicketFromWorkLog({ workLogId: workLog.id, ticketId });
    if (!result.ok) { toast.error(result.error.message); return false; }
    setTickets((current) => current.filter((ticket) => ticket.id !== ticketId));
    toast.success("Ticket removed from this log");
    return true;
  }

  function updateHistory(ticketId: string, history: HistoryEntry[]) {
    setTickets((current) => current.map((ticket) => ticket.id === ticketId ? { ...ticket, history } : ticket));
  }

  const progress = [
    { id: "meetings-heading", label: "Meeting notes", Icon: MessagesSquare, value: `${meetingsDone}/${workLog.meetings.length}`, done: meetingsDone > 0 },
    ...(ticketsEnabled ? [{ id: "tickets-heading", label: "Ticket work", Icon: Ticket, value: String(tickets.length), done: tickets.length > 0 }] : []),
    { id: "learning-heading", label: "Work done", Icon: ClipboardCheck, value: learningWritten ? "Written" : "—", done: learningWritten },
    { id: "attachments-heading", label: "Attachments", Icon: Paperclip, value: String(attachmentCount), done: attachmentCount > 0 },
  ];

  return (
    <SaveStatusProvider>
      <div className="work-logs-page work-log-edit-page flex min-w-0 flex-col gap-5">
        {/* Action strip (2026-10-08 redesign): navigation, day type, save state. */}
        <div role="group" aria-label="Log status" className="flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-2xl border border-border bg-surface px-3 py-2.5 md:px-4">
          <nav aria-label="Other work logs" className="flex shrink-0 items-center gap-1.5">
            <AdjacentLink log={adjacent.previous} direction="previous" />
            <AdjacentLink log={adjacent.next} direction="next" />
          </nav>
          <Link href="/work-logs" className="tap-area text-sm font-semibold text-accent-text hover:underline">All work logs</Link>
          <span className="flex flex-wrap items-center gap-3 md:ml-auto">
            <span id="work-log-day-type-label" className="sr-only">Day type</span>
            <DayTypeToggle name="work-log-day-type" labelledBy="work-log-day-type-label" value={dayType} onChange={changeDayType} disabled={renaming} short />
            <span className="min-w-0 text-sm"><SaveStatusIndicator /></span>
            <Link href={`/work-logs/${workLog.id}`} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full border border-border-strong bg-surface px-4 text-sm font-semibold text-text transition-colors duration-150 hover:bg-surface-2 md:h-10">
              <Eye className="size-4" aria-hidden="true" />View log
            </Link>
          </span>
        </div>

        <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem] xl:gap-10">
          {/* The log as one document: date, title, then each section under a rule. */}
          <article className="wl-doc motion-page-enter min-w-0 rounded-3xl border border-border bg-surface px-5 py-6 md:px-10 md:py-10">
            <p className="text-sm font-semibold text-text-subtle">{relative}</p>
            <h1 className="mt-1 text-4xl font-semibold tracking-[-0.035em] text-text md:text-5xl">
              <time dateTime={format(workLog.date, "yyyy-MM-dd")}>{format(workLog.date, "EEEE, d MMMM")}</time>
            </h1>
            <label htmlFor="work-log-title" className="sr-only">Log title</label>
            <Input
              bare
              id="work-log-title"
              ref={titleRef}
              value={title}
              placeholder={dayType === "Work" ? "Give today a title — e.g. Catalogue migration fixes" : "Add a note — optional"}
              disabled={renaming}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={saveTitle}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); titleRef.current?.blur(); } }}
              className="mt-3 h-12 w-full rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 py-0 text-lg font-medium text-text shadow-none transition-colors duration-150 placeholder:font-normal placeholder:text-text-subtle hover:border-border focus:border-primary focus:ring-0 md:text-xl"
            />

            {dayType !== "Work" ? (
              <section aria-label="Day off" className="wl-off mt-8 flex flex-col items-start gap-3 rounded-2xl border border-border p-6 md:p-8">
                <span className="grid size-11 place-items-center rounded-xl bg-sidebar text-sidebar-fg" aria-hidden="true">
                  {dayType === "Holiday" ? <Sun className="size-5" /> : <Plane className="size-5" />}
                </span>
                <h2 className="text-xl font-semibold text-text">This day is marked as {DAY_LABEL[dayType].toLowerCase()}.</h2>
                <p className="max-w-[60ch] text-sm text-text-muted">No meetings or ticket work to capture. Switch the day type back to <strong className="font-semibold text-text">Work day</strong> if you did work — anything already written is kept.</p>
                <Button variant="secondary" onClick={() => changeDayType("Work")} loading={renaming}>Switch to work day</Button>
              </section>
            ) : null}

            <div className={dayType !== "Work" ? "hidden" : "flex min-w-0 flex-col"}>
              <MeetingSection workLogId={workLog.id} meetings={workLog.meetings} onCompletedChange={setMeetingsDone} />

              {ticketsEnabled ? (
              <section aria-labelledby="tickets-heading" className="wl-card overflow-hidden">
                <div className="flex flex-col gap-3 px-4 py-4 md:px-5">
                  <h2 id="tickets-heading" className="flex items-center gap-2 text-lg font-semibold tracking-[-0.015em] text-text">
                    Tickets
                    <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs font-semibold text-accent-text tabular-nums">{tickets.length}</span>
                  </h2>
                  <TicketSearch attachedKeys={tickets.map((ticket) => ticket.ticketKey)} onAttach={attach} onFocusAttached={(ticketKey) => document.getElementById(`ticket-card-${ticketKey}`)?.scrollIntoView({ behavior: "smooth", block: "center" })} />
                </div>
                {tickets.length > 0 ? (
                  <div className="flex flex-col divide-y divide-border">
                    {tickets.map((ticket) => <TicketWorkCard key={ticket.id} workLogId={workLog.id} ticket={ticket} onSaveWork={saveWork} onDetach={detach} onHistoryLoaded={updateHistory} onSaveProject={saveProject} />)}
                  </div>
                ) : (
                  <p className="px-4 pb-4 text-sm text-text-muted md:px-5">No ticket work yet — search above to attach a ticket and record what you did.</p>
                )}
              </section>
              ) : null}

              <LearningSection workLogId={workLog.id} initialNotes={workLog.learningNotes} onFilledChange={setLearningWritten} />
              <AttachmentsSection workLogId={workLog.id} initial={workLog.attachments} onCountChange={setAttachmentCount} />
            </div>
          </article>

          {/* The margin: an outline of the document, then the day's Tracker to-dos. */}
          <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-24">
            {dayType === "Work" ? (
              <nav aria-label="On this page" className="rounded-2xl border border-border bg-surface p-4">
                <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.1em] text-text-subtle">On this page</p>
                <ul className="flex flex-col gap-0.5">
                  {progress.map(({ id, label, Icon, value, done }) => (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => document.getElementById(id)?.closest("section")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                        className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors duration-150 hover:bg-surface-2"
                      >
                        <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", done ? "bg-primary text-primary-fg" : "border border-border text-text-muted")}>
                          {done ? <Check className="size-3.5" aria-hidden="true" /> : <Icon className="size-3.5" aria-hidden="true" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text">{label}</span>
                        <span className={cn("shrink-0 text-xs tabular-nums", done ? "text-accent-text" : "text-text-subtle")}>{value}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}
            <DayTodos date={dayTodos.date} todos={dayTodos.todos} compact />
          </aside>
        </div>
      </div>
    </SaveStatusProvider>
  );
}

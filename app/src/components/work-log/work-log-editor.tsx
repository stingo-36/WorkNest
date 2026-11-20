"use client";

import { ArrowLeft, Check, ChevronLeft, ChevronRight, ClipboardPaste, Eye, Plane, Sun } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { detachTicketFromWorkLog, saveTicketWorkUpdate, updateTicket, upsertTicketForWorkLog } from "@/actions/tickets";
import { updateWorkLog } from "@/actions/worklog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/components/cn";
import { DAY_LABEL, DEFAULT_TITLE, type DayType } from "@/components/work-log/day-type";
import { DayTypeToggle } from "@/components/work-log/day-type-toggle";
import { useQuickLog } from "@/components/quick-log/quick-log";
import { MeetingSection } from "@/components/work-log/meeting-section";
import { SaveStatusIndicator, SaveStatusProvider, useSaveState, type SaveResult } from "@/components/work-log/save-status";
import { StepHeading } from "@/components/work-log/section-heading";
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
function useAiRefreshOnLeave(workLogId: string, skipRef: React.RefObject<boolean>) {
  useEffect(() => {
    const mountedAt = Date.now();
    let sent = false;
    function send() {
      // React's dev double-mount unmounts at once — that isn't the user leaving.
      // Finish day hands the summary to the view page instead (no double AI run).
      if (sent || skipRef.current || Date.now() - mountedAt < 1000) return;
      sent = true;
      const body = new Blob([JSON.stringify({ tzOffset: new Date().getTimezoneOffset() })], { type: "application/json" });
      navigator.sendBeacon(`/api/work-logs/${workLogId}/ai-refresh`, body);
    }
    window.addEventListener("pagehide", send);
    return () => {
      window.removeEventListener("pagehide", send);
      send();
    };
  }, [workLogId, skipRef]);
}

export function WorkLogEditor({ workLog, relative, adjacent, ticketsEnabled, dayTodos }: { workLog: EditorWorkLog; relative: string; adjacent: { previous: AdjacentLog; next: AdjacentLog }; ticketsEnabled: boolean; /** Tracker to-dos finished/overdue on this day. */ dayTodos: { date: string; todos: DayTodo[] } }) {
  const [title, setTitle] = useState(shownTitle(workLog.title));
  const [savedTitle, setSavedTitle] = useState(workLog.title);
  const [meetingsDone, setMeetingsDone] = useState(workLog.meetings.every((meeting) => meeting.notes.trim()));
  const [meetingsWritten, setMeetingsWritten] = useState(workLog.meetings.filter((meeting) => meeting.notes.trim()).length);
  const [learningWritten, setLearningWritten] = useState(workLog.learningNotes.trim().length > 0);
  const [attachmentCount, setAttachmentCount] = useState(workLog.attachments.length);
  const [tickets, setTickets] = useState(workLog.tickets);
  const [dayType, setDayType] = useState<DayType>(workLog.dayType);
  const [renaming, startRename] = useTransition();
  const titleRef = useRef<HTMLInputElement>(null);
  const skipBeaconRef = useRef(false);
  useAiRefreshOnLeave(workLog.id, skipBeaconRef);

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
    // After React paints the new card, put the cursor in its update line.
    setTimeout(() => focusTicket(added.ticketKey), 50);
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

  /** Scroll to a ticket's card and put the cursor in its update line. */
  function focusTicket(ticketKey: string) {
    const card = document.getElementById(`ticket-card-${ticketKey}`);
    card?.scrollIntoView({ behavior: "smooth", block: "center" });
    (card?.querySelector("[contenteditable='true']") as HTMLElement | null)?.focus();
  }

  const onMeetingsProgress = useCallback((done: boolean, written: number) => { setMeetingsDone(done); setMeetingsWritten(written); }, []);

  function updateHistory(ticketId: string, history: HistoryEntry[]) {
    setTickets((current) => current.map((ticket) => ticket.id === ticketId ? { ...ticket, history } : ticket));
  }

  // The numbered steps (Tickets drops out when tickets are off in Profile).
  const ticketsWritten = tickets.some((ticket) => ticket.draft.description.trim());
  const steps = [meetingsDone, ...(ticketsEnabled ? [ticketsWritten] : []), learningWritten];
  const stepsDone = steps.filter(Boolean).length;
  const anything = meetingsWritten > 0 || ticketsWritten || learningWritten || attachmentCount > 0;

  return (
    <SaveStatusProvider>
      <div className="work-logs-page work-log-edit-page wl-day mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-4">
        {/* Top bar (2026-11-18): back to the sprint, neighbouring days, day type, save state. */}
        <div role="group" aria-label="Log status" className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
          <Link href="/work-logs" className="inline-flex h-11 items-center gap-1.5 rounded-full border border-border-strong bg-surface px-4 text-sm font-semibold text-text transition-colors duration-150 hover:bg-surface-2 md:h-10">
            <ArrowLeft className="size-4" aria-hidden="true" />Back to sprint
          </Link>
          <nav aria-label="Other work logs" className="flex shrink-0 items-center gap-1.5">
            <AdjacentLink log={adjacent.previous} direction="previous" />
            <AdjacentLink log={adjacent.next} direction="next" />
          </nav>
          <span className="flex flex-wrap items-center gap-3 md:ml-auto">
            <span id="work-log-day-type-label" className="sr-only">Day type</span>
            <DayTypeToggle name="work-log-day-type" labelledBy="work-log-day-type-label" value={dayType} onChange={changeDayType} disabled={renaming} short />
            {dayType === "Work" ? <PasteNotesButton date={workLog.date.toISOString().slice(0, 10)} /> : null}
            <Link href={`/work-logs/${workLog.id}`} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full border border-border-strong bg-surface px-4 text-sm font-semibold text-text transition-colors duration-150 hover:bg-surface-2 md:h-10">
              <Eye className="size-4" aria-hidden="true" />View log
            </Link>
          </span>
        </div>

        <article className="wl-steps motion-page-enter min-w-0">
          <header className="wl-steps-head">
            <div className="wl-steps-title min-w-0 flex-1">
              <h1 className="text-2xl font-semibold tracking-[-0.03em] text-text md:text-3xl">
                {relative === "Today" ? "Today" : <time dateTime={format(workLog.date, "yyyy-MM-dd")}>{format(workLog.date, "EEEE d MMMM")}</time>}
              </h1>
              <p className="mt-0.5 text-sm text-text-muted">
                {relative === "Today" ? <time dateTime={format(workLog.date, "yyyy-MM-dd")}>{format(workLog.date, "EEEE d MMMM")}</time> : relative}
              </p>
              <label htmlFor="work-log-title" className="sr-only">Log title (optional)</label>
              <Input
                bare
                id="work-log-title"
                ref={titleRef}
                value={title}
                placeholder={dayType === "Work" ? "Title (optional, written for you if empty)" : "Add a note (optional)"}
                disabled={renaming}
                onChange={(event) => setTitle(event.target.value)}
                onBlur={saveTitle}
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); titleRef.current?.blur(); } }}
                className="mt-2 h-9 w-full rounded-none border-0 border-b border-transparent bg-transparent px-0 py-0 text-sm font-medium text-text shadow-none transition-colors duration-150 placeholder:font-normal placeholder:text-text-subtle hover:border-border focus:border-primary focus:ring-0"
              />
            </div>
            <div className="wl-steps-meta flex shrink-0 flex-col items-end gap-1.5 text-sm">
              {dayType === "Work" ? (
                <span className="wl-progress" aria-label={`${stepsDone} of ${steps.length} steps done`}>
                  <span className="wl-progress-bars" aria-hidden="true">{steps.map((done, index) => <i key={index} className={cn(done && "is-on")} />)}</span>
                  {stepsDone} of {steps.length}
                </span>
              ) : null}
              <SaveStatusIndicator />
            </div>
          </header>

          {dayType !== "Work" ? (
            <section aria-label="Day off" className="wl-off flex flex-col items-start gap-3 p-6 md:p-8">
              <span className="grid size-11 place-items-center rounded-xl bg-sidebar text-sidebar-fg" aria-hidden="true">
                {dayType === "Holiday" ? <Sun className="size-5" /> : <Plane className="size-5" />}
              </span>
              <h2 className="text-xl font-semibold text-text">This day is marked as {DAY_LABEL[dayType].toLowerCase()}.</h2>
              <p className="max-w-[60ch] text-sm text-text-muted">Nothing to log on a day off. If you did work, switch back. Anything already written is kept.</p>
              <Button variant="secondary" onClick={() => changeDayType("Work")} loading={renaming}>I worked that day</Button>
            </section>
          ) : null}

          <div className={dayType !== "Work" ? "hidden" : "flex min-w-0 flex-col"}>
            <MeetingSection workLogId={workLog.id} dateKey={workLog.date.toISOString().slice(0, 10)} meetings={workLog.meetings} step={1} onProgressChange={onMeetingsProgress} />

            {ticketsEnabled ? (
              <section aria-labelledby="tickets-heading" className="wl-card">
                <StepHeading id="tickets-heading" step={2} done={ticketsWritten} title="Tickets you worked on" hint="Add only the tickets you touched today, then write a line for each." />
                <div className="wl-step-body flex flex-col gap-2.5">
                  {tickets.map((ticket) => <TicketWorkCard key={ticket.id} workLogId={workLog.id} ticket={ticket} onSaveWork={saveWork} onDetach={detach} onHistoryLoaded={updateHistory} onSaveProject={saveProject} />)}
                  <TicketSearch attachedKeys={tickets.map((ticket) => ticket.ticketKey)} onAttach={attach} onFocusAttached={(ticketKey) => focusTicket(ticketKey)} />
                </div>
              </section>
            ) : null}

            <LearningSection workLogId={workLog.id} initialNotes={workLog.learningNotes} step={ticketsEnabled ? 3 : 2} onFilledChange={setLearningWritten} />
            <AttachmentsSection workLogId={workLog.id} initial={workLog.attachments} onCountChange={setAttachmentCount} />
            <FinishBar workLogId={workLog.id} canFinish={anything} skipBeaconRef={skipBeaconRef} />
          </div>
        </article>

        <DayTodos date={dayTodos.date} todos={dayTodos.todos} compact />
      </div>
    </SaveStatusProvider>
  );
}

/**
 * Finish day: wait for every autosave to land, then open the view page, which
 * refreshes the AI summary and offers Copy. Nothing is stored as "finished" —
 * a log with content already counts as logged on the sprint strip.
 */
function FinishBar({ workLogId, canFinish, skipBeaconRef }: { workLogId: string; canFinish: boolean; skipBeaconRef: React.RefObject<boolean> }) {
  const router = useRouter();
  const { pendingCount, savingCount, error } = useSaveState();
  const [finishing, setFinishing] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!finishing) return;
    // A failed save keeps you here; the message below says why.
    if (error || pendingCount > 0 || savingCount > 0) return;
    skipBeaconRef.current = true;
    toast.success("Day logged");
    router.push(`/work-logs/${workLogId}?finished=1`);
  }, [finishing, pendingCount, savingCount, error, router, workLogId, skipBeaconRef]);

  const shown = finishing && error ? `Couldn't save: ${error}` : message;

  return (
    <div className="wl-finish">
      <p className={cn("min-w-0 flex-1 text-sm", shown ? "font-semibold text-danger" : "text-text-muted")} role={shown ? "alert" : undefined}>
        {shown || "Saved as you type. Finish when you're done to get your standup summary."}
      </p>
      <Button
        size="lg"
        loading={finishing && !error}
        onClick={() => {
          if (!canFinish) { setMessage("Write at least one line first: a meeting, a ticket or anything else."); return; }
          setMessage("");
          // Clicking blurs the field being typed in, which flushes its save.
          setFinishing(true);
        }}
      >
        Finish day
        <Check aria-hidden="true" />
      </Button>
    </div>
  );
}

/** Opens Quick log on this day (2026-11-20): rough notes in, Review, Apply appends here. */
function PasteNotesButton({ date }: { date: string }) {
  const { open } = useQuickLog();
  return (
    <button type="button" onClick={() => open({ kind: "worklog", date })} className="inline-flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-border-strong bg-surface px-4 text-sm font-semibold text-text transition-colors duration-150 hover:bg-surface-2 md:h-10">
      <ClipboardPaste className="size-4" aria-hidden="true" />Paste notes instead
    </button>
  );
}

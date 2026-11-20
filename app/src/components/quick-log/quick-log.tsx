"use client";

import { ArrowLeft, Check, ChevronDown, CircleCheck, LayoutTemplate, MessageSquareShare, NotebookPen, Pencil, Sparkles, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState, useTransition, type ReactNode } from "react";

import { applyQuickLog, draftQuickLog, getWorkLogTemplate } from "@/actions/quick-log";
import { cn } from "@/components/cn";
import type { DraftFollowUp, DraftMeeting, DraftTicket, DraftTodo, QuickLogDraft, QuickLogKind } from "@/components/quick-log/types";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TICKET_STATUS_LABELS, TICKET_STATUS_ORDER } from "@/components/ui/ticket-status-badge";
import { toast } from "@/components/ui/toast";
import type { WorkflowStatus } from "@/lib/workflow-status";

/**
 * Quick log — paste rough text (tabs pick Work log / To-dos / Follow-ups; chips
 * pick the day), review what the AI read out of it, then apply. Two steps since
 * 2026-11-20 (was Choose → Paste → Review). Nothing is saved before "Apply";
 * every row can be unticked or edited first. Server side: actions/quick-log.ts → lib/quick-log.ts.
 *
 * Mounted once in AppShell; `useQuickLog().open()` opens it from anywhere
 * (the nav button and the Work Logs page header).
 */

/** What to open on: the tab, the log's day (YYYY-MM-DD, work log only) and pre-filled text. */
export type QuickLogOpen = { kind?: QuickLogKind; date?: string; text?: string };
type Ctx = { open: (options?: QuickLogOpen) => void };
const QuickLogContext = createContext<Ctx | null>(null);

export function useQuickLog() {
  const ctx = useContext(QuickLogContext);
  if (!ctx) throw new Error("useQuickLog must be used inside QuickLogProvider");
  return ctx;
}

export function QuickLogProvider({ ticketsEnabled, children }: { ticketsEnabled: boolean; children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; kind: QuickLogKind; date: string | null; text: string; session: number }>({ open: false, kind: "worklog", date: null, text: "", session: 0 });
  // Each opener says where it opens (the Tracker → To-dos, a day page → that day); no option = a work log for today.
  const open = useCallback((options?: QuickLogOpen) => setState((s) => ({ open: true, kind: options?.kind ?? "worklog", date: options?.date ?? null, text: options?.text ?? "", session: s.open ? s.session : s.session + 1 })), []);
  const ctx = useMemo(() => ({ open }), [open]);
  return (
    <QuickLogContext.Provider value={ctx}>
      {children}
      {/* Keyed per opening so every session starts clean. */}
      <QuickLogDialog
        key={state.session}
        open={state.open}
        initialKind={state.kind}
        initialDate={state.date}
        initialText={state.text}
        ticketsEnabled={ticketsEnabled}
        onClose={() => setState((s) => ({ ...s, open: false }))}
      />
    </QuickLogContext.Provider>
  );
}

// ---------------------------------------------------------------------------

const KINDS: Array<{ kind: QuickLogKind; label: string; icon: typeof NotebookPen }> = [
  { kind: "worklog", label: "Work log", icon: NotebookPen },
  { kind: "todo", label: "To-dos", icon: CircleCheck },
  { kind: "followup", label: "Follow-ups", icon: MessageSquareShare },
];

const KIND_HINT = (ticketsEnabled: boolean): Record<QuickLogKind, string> => ({
  worklog: ticketsEnabled ? "Meetings, tickets and work done for a day" : "Meetings and work done for a day",
  todo: "One per line, with due dates if you like",
  followup: "Things you asked someone and are waiting on",
});

/** A short, light hint in the empty box; the full example sits behind "Show an example". */
const PLACEHOLDER = (ticketsEnabled: boolean): Record<QuickLogKind, string> => ({
  worklog: ticketsEnabled ? "Meetings, tickets, what you did… in any order." : "Meetings and what you did… in any order.",
  todo: "One to-do per line. Add \"tomorrow\" or a weekday for a due date.",
  followup: "One per line, with the person's name.",
});

const EXAMPLE = (ticketsEnabled: boolean): Record<QuickLogKind, string> => ({
  worklog: ticketsEnabled
    ? "For ASU meeting I said the catalogue import is done, need prod access\nFor Veritech meeting I said demo moves to Friday\n\nTickets I worked on\n1233 same status, worked on UI, waiting for confirmation\nASU-1240 checkout banner fix, sent to QA\n\nAlso reviewed the release notes"
    : "For ASU meeting I said the catalogue import is done, need prod access\nFor Veritech meeting I said demo moves to Friday\n\nFixed the checkout banner and reviewed the release notes",
  todo: "Send timesheet by Friday\nPrepare sprint demo tomorrow\nRenew SSL cert",
  followup: "Asked Ravi for the API keys on Slack\nMailed Priya about the QA environment, no reply yet",
});

/** Local calendar day as YYYY-MM-DD. */
function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Today, or Friday when it's the weekend — logs are weekday-only. */
function defaultLogDay() {
  const date = new Date();
  if (date.getDay() === 0) date.setDate(date.getDate() - 2);
  if (date.getDay() === 6) date.setDate(date.getDate() - 1);
  return dayKey(date);
}

/** The weekday before `key` (YYYY-MM-DD). */
function previousWeekday(key: string) {
  const date = new Date(`${key}T00:00:00`);
  do date.setDate(date.getDate() - 1); while (date.getDay() === 0 || date.getDay() === 6);
  return dayKey(date);
}

function formatDay(key: string) {
  return new Date(`${key}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

type Incl<T> = T & { include: boolean };
/** `confirmed`: the user picked one of several matching tickets. */
type ReviewTicket = Incl<DraftTicket> & { confirmed?: boolean };
type Review =
  | { kind: "worklog"; date: string; logExists: boolean; meetings: Incl<DraftMeeting>[]; tickets: ReviewTicket[]; workDone: Incl<{ text: string }>; followUps: Incl<DraftFollowUp>[]; channels: string[]; model: string }
  | { kind: "todo"; todos: Incl<DraftTodo>[]; model: string | null; fallbackReason?: string }
  | { kind: "followup"; followUps: Incl<DraftFollowUp>[]; channels: string[]; model: string };

function toReview(draft: QuickLogDraft): Review {
  const on = <T,>(items: T[], include = true) => items.map((item) => ({ ...item, include }));
  if (draft.kind === "worklog") {
    return {
      ...draft,
      meetings: on(draft.meetings),
      tickets: on(draft.tickets),
      workDone: { text: draft.workDone, include: Boolean(draft.workDone) },
      // Suggestions: the user opts in.
      followUps: on(draft.followUps, false),
    };
  }
  if (draft.kind === "todo") return { ...draft, todos: on(draft.todos) };
  return { ...draft, followUps: on(draft.followUps) };
}

function includedCount(review: Review) {
  const n = (items: Array<{ include: boolean }>) => items.filter((item) => item.include).length;
  if (review.kind === "worklog") return n(review.meetings) + n(review.tickets) + (review.workDone.include ? 1 : 0) + n(review.followUps);
  return review.kind === "todo" ? n(review.todos) : n(review.followUps);
}

function QuickLogDialog({
  open,
  initialKind,
  initialDate,
  initialText,
  ticketsEnabled,
  onClose,
}: {
  open: boolean;
  initialKind: QuickLogKind;
  initialDate: string | null;
  initialText: string;
  ticketsEnabled: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const ids = useId();
  const [step, setStep] = useState<"paste" | "review">("paste");
  const [kind, setKind] = useState<QuickLogKind>(initialKind);
  const [text, setText] = useState(initialText);
  const [date, setDate] = useState(() => initialDate ?? defaultLogDay());
  const [showExample, setShowExample] = useState(false);
  // The native <dialog> puts focus on Close when it opens; start typing in the box instead.
  useEffect(() => {
    if (!open || step !== "paste") return;
    const timer = window.setTimeout(() => document.getElementById(`${ids}-text`)?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open, step, ids]);
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState<string>();
  const [reading, startReading] = useTransition();
  const [applying, startApplying] = useTransition();
  const [templating, startTemplating] = useTransition();

  /** Headings for the day's meetings and Work done — easier for free models to read. */
  function applyTemplate() {
    startTemplating(async () => {
      const result = await getWorkLogTemplate({ date });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(undefined);
      setText(result.data);
    });
  }

  function read() {
    if (!text.trim()) {
      setError("Paste some text first");
      return;
    }
    if (kind === "worklog" && !date) {
      setError("Choose the log's day");
      return;
    }
    setError(undefined);
    startReading(async () => {
      const result = await draftQuickLog({ kind, text, date: kind === "worklog" ? date : dayKey(new Date()), today: dayKey(new Date()) });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setReview(toReview(result.data));
      setStep("review");
    });
  }

  function apply() {
    if (!review) return;
    if (includedCount(review) === 0) {
      setError("Tick at least one change to apply");
      return;
    }
    const followUps = review.kind === "todo" ? [] : review.followUps.filter((item) => item.include);
    if (followUps.some((item) => !item.person.trim())) {
      setError("Add who each follow-up is with, or untick it");
      return;
    }
    const payload =
      review.kind === "worklog"
        ? {
            kind: "worklog" as const,
            date: review.date,
            meetings: review.meetings.filter((m) => m.include).map(({ name, notes }) => ({ name, notes })),
            tickets: review.tickets
              .filter((t) => t.include)
              .map((t) => ({ key: t.key, title: t.title || undefined, projectName: t.projectName || undefined, status: t.status, update: t.update })),
            workDone: review.workDone.include ? review.workDone.text : "",
            followUps: followUps.map(({ person, subject, note, channel }) => ({ person, subject, note, channel })),
          }
        : review.kind === "todo"
          ? { kind: "todo" as const, todos: review.todos.filter((t) => t.include).map(({ subject, dueDate }) => ({ subject, dueDate })) }
          : { kind: "followup" as const, followUps: followUps.map(({ person, subject, note, channel }) => ({ person, subject, note, channel })) };

    setError(undefined);
    startApplying(async () => {
      const result = await applyQuickLog(payload);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      const { count, workLogId } = result.data;
      toast.success(`${count} ${count === 1 ? "change" : "changes"} saved`);
      onClose();
      if (workLogId) router.push(`/work-logs/${workLogId}`);
      else router.push(kind === "todo" ? "/tracker?view=todo" : "/tracker?view=followups");
    });
  }

  const busy = reading || applying;
  const count = review ? includedCount(review) : 0;

  const footer =
    step === "paste" ? (
      <>
        <p className="mr-auto hidden text-sm text-text-muted md:block">Nothing is saved until you review it and click Apply.</p>
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={read} loading={reading} className="max-md:flex-1">
          {reading ? null : <Sparkles aria-hidden="true" />}
          {reading ? "Reading…" : "Read my notes"}
        </Button>
      </>
    ) : (
      <>
        <Button variant="secondary" onClick={() => { setError(undefined); setStep("paste"); }} disabled={busy}>
          <ArrowLeft aria-hidden="true" />
          Edit notes
        </Button>
        <Button onClick={apply} loading={applying} disabled={count === 0} className="max-md:flex-1">
          {applying ? null : <Check aria-hidden="true" />}
          {count === 0 ? "Nothing ticked" : `Apply ${count} ${count === 1 ? "change" : "changes"}`}
        </Button>
      </>
    );

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      // A normal popup while pasting, wide for Review; a full-screen sheet on phones (2026-11-20).
      size={step === "review" ? "xl" : "lg"}
      sheetOnPhone
      eyebrow={<Steps step={step} />}
      title={<span className="inline-flex items-center gap-2"><Zap className="size-5 text-accent-text" aria-hidden="true" />Quick log</span>}
      footer={footer}
    >
      {step === "paste" ? (
        <div className="flex w-full flex-col gap-4">
          {/* What to create: tabs, not a separate step. */}
          <div role="group" aria-label="What to create" className="ql-tabs">
            {KINDS.map(({ kind: option, label, icon: Icon }) => (
              <button key={option} type="button" aria-pressed={kind === option} title={KIND_HINT(ticketsEnabled)[option]} onClick={() => { setKind(option); setError(undefined); setShowExample(false); }}>
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
          {kind === "worklog" ? <DayChips value={date} onChange={setDate} /> : null}
          <Field label={kind === "worklog" ? `Your notes for ${date === dayKey(new Date()) ? "today" : formatDay(date)}` : kind === "todo" ? "Your to-dos, one per line" : "Who you're waiting on, or who's waiting on you"} htmlFor={`${ids}-text`} error={error}>
            <Textarea
              id={`${ids}-text`}
              rows={8}
              value={text}
              autoFocus
              placeholder={PLACEHOLDER(ticketsEnabled)[kind]}
              onChange={(event) => { setText(event.target.value); setError(undefined); }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); read(); }
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${ids}-text-error` : undefined}
              className="ql-notes"
            />
          </Field>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="mr-auto text-sm text-text-subtle">
              {reading
                ? "Reading your notes — free AI models can take up to a minute."
                : "Write it however you like. ⌘/Ctrl + Enter reads it."}
            </p>
            <button type="button" onClick={() => setShowExample((value) => !value)} aria-expanded={showExample} className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 text-sm font-semibold text-accent-text hover:underline">
              <Sparkles className="size-3.5" aria-hidden="true" />{showExample ? "Hide example" : "Show an example"}
            </button>
            {kind === "worklog" && !text.trim() ? (
              <Button variant="outline" size="sm" onClick={applyTemplate} loading={templating} disabled={reading}>
                {templating ? null : <LayoutTemplate aria-hidden="true" />}
                Use template
              </Button>
            ) : null}
          </div>
          {showExample ? (
            <div className="flex flex-col items-start gap-2">
              <pre className="w-full overflow-x-auto rounded-xl border border-border bg-surface-2 p-3 font-mono text-sm leading-relaxed whitespace-pre-wrap text-text-muted">{EXAMPLE(ticketsEnabled)[kind]}</pre>
              <Button variant="outline" size="sm" onClick={() => { setText(EXAMPLE(ticketsEnabled)[kind]); setShowExample(false); setError(undefined); document.getElementById(`${ids}-text`)?.focus(); }}>Use this example</Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {step === "review" && review ? (
        // What you pasted on the left, the draft on the right (from lg).
        <div className="mx-auto grid w-full max-w-6xl items-start gap-6 lg:grid-cols-[minmax(0,1fr)_3rem_minmax(0,1.15fr)]">
          <section aria-label="What you pasted" className="hidden flex-col gap-2 lg:sticky lg:top-0 lg:flex">
            <p className="text-sm font-semibold tracking-[0.08em] text-text-muted uppercase">What you pasted</p>
            <pre className="max-h-[60dvh] overflow-auto rounded-2xl bg-text p-5 font-mono text-sm leading-relaxed whitespace-pre-wrap text-primary-subtle">{text}</pre>
          </section>
          <span aria-hidden="true" className="hidden size-11 place-items-center self-center rounded-full bg-primary text-xl text-primary-fg shadow-button lg:grid">→</span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-base text-text-muted">
            Here&apos;s what will change. Untick anything you don&apos;t want, or edit it first.
          </p>
          {review.kind === "todo" && review.fallbackReason ? (
            <p className="mt-2 rounded-lg bg-warning-subtle px-3 py-2 text-sm text-warning">
              {review.fallbackReason} Each line became a to-do without a due date — add dates below if you need them.
            </p>
          ) : null}
          <ReviewBody review={review} setReview={setReview} ticketsEnabled={ticketsEnabled} />
          {error ? <p role="alert" className="mt-3 text-sm font-medium text-danger">{error}</p> : null}
          {review.model ? <p className="mt-4 text-xs text-text-subtle">Read by {review.model}</p> : null}
        </div>
        </div>
      ) : null}
    </Modal>
  );
}

/**
 * Today · Yesterday · Older (the last six weekdays before yesterday). Logs are
 * weekday-only and never in the future, so these are the only days on offer;
 * the server still checks.
 */
function DayChips({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const today = defaultLogDay();
  const yesterday = previousWeekday(today);
  const older: string[] = [];
  for (let day = yesterday; older.length < 6;) { day = previousWeekday(day); older.push(day); }
  const isOlder = value !== today && value !== yesterday;
  const [showOlder, setShowOlder] = useState(false);
  const chip = (day: string, label: string) => (
    <button key={day} type="button" className="ql-day" aria-pressed={value === day} onClick={() => { onChange(day); setShowOlder(false); }}>
      {label} <small>{formatDay(day)}</small>
    </button>
  );
  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold text-text" id="ql-day-label">Which day?</p>
      <div role="group" aria-labelledby="ql-day-label" className="flex flex-wrap gap-1.5">
        {chip(today, today === dayKey(new Date()) ? "Today" : "Friday")}
        {chip(yesterday, today === dayKey(new Date()) ? "Yesterday" : "Thursday")}
        <button type="button" className="ql-day" aria-pressed={isOlder} aria-expanded={showOlder} onClick={() => setShowOlder((open) => !open)}>
          {isOlder ? formatDay(value) : "Older"}
          <ChevronDown className={cn("size-3.5 transition-transform duration-150", showOlder && "rotate-180")} aria-hidden="true" />
        </button>
      </div>
      {showOlder ? (
        <div role="group" aria-label="Older days" className="mt-2 flex flex-wrap gap-1.5 rounded-xl border border-dashed border-border-strong bg-surface-2 p-2">
          {older.map((day) => (
            <button key={day} type="button" className="ql-day ql-day-sm" aria-pressed={value === day} onClick={() => { onChange(day); setShowOlder(false); }}>{formatDay(day)}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Steps({ step }: { step: "paste" | "review" }) {
  const steps = [["paste", "Paste"], ["review", "Review"]] as const;
  return (
    <ol className="flex items-center gap-2 text-sm" aria-label="Steps">
      {steps.map(([key, label], index) => (
        <li key={key} className={cn("flex items-center gap-2", key === step ? "font-semibold text-accent-text" : "text-text-subtle")} aria-current={key === step ? "step" : undefined}>
          {index > 0 ? <span aria-hidden="true" className="text-text-subtle">·</span> : null}
          {index + 1} {label}
        </li>
      ))}
    </ol>
  );
}

// --- review -----------------------------------------------------------------

type Tone = "new" | "update" | "check";
const TONE_CLASS: Record<Tone, string> = {
  new: "bg-success-subtle text-success",
  update: "bg-primary-subtle text-accent-text",
  check: "bg-warning-subtle text-warning",
};

function ReviewBody({ review, setReview, ticketsEnabled }: { review: Review; setReview: (r: Review) => void; ticketsEnabled: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);
  const toggleEdit = (key: string) => setEditing((current) => (current === key ? null : key));

  if (review.kind === "todo") {
    const set = (i: number, patch: Partial<Incl<DraftTodo>>) => setReview({ ...review, todos: review.todos.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
    if (!review.todos.length) return <Empty />;
    return (
      <Section title="To-dos">
        {review.todos.map((todo, i) => (
          <ReviewRow
            key={i}
            id={`todo-${i}`}
            checked={todo.include}
            onCheck={(include) => set(i, { include })}
            title={todo.subject}
            tone="new"
            pill="New"
            detail={todo.dueDate ? `Due ${formatDay(todo.dueDate)}` : "No date (Someday)"}
            editing={editing === `todo-${i}`}
            onEdit={() => toggleEdit(`todo-${i}`)}
          >
            <Field label="To-do" htmlFor={`qt-${i}`}>
              <Input id={`qt-${i}`} value={todo.subject} onChange={(e) => set(i, { subject: e.target.value })} />
            </Field>
            <Field label="Due date" htmlFor={`qd-${i}`}>
              <Input id={`qd-${i}`} type="date" value={todo.dueDate ?? ""} onChange={(e) => set(i, { dueDate: e.target.value || null })} className="max-w-56" />
            </Field>
          </ReviewRow>
        ))}
      </Section>
    );
  }

  if (review.kind === "followup") {
    const set = (i: number, patch: Partial<Incl<DraftFollowUp>>) => setReview({ ...review, followUps: review.followUps.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
    if (!review.followUps.length) return <Empty />;
    return (
      <Section title="Follow-ups">
        {review.followUps.map((item, i) => (
          <FollowUpRow key={i} id={`fu-${i}`} item={item} tone={item.person ? "new" : "check"} pill={item.person ? "New" : "Who?"} channels={review.channels} set={(patch) => set(i, patch)} editing={editing === `fu-${i}`} onEdit={() => toggleEdit(`fu-${i}`)} />
        ))}
      </Section>
    );
  }

  const patch = (next: Partial<Extract<Review, { kind: "worklog" }>>) => setReview({ ...review, ...next });
  const setMeeting = (i: number, p: Partial<Incl<DraftMeeting>>) => patch({ meetings: review.meetings.map((m, j) => (j === i ? { ...m, ...p } : m)) });
  const setTicket = (i: number, p: Partial<ReviewTicket>) => patch({ tickets: review.tickets.map((t, j) => (j === i ? { ...t, ...p } : t)) });
  const setFollowUp = (i: number, p: Partial<Incl<DraftFollowUp>>) => patch({ followUps: review.followUps.map((f, j) => (j === i ? { ...f, ...p } : f)) });
  const nothing = !review.meetings.length && !review.tickets.length && !review.workDone.text && !review.followUps.length;

  return (
    <>
      <Section title="Log">
        <div className="flex items-center gap-2 py-2 text-base">
          <span className="font-semibold text-text">{formatDay(review.date)}</span>
          <Pill tone={review.logExists ? "update" : "new"}>{review.logExists ? "Adding to this day" : "New log"}</Pill>
        </div>
      </Section>
      {nothing ? <Empty /> : null}

      {review.meetings.length ? (
        <Section title="Meetings">
          {review.meetings.map((meeting, i) => (
            <ReviewRow
              key={i}
              id={`m-${i}`}
              checked={meeting.include}
              onCheck={(include) => setMeeting(i, { include })}
              title={meeting.name}
              tone={meeting.existing ? "update" : "new"}
              pill={meeting.existing ? "Notes added" : "New meeting"}
              detail={meeting.notes}
              editing={editing === `m-${i}`}
              onEdit={() => toggleEdit(`m-${i}`)}
            >
              <Field label="Meeting" htmlFor={`mn-${i}`}>
                <Input id={`mn-${i}`} value={meeting.name} onChange={(e) => setMeeting(i, { name: e.target.value })} />
              </Field>
              <Field label="Notes" htmlFor={`mt-${i}`}>
                <Textarea id={`mt-${i}`} rows={3} value={meeting.notes} onChange={(e) => setMeeting(i, { notes: e.target.value })} />
              </Field>
            </ReviewRow>
          ))}
        </Section>
      ) : null}

      {ticketsEnabled && review.tickets.length ? (
        <Section title="Tickets">
          {review.tickets.map((ticket, i) => {
            const changed = ticket.exists && ticket.currentStatus !== ticket.status;
            const unsure = ticket.candidates.length > 0 && !ticket.confirmed;
            const statusLine = !ticket.exists
              ? `New ticket · ${TICKET_STATUS_LABELS[ticket.status]}`
              : changed
                ? `${TICKET_STATUS_LABELS[ticket.currentStatus!]} → ${TICKET_STATUS_LABELS[ticket.status]}`
                : `Status stays ${TICKET_STATUS_LABELS[ticket.status]}`;
            return (
              <ReviewRow
                key={i}
                id={`t-${i}`}
                checked={ticket.include}
                onCheck={(include) => setTicket(i, { include })}
                title={ticket.title && ticket.title !== ticket.key ? `${ticket.key} · ${ticket.title}` : ticket.key}
                tone={unsure ? "check" : ticket.exists ? "update" : "new"}
                pill={unsure ? "Check ticket" : ticket.exists ? "Update" : "New ticket"}
                detail={[
                  unsure ? `Several tickets end in ${ticket.written} — edit to pick the right one.` : null,
                  statusLine,
                  ticket.update,
                ].filter(Boolean).join("\n")}
                editing={editing === `t-${i}`}
                onEdit={() => toggleEdit(`t-${i}`)}
              >
                {ticket.candidates.length ? (
                  <Field label="Ticket" htmlFor={`tk-${i}`}>
                    <Select
                      id={`tk-${i}`}
                      value={ticket.confirmed ? ticket.key : ""}
                      onChange={(e) => {
                        const pick = ticket.candidates.find((c) => c.key === e.target.value);
                        if (pick) setTicket(i, { key: pick.key, title: pick.title, currentStatus: pick.status, status: ticket.status === ticket.currentStatus ? pick.status : ticket.status, confirmed: true });
                      }}
                    >
                      {ticket.confirmed ? null : <option value="" disabled>Pick the right ticket</option>}
                      {ticket.candidates.map((c) => (
                        <option key={c.key} value={c.key}>{`${c.key} · ${c.title}`}</option>
                      ))}
                    </Select>
                  </Field>
                ) : !ticket.exists ? (
                  <div className="grid gap-3 md:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
                    <Field label="Ticket ID" htmlFor={`tk-${i}`}>
                      <Input id={`tk-${i}`} value={ticket.key} onChange={(e) => setTicket(i, { key: e.target.value.replace(/\s+/g, "").toUpperCase() })} />
                    </Field>
                    <Field label="Title" htmlFor={`tt-${i}`}>
                      <Input id={`tt-${i}`} value={ticket.title} placeholder="Checkout banner fix" onChange={(e) => setTicket(i, { title: e.target.value })} />
                    </Field>
                  </div>
                ) : null}
                <Field label="Status" htmlFor={`ts-${i}`}>
                  <Select id={`ts-${i}`} value={ticket.status} onChange={(e) => setTicket(i, { status: e.target.value as WorkflowStatus })}>
                    {TICKET_STATUS_ORDER.map((status) => (
                      <option key={status} value={status}>{TICKET_STATUS_LABELS[status]}{ticket.exists && status === ticket.currentStatus ? " (current)" : ""}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Work done today" htmlFor={`tu-${i}`}>
                  <Textarea id={`tu-${i}`} rows={3} value={ticket.update} onChange={(e) => setTicket(i, { update: e.target.value })} />
                </Field>
              </ReviewRow>
            );
          })}
        </Section>
      ) : null}

      {review.workDone.text ? (
        <Section title="Work done">
          <ReviewRow
            id="wd"
            checked={review.workDone.include}
            onCheck={(include) => patch({ workDone: { ...review.workDone, include } })}
            title="Work done"
            tone={review.logExists ? "update" : "new"}
            pill="Added"
            detail={review.workDone.text}
            editing={editing === "wd"}
            onEdit={() => toggleEdit("wd")}
          >
            <Field label="Work done" htmlFor="wd-text">
              <Textarea id="wd-text" rows={4} value={review.workDone.text} onChange={(e) => patch({ workDone: { ...review.workDone, text: e.target.value } })} />
            </Field>
          </ReviewRow>
        </Section>
      ) : null}

      {review.followUps.length ? (
        <Section title="Suggested follow-ups">
          {review.followUps.map((item, i) => (
            <FollowUpRow key={i} id={`sfu-${i}`} item={item} tone="check" pill="Optional" channels={review.channels} set={(p) => setFollowUp(i, p)} editing={editing === `sfu-${i}`} onEdit={() => toggleEdit(`sfu-${i}`)} />
          ))}
        </Section>
      ) : null}
    </>
  );
}

function FollowUpRow({
  id,
  item,
  tone,
  pill,
  channels,
  set,
  editing,
  onEdit,
}: {
  id: string;
  item: Incl<DraftFollowUp>;
  tone: Tone;
  pill: string;
  channels: string[];
  set: (patch: Partial<Incl<DraftFollowUp>>) => void;
  editing: boolean;
  onEdit: () => void;
}) {
  return (
    <ReviewRow
      id={id}
      checked={item.include}
      onCheck={(include) => set({ include })}
      title={item.person ? `${item.person} · ${item.subject}` : item.subject}
      tone={tone}
      pill={pill}
      detail={[item.channel ? `${item.channel} · waiting on them` : null, item.note].filter(Boolean).join("\n")}
      editing={editing}
      onEdit={onEdit}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Who" htmlFor={`${id}-who`} required>
          <Input id={`${id}-who`} value={item.person} placeholder="Ravi" onChange={(e) => set({ person: e.target.value })} />
        </Field>
        <Field label="Where" htmlFor={`${id}-ch`}>
          <Select id={`${id}-ch`} value={item.channel} onChange={(e) => set({ channel: e.target.value })}>
            {(channels.includes(item.channel) ? channels : [item.channel, ...channels]).map((channel) => (
              <option key={channel} value={channel}>{channel}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Title" htmlFor={`${id}-subj`}>
        <Input id={`${id}-subj`} value={item.subject} onChange={(e) => set({ subject: e.target.value })} />
      </Field>
      <Field label="What you said" htmlFor={`${id}-note`}>
        <Textarea id={`${id}-note`} rows={2} value={item.note} onChange={(e) => set({ note: e.target.value })} />
      </Field>
    </ReviewRow>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className="mb-1 text-xs font-semibold tracking-[0.06em] text-text-subtle uppercase">{title}</h3>
      <div className="divide-y divide-border rounded-xl border border-border bg-surface px-3">{children}</div>
    </section>
  );
}

function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap", TONE_CLASS[tone])}>{children}</span>;
}

function ReviewRow({
  id,
  checked,
  onCheck,
  title,
  tone,
  pill,
  detail,
  editing,
  onEdit,
  children,
}: {
  id: string;
  checked: boolean;
  onCheck: (checked: boolean) => void;
  title: string;
  tone: Tone;
  pill: string;
  detail: string;
  editing: boolean;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <div className={cn("py-3", !checked && "opacity-60")}>
      <div className="flex items-start gap-3">
        <input
          id={`ql-${id}`}
          type="checkbox"
          checked={checked}
          onChange={(event) => onCheck(event.target.checked)}
          className="mt-1 size-4 shrink-0 cursor-pointer accent-[var(--c-primary)]"
        />
        <label htmlFor={`ql-${id}`} className="min-w-0 flex-1 cursor-pointer">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 text-base font-semibold break-words text-text">{title}</span>
            <Pill tone={tone}>{pill}</Pill>
          </span>
          {detail ? <span className="mt-1 line-clamp-4 block text-sm whitespace-pre-line text-text-muted">{detail}</span> : null}
        </label>
        <Button variant="ghost" size="sm" iconOnly onClick={onEdit} aria-expanded={editing} aria-label={editing ? "Done editing" : "Edit"} title={editing ? "Done editing" : "Edit"}>
          {editing ? <Check aria-hidden="true" /> : <Pencil aria-hidden="true" />}
        </Button>
      </div>
      {editing ? <div className="mt-3 flex flex-col gap-3 pl-7">{children}</div> : null}
    </div>
  );
}

function Empty() {
  return (
    <p className="mt-4 rounded-xl border border-dashed border-border-strong px-4 py-6 text-center text-base text-text-muted">
      Nothing to add was found in that text. Go back and add a little more detail.
    </p>
  );
}

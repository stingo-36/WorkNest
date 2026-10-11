"use client";

import { ArrowLeft, ArrowRight, Check, CircleCheck, LayoutTemplate, MessageSquareShare, NotebookPen, Pencil, Sparkles, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useId, useMemo, useState, useTransition, type ReactNode } from "react";

import { applyQuickLog, draftQuickLog, getWorkLogTemplate } from "@/actions/quick-log";
import { cn } from "@/components/cn";
import type { DraftFollowUp, DraftMeeting, DraftTicket, DraftTodo, QuickLogDraft, QuickLogKind } from "@/components/quick-log/types";
import { Button } from "@/components/ui/button";
import { bandField } from "@/components/shell/page-band";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TICKET_STATUS_LABELS, TICKET_STATUS_ORDER } from "@/components/ui/ticket-status-badge";
import { toast } from "@/components/ui/toast";
import type { WorkflowStatus } from "@/lib/workflow-status";

/**
 * Quick log — choose what to create, paste rough text, review what the AI read
 * out of it, then apply. Nothing is saved before "Apply"; every row can be
 * unticked or edited first. Server side: actions/quick-log.ts → lib/quick-log.ts.
 *
 * Mounted once in AppShell; `useQuickLog().open()` opens it from anywhere
 * (the nav button and the Work Logs page header).
 */

/** `text` pre-fills the paste step (the Work Logs quick-log bar). */
type Ctx = { open: (kind?: QuickLogKind, text?: string) => void };
const QuickLogContext = createContext<Ctx | null>(null);

export function useQuickLog() {
  const ctx = useContext(QuickLogContext);
  if (!ctx) throw new Error("useQuickLog must be used inside QuickLogProvider");
  return ctx;
}

export function QuickLogProvider({ ticketsEnabled, children }: { ticketsEnabled: boolean; children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; kind: QuickLogKind; text: string; session: number }>({ open: false, kind: "worklog", text: "", session: 0 });
  const open = useCallback((kind?: QuickLogKind, text?: string) => setState((s) => ({ open: true, kind: kind ?? s.kind, text: text ?? "", session: s.open ? s.session : s.session + 1 })), []);
  const ctx = useMemo(() => ({ open }), [open]);
  return (
    <QuickLogContext.Provider value={ctx}>
      {children}
      {/* Keyed per opening so every session starts clean. */}
      <QuickLogDialog
        key={state.session}
        open={state.open}
        initialKind={state.kind}
        initialText={state.text}
        ticketsEnabled={ticketsEnabled}
        onClose={() => setState((s) => ({ ...s, open: false }))}
      />
    </QuickLogContext.Provider>
  );
}

/** `nav`: compact (icon until xl). `page`: labelled secondary button. */
export function QuickLogButton({ variant = "page", kind }: { variant?: "nav" | "page" | "band"; kind?: QuickLogKind }) {
  const { open } = useQuickLog();
  if (variant === "band") {
    // On a page's slate header band: the nav's idle-pill look (2026-10-09).
    return (
      <button type="button" onClick={() => open(kind)} className={`${bandField} inline-flex cursor-pointer items-center gap-2 font-semibold`}>
        <Zap className="size-4" aria-hidden="true" />
        Quick log
      </button>
    );
  }
  if (variant === "nav") {
    return (
      <Button
        size="md"
        onClick={() => open(kind)}
        aria-label="Quick log"
        title="Quick log — paste your notes"
        className="size-11 px-0 md:size-9 xl:w-auto xl:px-3.5"
      >
        <Zap aria-hidden="true" />
        <span className="hidden xl:inline">Quick log</span>
      </Button>
    );
  }
  return (
    <Button variant="secondary" onClick={() => open(kind)}>
      <Zap aria-hidden="true" />
      Quick log
    </Button>
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

const PLACEHOLDER = (ticketsEnabled: boolean): Record<QuickLogKind, string> => ({
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
  initialText,
  ticketsEnabled,
  onClose,
}: {
  open: boolean;
  initialKind: QuickLogKind;
  initialText: string;
  ticketsEnabled: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const ids = useId();
  // Arriving with text skips "choose": the bar already said it's a work log.
  const [step, setStep] = useState<"choose" | "paste" | "review">(initialText ? "paste" : "choose");
  const [kind, setKind] = useState<QuickLogKind>(initialKind);
  const [text, setText] = useState(initialText);
  const [date, setDate] = useState(defaultLogDay);
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState<string>();
  const [reading, startReading] = useTransition();
  const [applying, startApplying] = useTransition();
  const [templating, startTemplating] = useTransition();

  /** Headings for the day's meetings and open tickets — easier for free models to read. */
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
    step === "choose" ? (
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => { setError(undefined); setStep("paste"); }}>
          Continue
          <ArrowRight aria-hidden="true" />
        </Button>
      </>
    ) : step === "paste" ? (
      <>
        <Button variant="secondary" onClick={() => { setError(undefined); setStep("choose"); }} disabled={busy}>
          <ArrowLeft aria-hidden="true" />
          Back
        </Button>
        <Button onClick={read} loading={reading}>
          {reading ? null : <Sparkles aria-hidden="true" />}
          {reading ? "Reading…" : "Read my text"}
        </Button>
      </>
    ) : (
      <>
        <Button variant="secondary" onClick={() => { setError(undefined); setStep("paste"); }} disabled={busy}>
          <ArrowLeft aria-hidden="true" />
          Edit text
        </Button>
        <Button onClick={apply} loading={applying} disabled={count === 0}>
          {applying ? null : <Check aria-hidden="true" />}
          {count === 0 ? "Nothing ticked" : `Apply ${count} ${count === 1 ? "change" : "changes"}`}
        </Button>
      </>
    );

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      size="lg"
      eyebrow={<Steps step={step} />}
      title="Quick log"
      footer={footer}
    >
      {step === "choose" ? (
        <fieldset>
          <legend className="mb-3 text-base text-text-muted">What do you want to create?</legend>
          <div className="grid gap-3 md:grid-cols-3">
            {KINDS.map(({ kind: option, label, icon: Icon }) => (
              <label
                key={option}
                className={cn(
                  "flex cursor-pointer flex-col gap-1.5 rounded-xl border border-border-strong bg-surface p-4 transition-colors duration-150 ease-standard",
                  "hover:border-primary/60 hover:bg-surface-2",
                  "has-[:checked]:border-primary has-[:checked]:bg-primary-subtle has-[:checked]:ring-1 has-[:checked]:ring-primary",
                  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                )}
              >
                <input
                  type="radio"
                  name={`${ids}-kind`}
                  value={option}
                  checked={kind === option}
                  onChange={() => setKind(option)}
                  className="sr-only"
                />
                <Icon className="size-5 text-accent-text" aria-hidden="true" />
                <span className="text-md font-semibold text-text">{label}</span>
                <span className="text-sm leading-snug text-text-muted">{KIND_HINT(ticketsEnabled)[option]}</span>
              </label>
            ))}
          </div>
          <p className="mt-4 text-sm text-text-subtle">Nothing is saved until you review it and click Apply.</p>
        </fieldset>
      ) : null}

      {step === "paste" ? (
        <div className="flex flex-col gap-4">
          {kind === "worklog" ? (
            <Field label="Log day" htmlFor={`${ids}-date`} hint="Weekdays only; today or earlier.">
              <Input
                id={`${ids}-date`}
                type="date"
                value={date}
                max={dayKey(new Date())}
                onChange={(event) => setDate(event.target.value)}
                className="max-w-56"
              />
            </Field>
          ) : null}
          <Field label={`Your ${KINDS.find((k) => k.kind === kind)!.label.toLowerCase()} notes`} htmlFor={`${ids}-text`} error={error}>
            <Textarea
              id={`${ids}-text`}
              rows={9}
              value={text}
              autoFocus
              placeholder={PLACEHOLDER(ticketsEnabled)[kind]}
              onChange={(event) => { setText(event.target.value); setError(undefined); }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); read(); }
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${ids}-text-error` : undefined}
            />
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="text-sm text-text-subtle">
              {reading
                ? "Reading your notes — free AI models can take up to a minute."
                : "Write it however you like. ⌘/Ctrl + Enter to read it."}
            </p>
            {kind === "worklog" && !text.trim() ? (
              <Button variant="outline" size="sm" onClick={applyTemplate} loading={templating} disabled={reading}>
                {templating ? null : <LayoutTemplate aria-hidden="true" />}
                Use template
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {step === "review" && review ? (
        <div className="flex flex-col gap-1">
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
      ) : null}
    </Modal>
  );
}

function Steps({ step }: { step: "choose" | "paste" | "review" }) {
  const steps = [["choose", "Choose"], ["paste", "Paste"], ["review", "Review"]] as const;
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

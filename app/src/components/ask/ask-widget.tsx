"use client";

import { format, parseISO } from "date-fns";
import { ArrowUp, BookOpen, Check, CheckSquare, FileText, Library, MessageSquareReply, NotebookPen, Plus, RotateCcw, Sparkles, Ticket, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import { askWorkspace } from "@/actions/ask";
import { addFollowUpUpdate, createFollowUp, rescheduleFollowUp, setFollowUpStatus } from "@/actions/follow-ups";
import type { AskProposal, AskSource } from "@/lib/ask";

/**
 * Ask your workspace — the chat bubble in the bottom-right of every app page.
 *
 * Messages go to `actions/ask.ts`, which answers from the user's own records
 * with numbered sources. Tracker changes the AI proposes (new items, done,
 * reopen, new due date, an update) show as cards and only happen when the
 * user confirms, through the normal Tracker actions. The chat lives in the
 * shell, so it survives moving between pages, and in sessionStorage (per
 * user, per tab), so it survives a reload.
 */

/** Per proposal: waiting, being applied, applied (with the entry's id), skipped, or failed. */
type DraftState = { status: "draft" | "adding" | "skipped" } | { status: "added"; id: string } | { status: "failed"; message: string };
type Turn = { question: string; answer?: string; sources?: AskSource[]; proposals?: AskProposal[]; drafts?: DraftState[]; error?: string };

const KIND_LABEL: Record<AskProposal["kind"], string> = { Task: "To-do", FollowUp: "Follow-up", Note: "Note" };
const KIND_VIEW: Record<AskProposal["kind"], string> = { Task: "todo", FollowUp: "followups", Note: "notes" };

/** Card heading, confirm button and the line once applied, per kind of change. */
function proposalCopy(item: AskProposal) {
  const kind = KIND_LABEL[item.kind];
  switch (item.action) {
    case "create": return { heading: `New ${kind}`, button: "Add to Tracker", applied: "Added to Tracker" };
    case "done": return { heading: `Mark ${kind.toLowerCase()} done`, button: "Mark done", applied: "Marked done" };
    case "reopen": return { heading: `Reopen ${kind.toLowerCase()}`, button: "Reopen", applied: "Reopened" };
    case "reschedule": return { heading: item.dueDate ? "Move due date" : "Clear due date", button: item.dueDate ? "Move it" : "Clear it", applied: "Due date changed" };
    case "update": return { heading: item.fromThem ? "Log their reply" : `Add update to ${kind.toLowerCase()}`, button: "Add update", applied: "Update added" };
  }
}

/** What the AI proposed last time and whether it was confirmed, so "make it Friday" has context. */
function historyAnswer(turn: Turn) {
  const proposed = (turn.proposals ?? []).map((item, i) => {
    const state = turn.drafts?.[i]?.status === "added" ? "confirmed" : "not confirmed";
    return `${proposalCopy(item).heading}: "${item.subject}"${item.dueDate ? ` due ${item.dueDate}` : ""} (${state})`;
  });
  return `${turn.answer ?? ""}${proposed.length ? `\n[Proposed: ${proposed.join("; ")}]` : ""}`.slice(0, 4_000);
}

const storageKey = (userId: string) => `worknest.ask.${userId}`;

/** The chat as last saved in this tab; storage can be missing or blocked, so never throws. */
function loadTurns(userId: string): Turn[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(storageKey(userId)) ?? "[]") as Turn[];
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

/** Saves answered turns; a half-applied change goes back to a draft so it can be retried. */
function saveTurns(userId: string, turns: Turn[]) {
  try {
    const settled = turns
      .filter((turn) => turn.answer !== undefined || turn.error)
      .map((turn) => ({ ...turn, drafts: turn.drafts?.map((d) => (d.status === "adding" ? { status: "draft" as const } : d)) }));
    window.sessionStorage.setItem(storageKey(userId), JSON.stringify(settled.slice(-30)));
  } catch {
    // Storage full or blocked: the chat still works, it just won't survive a reload.
  }
}

const SOURCE_ICON: Record<AskSource["kind"], typeof FileText> = {
  "Work log": NotebookPen,
  "To-do": CheckSquare,
  "Follow-up": MessageSquareReply,
  Note: FileText,
  Ticket,
  Resource: Library,
  Notebook: BookOpen,
};

const SUGGESTIONS = ["What's due this week?", "What am I still waiting on?", "What can you do?"];

function localDay() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function AskWidget({ userId }: { userId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>(() => loadTurns(userId));
  const [draft, setDraft] = useState("");
  const [inputError, setInputError] = useState("");
  const [pending, startAsking] = useTransition();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns, pending]);

  useEffect(() => {
    saveTurns(userId, turns);
  }, [userId, turns]);

  function close() {
    setOpen(false);
    launcherRef.current?.focus();
  }

  function ask(text: string) {
    const question = text.trim();
    if (question.length < 2) {
      setInputError("Type a message first.");
      inputRef.current?.focus();
      return;
    }
    if (pending) return;
    const history = turns.filter((turn) => turn.answer).map((turn) => ({ question: turn.question, answer: historyAnswer(turn) }));
    setTurns((current) => [...current, { question }]);
    setDraft("");
    setInputError("");
    startAsking(async () => {
      const result = await askWorkspace({ question, history, today: localDay() });
      setTurns((current) => {
        const next = [...current];
        next[next.length - 1] = result.ok
          ? { question, answer: result.data.answer, sources: result.data.sources, proposals: result.data.proposals, drafts: result.data.proposals.map(() => ({ status: "draft" as const })) }
          : { question, error: result.error.message };
        return next;
      });
    });
  }

  function setDraftState(turnIndex: number, itemIndex: number, state: DraftState) {
    setTurns((current) => current.map((turn, i) => (i === turnIndex ? { ...turn, drafts: (turn.drafts ?? []).map((d, j) => (j === itemIndex ? state : d)) } : turn)));
  }

  /** Applies one confirmed proposal through the same actions the Tracker uses. */
  async function applyProposal(turnIndex: number, itemIndex: number, item: AskProposal) {
    setDraftState(turnIndex, itemIndex, { status: "adding" });
    const result =
      item.action === "create"
        ? await createFollowUp({ kind: item.kind, subject: item.subject, person: item.person ?? undefined, dueDate: item.dueDate, note: item.note ?? undefined, tags: item.tags })
        : item.action === "done" || item.action === "reopen"
          ? await setFollowUpStatus({ followUpId: item.entryId, status: item.action === "done" ? "Done" : "Open" })
          : item.action === "reschedule"
            ? await rescheduleFollowUp({ followUpId: item.entryId, dueDate: item.dueDate })
            : await addFollowUpUpdate({ followUpId: item.entryId, note: item.note ?? "", fromThem: item.fromThem });
    if (!result.ok) {
      setDraftState(turnIndex, itemIndex, { status: "failed", message: result.error.message });
      return;
    }
    setDraftState(turnIndex, itemIndex, { status: "added", id: result.data.id });
    router.refresh();
  }

  // On a phone the panel covers the page, so following a source closes it.
  function followSource() {
    if (!window.matchMedia("(min-width: 768px)").matches) setOpen(false);
  }

  return (
    <>
      {open ? null : (
        <button
          ref={launcherRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="fixed right-4 bottom-4 z-40 inline-flex h-12 cursor-pointer items-center gap-2 rounded-full bg-sidebar px-5 text-base font-semibold text-sidebar-fg shadow-lg transition-colors duration-150 hover:bg-sidebar-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:right-6 md:bottom-6"
        >
          <Sparkles className="size-4" aria-hidden="true" style={{ color: "inherit" }} />
          Ask
        </button>
      )}

      {open ? (
        <section
          role="dialog"
          aria-label="Ask your workspace"
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
          }}
          className="ask-panel fixed inset-x-0 bottom-0 z-40 flex h-[85dvh] flex-col overflow-hidden rounded-t-2xl border border-border bg-surface text-text shadow-lg md:inset-x-auto md:right-6 md:bottom-6 md:h-[min(40rem,calc(100dvh-7rem))] md:w-[26rem] md:rounded-2xl"
        >
          <header className="flex items-center gap-2 border-b border-border px-4 py-3">
            <span className="grid size-8 place-items-center rounded-full bg-primary-subtle text-accent-text" aria-hidden="true">
              <Sparkles className="size-4" style={{ color: "inherit" }} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-md font-semibold leading-tight">Ask your workspace</h2>
              <p className="text-sm text-text-muted">Answers from your workspace, adds to your Tracker</p>
            </div>
            {turns.length ? (
              <button type="button" onClick={() => setTurns([])} aria-label="Start a new chat" title="New chat" className="grid size-9 cursor-pointer place-items-center rounded-full text-text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                <RotateCcw className="size-4" aria-hidden="true" />
              </button>
            ) : null}
            <button type="button" onClick={close} aria-label="Close" className="grid size-9 cursor-pointer place-items-center rounded-full text-text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <X className="size-4" aria-hidden="true" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
            {turns.length === 0 ? (
              <div className="flex flex-col gap-3">
                <p className="text-base text-text-muted">
                  Ask about anything you&rsquo;ve recorded &mdash; who you told what, what&rsquo;s due, what&rsquo;s still open &mdash; or tell me to add a to-do, follow-up or note. Answers link to where they came from.
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button key={suggestion} type="button" onClick={() => ask(suggestion)} className="cursor-pointer rounded-full border border-border-strong px-3 py-1.5 text-sm text-text hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <ol className="flex flex-col gap-5">
                {turns.map((turn, index) => (
                  <li key={index} className="flex flex-col gap-2">
                    <p className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-sidebar px-3.5 py-2 text-base text-sidebar-fg">{turn.question}</p>
                    {turn.answer !== undefined ? (
                      <>
                        <Answer text={turn.answer} sources={turn.sources ?? []} onFollow={followSource} />
                        {turn.proposals?.length ? (
                          <ul aria-label="Proposed Tracker changes" className="flex flex-col gap-2">
                            {turn.proposals.map((item, i) => (
                              <DraftCard
                                key={i}
                                item={item}
                                state={turn.drafts?.[i] ?? { status: "draft" }}
                                onAdd={() => applyProposal(index, i, item)}
                                onSkip={() => setDraftState(index, i, { status: "skipped" })}
                                onFollow={followSource}
                              />
                            ))}
                          </ul>
                        ) : null}
                      </>
                    ) : turn.error ? (
                      <p role="alert" className="rounded-xl bg-danger-subtle px-3.5 py-2 text-base text-danger">{turn.error}</p>
                    ) : (
                      <p className="ask-thinking text-base text-text-muted">Looking through your workspace…</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              ask(draft);
            }}
            className="border-t border-border p-3"
          >
            <div className="flex items-end gap-2">
              <label htmlFor="ask-input" className="sr-only">Message</label>
              <textarea
                id="ask-input"
                ref={inputRef}
                rows={1}
                value={draft}
                maxLength={500}
                onChange={(event) => {
                  setDraft(event.target.value);
                  if (inputError) setInputError("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    ask(draft);
                  }
                }}
                aria-invalid={inputError ? true : undefined}
                aria-describedby={inputError ? "ask-input-error" : undefined}
                placeholder="Ask anything or add a to-do…"
                className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-border-strong bg-surface px-3.5 py-2.5 text-base text-text placeholder:text-text-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              />
              <button type="submit" disabled={pending} aria-label="Send" className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full bg-primary text-primary-fg hover:bg-primary-hover disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                <ArrowUp className="size-4" aria-hidden="true" style={{ color: "inherit" }} />
              </button>
            </div>
            {inputError ? <p id="ask-input-error" className="mt-1.5 text-sm text-danger">{inputError}</p> : null}
          </form>
        </section>
      ) : null}
    </>
  );
}

/** One Tracker change the AI proposed: shown in full, applied only on confirm. */
function DraftCard({ item, state, onAdd, onSkip, onFollow }: { item: AskProposal; state: DraftState; onAdd: () => void; onSkip: () => void; onFollow: () => void }) {
  const Icon = item.action === "done" ? Check : item.kind === "Task" ? CheckSquare : item.kind === "FollowUp" ? MessageSquareReply : FileText;
  const copy = proposalCopy(item);
  const dueLine = item.dueDate ? `Due ${format(parseISO(item.dueDate), "EEE d MMM")}` : null;
  const meta =
    item.action === "create"
      ? [item.person, dueLine ?? (item.kind === "Task" ? "No due date" : null), ...item.tags.map((tag) => `#${tag}`)]
      : item.action === "reschedule"
        ? [item.currentDue ? `Was ${format(parseISO(item.currentDue), "d MMM")}` : "No date yet", dueLine ? `New: ${dueLine.slice(4)}` : "No due date"]
        : [KIND_LABEL[item.kind], item.currentDue ? `due ${format(parseISO(item.currentDue), "d MMM")}` : null];
  return (
    <li className={state.status === "skipped" ? "rounded-xl border border-border px-3.5 py-3 opacity-60" : "rounded-xl border border-border-strong bg-surface-2 px-3.5 py-3"}>
      <p className="flex items-center gap-1.5 text-xs font-bold tracking-[0.06em] text-text-muted uppercase">
        <Icon className="size-3.5" aria-hidden="true" style={{ color: "inherit" }} />
        {copy.heading}
      </p>
      <p className="mt-1 text-base font-semibold text-text">{item.subject}</p>
      {meta.filter(Boolean).length ? <p className="mt-0.5 text-sm text-text-muted">{meta.filter(Boolean).join(" · ")}</p> : null}
      {item.note ? <p className="mt-1 text-sm whitespace-pre-line text-text">{item.note}</p> : null}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {state.status === "added" ? (
          <>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-status-completed-fg">
              <Check className="size-4" aria-hidden="true" style={{ color: "inherit" }} />
              {copy.applied}
            </span>
            <Link href={`/tracker?view=${KIND_VIEW[item.kind]}&open=${state.id}`} onClick={onFollow} className="tap-area ml-auto text-sm font-semibold text-accent-text hover:underline">Open</Link>
          </>
        ) : state.status === "skipped" ? (
          <span className="text-sm text-text-muted">Skipped</span>
        ) : (
          <>
            <button type="button" onClick={onAdd} disabled={state.status === "adding"} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-primary px-3.5 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              {item.action === "create" ? <Plus className="size-4" aria-hidden="true" style={{ color: "inherit" }} /> : <Check className="size-4" aria-hidden="true" style={{ color: "inherit" }} />}
              {state.status === "adding" ? "Saving…" : copy.button}
            </button>
            <button type="button" onClick={onSkip} disabled={state.status === "adding"} className="h-9 cursor-pointer rounded-full px-3 text-sm font-semibold text-text-muted hover:bg-surface-3 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              Skip
            </button>
          </>
        )}
      </div>
      {state.status === "failed" ? <p role="alert" className="mt-1.5 text-sm text-danger">{state.message}</p> : null}
    </li>
  );
}

/** The answer text with [n] markers as links, "- " lines as a list, then its sources. */
function Answer({ text, sources, onFollow }: { text: string; sources: AskSource[]; onFollow: () => void }) {
  const byN = new Map(sources.map((source) => [source.n, source]));
  // Models sometimes bold despite being asked not to; show it as bold, not asterisks.
  const inline = (line: string): ReactNode[] =>
    line.split(/(\[\d+\]|\*\*[^*]+\*\*)/g).map((part, i) => {
      if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
      const n = /^\[(\d+)\]$/.exec(part)?.[1];
      const source = n ? byN.get(Number(n)) : undefined;
      if (!source) return <Fragment key={i}>{part}</Fragment>;
      return (
        <Link key={i} href={source.href} onClick={onFollow} aria-label={`Source ${source.n}: ${source.title}`} className="mx-0.5 inline-grid size-5 place-items-center rounded-full bg-primary-subtle align-[0.1em] text-xs font-semibold text-accent-text hover:bg-surface-3">
          {source.n}
        </Link>
      );
    });

  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={`l${blocks.length}`} className="ml-4 list-disc space-y-1">{list.map((item, i) => <li key={i}>{inline(item)}</li>)}</ul>);
    list = [];
  };
  for (const line of text.split("\n")) {
    const item = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (item) list.push(item[1]!);
    else {
      flush();
      if (line.trim()) blocks.push(<p key={`p${blocks.length}`}>{inline(line)}</p>);
    }
  }
  flush();

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-2 text-base leading-relaxed text-text">{blocks}</div>
      {sources.length ? (
        <ul aria-label="Sources" className="flex flex-col gap-1.5">
          {sources.map((source) => {
            const Icon = SOURCE_ICON[source.kind];
            return (
              <li key={source.n}>
                <Link href={source.href} onClick={onFollow} className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2 text-sm hover:border-border-strong hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                  <span className="w-3 shrink-0 text-xs font-semibold text-accent-text tabular-nums">{source.n}</span>
                  <Icon className="size-4 shrink-0 text-text-muted" aria-hidden="true" style={{ color: "inherit" }} />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-text-muted">{source.kind} · </span>
                    <span className="text-text">{source.title}</span>
                  </span>
                  {source.date ? <span className="shrink-0 text-xs text-text-subtle">{source.date.replace(/ \d{4}$/, "")}</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

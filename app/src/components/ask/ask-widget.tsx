"use client";

import { ArrowUp, BookOpen, CheckSquare, FileText, Library, MessageSquareReply, NotebookPen, RotateCcw, Sparkles, Ticket, X } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import { askWorkspace } from "@/actions/ask";
import type { AskSource } from "@/lib/ask";

/**
 * Ask your workspace — the chat bubble in the bottom-right of every app page.
 *
 * Read-only: questions go to `actions/ask.ts`, which answers from the user's own
 * records and returns numbered sources. The chat lives in the shell, so it
 * survives moving between pages; it is gone on reload (nothing is stored).
 */

type Turn = { question: string; answer?: string; sources?: AskSource[]; error?: string };

const SOURCE_ICON: Record<AskSource["kind"], typeof FileText> = {
  "Work log": NotebookPen,
  "To-do": CheckSquare,
  "Follow-up": MessageSquareReply,
  Note: FileText,
  Ticket,
  Resource: Library,
  Notebook: BookOpen,
};

const SUGGESTIONS = ["What's overdue?", "What am I still waiting on?", "What did I work on this week?"];

function localDay() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function AskWidget() {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
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

  function close() {
    setOpen(false);
    launcherRef.current?.focus();
  }

  function ask(text: string) {
    const question = text.trim();
    if (question.length < 2) {
      setInputError("Type a question first.");
      inputRef.current?.focus();
      return;
    }
    if (pending) return;
    const history = turns.filter((turn) => turn.answer).map((turn) => ({ question: turn.question, answer: turn.answer! }));
    setTurns((current) => [...current, { question }]);
    setDraft("");
    setInputError("");
    startAsking(async () => {
      const result = await askWorkspace({ question, history, today: localDay() });
      setTurns((current) => {
        const next = [...current];
        next[next.length - 1] = result.ok
          ? { question, answer: result.data.answer, sources: result.data.sources }
          : { question, error: result.error.message };
        return next;
      });
    });
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
              <p className="text-sm text-text-muted">Answers from your own logs, Tracker and notes</p>
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
                  Ask about anything you&rsquo;ve recorded: who you told what, when something happened, what&rsquo;s still open. Each answer links to where it came from.
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
                      <Answer text={turn.answer} sources={turn.sources ?? []} onFollow={followSource} />
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
              <label htmlFor="ask-input" className="sr-only">Your question</label>
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
                placeholder="What did I tell Ashwini about SPAM?"
                className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-border-strong bg-surface px-3.5 py-2.5 text-base text-text placeholder:text-text-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              />
              <button type="submit" disabled={pending} aria-label="Ask" className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full bg-primary text-primary-fg hover:bg-primary-hover disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
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

/** The answer text with [n] markers as links, "- " lines as a list, then its sources. */
function Answer({ text, sources, onFollow }: { text: string; sources: AskSource[]; onFollow: () => void }) {
  const byN = new Map(sources.map((source) => [source.n, source]));
  const inline = (line: string): ReactNode[] =>
    line.split(/(\[\d+\])/g).map((part, i) => {
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

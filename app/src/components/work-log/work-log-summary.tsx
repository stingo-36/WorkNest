"use client";

import { format } from "date-fns";
import { CircleAlert, RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { generateWorkLogSummary } from "@/actions/worklog";
import { toast } from "@/components/ui/toast";
import type { DayTodo } from "@/components/work-log/day-todos";
import { MarkdownContent } from "@/components/work-log/markdown-editor";

/**
 * Detail-page summary card, AI only (OpenRouter). Generated once automatically —
 * the first time the log is viewed with something in it — then only on
 * "Regenerate". If AI isn't set up or a request fails, nothing is generated: the
 * card says why instead.
 */
export function WorkLogSummary({
  workLogId,
  summary,
  model,
  generatedAt,
  updatedAt,
  hasContent,
  todoDate,
  todos,
  aiOn,
}: {
  workLogId: string;
  summary: string | null;
  model: string | null;
  generatedAt: string | null;
  updatedAt: string;
  hasContent: boolean;
  /** Candidate Tracker to-dos; narrowed to the browser's local day below. */
  todoDate: string;
  todos: DayTodo[];
  /** An OpenRouter key is available (Profile or server). */
  aiOn: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  // Guards the one-time auto run against React's double-invoked effects in dev.
  const autoStarted = useRef(false);
  // Generating writes updatedAt back unchanged, so any later edit makes this true.
  // A to-do ticked off after the summary was written also makes it stale (it may still say "overdue").
  const stale = Boolean(
    summary &&
      generatedAt &&
      (new Date(updatedAt) > new Date(generatedAt) || todos.some((todo) => todo.completedAt && new Date(todo.completedAt) > new Date(generatedAt))),
  );
  const hasTodoContent = todos.some((todo) => {
    const completedDay = todo.completedAt ? format(new Date(todo.completedAt), "yyyy-MM-dd") : null;
    return completedDay === todoDate || (todo.dueDate !== null && todo.dueDate <= todoDate && !(completedDay && completedDay <= todoDate));
  });
  const canSummarise = hasContent || hasTodoContent;

  function generate(auto: boolean) {
    setError(undefined);
    startTransition(async () => {
      const result = await generateWorkLogSummary({ workLogId, auto, tzOffset: new Date().getTimezoneOffset() });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      if (!auto) toast.success(summary ? "Summary updated" : "Summary generated");
      router.refresh();
    });
  }

  useEffect(() => {
    if (summary || !canSummarise || !aiOn || autoStarted.current) return;
    autoStarted.current = true;
    generate(true);
    // Runs once per mount; `generate` is recreated every render on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, canSummarise, aiOn]);

  return (
    <section aria-labelledby="summary-heading" aria-busy={pending} className="wl-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 md:px-6">
        <h2 id="summary-heading" className="flex items-center gap-2 text-lg font-semibold tracking-[-0.015em] text-text">
          <Sparkles className="size-4 text-accent-text" aria-hidden="true" />AI summary
        </h2>
        {aiOn ? (
          <button
            type="button"
            onClick={() => generate(false)}
            disabled={pending || !canSummarise}
            className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border border-border-strong bg-surface px-4 text-sm font-semibold text-text transition-colors duration-150 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60 md:h-10"
          >
            <RefreshCw className={pending ? "size-4 motion-safe:animate-spin" : "size-4"} aria-hidden="true" />
            {pending ? "Generating…" : summary ? "Regenerate" : "Generate summary"}
          </button>
        ) : null}
      </div>
      <div className="flex flex-col gap-3 px-4 py-4 md:px-6" aria-live="polite">
        {error ? (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-border-strong bg-surface-2 px-3 py-2.5 text-sm text-text">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
            <span>
              {error}
              {/Profile/.test(error) ? <> <Link href="/profile" className="font-semibold text-accent-text hover:underline">Open Profile</Link></> : null}
            </span>
          </p>
        ) : null}
        {summary ? (
          <div>
            <MarkdownContent value={summary} className="text-text" />
            <p className="mt-3 text-xs text-text-muted">
              {model}
              {generatedAt ? <> · <time dateTime={generatedAt}>{format(new Date(generatedAt), "d MMM yyyy, h:mm a")}</time></> : null}
              {stale ? <span className="font-semibold text-text"> · The log or its to-dos changed since — regenerate to include the latest.</span> : null}
            </p>
          </div>
        ) : pending ? (
          <p className="text-sm text-text-muted">Writing a summary of this day…</p>
        ) : !aiOn ? (
          <p className="text-sm text-text-muted">
            AI isn’t set up, so no summary is generated. Add your OpenRouter key in{" "}
            <Link href="/profile" className="font-semibold text-accent-text hover:underline">Profile → Account</Link>.
          </p>
        ) : !error ? (
          <p className="text-sm text-text-muted">
            {canSummarise ? "No summary yet." : "Nothing to summarise yet — add tickets, meeting notes, work done or to-dos first."}
          </p>
        ) : null}
      </div>
    </section>
  );
}

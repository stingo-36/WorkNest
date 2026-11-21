"use client";

import { format } from "date-fns";
import { Check, CircleAlert, Copy, FileText, Pencil, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { editReport, generateReport } from "@/actions/reports";
import { PageHead } from "@/components/shell/page-head";
import { cn } from "@/components/cn";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { toast } from "@/components/ui/toast";
import { parseReport, reportToHtml, reportToText, type ParsedReport } from "@/components/reports/report-format";

type SprintOption = { key: string; label: string; logCount: number; hasReport: boolean };
type Report = { content: string; model: string | null; generatedAt: string; editedAt: string | null };

/**
 * /reports — a "5-15 Report" per sprint in the user's doc format, written on
 * demand by AI (OpenRouter) — no AI, no report: the page says why — and
 * stored. The preview and the copy bar ("Copy for Google Docs" / "Copy as plain text") follow the user's Google Doc layout; the
 * clipboard gets rich HTML with the doc's own styles, so a paste lands as-is.
 */
export function ReportView({ sprintKey, sprints, report, stale, aiOn }: { sprintKey: string; sprints: SprintOption[]; report: Report | null; stale: boolean; aiOn: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState<"doc" | "text" | null>(null);
  const parsed = useMemo(() => (report ? parseReport(report.content) : null), [report]);
  const selected = sprints.find((s) => s.key === sprintKey);
  // Edit (2026-11-21): the report's Markdown beside a live preview; Save stores it.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, startSaving] = useTransition();
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  // Edit errors sit under the text box; the banner above is about generating.
  const [editError, setEditError] = useState<string>();
  const draftParsed = useMemo(() => (editing ? parseReport(draft) : null), [editing, draft]);

  function startEdit() {
    if (!report) return;
    setDraft(report.content);
    setEditError(undefined);
    setEditing(true);
  }

  function saveEdit() {
    if (!draft.trim()) { setEditError("The report can't be empty — Regenerate to start over."); return; }
    if (draft === report?.content) { setEditing(false); return; }
    startSaving(async () => {
      const result = await editReport({ sprint: sprintKey, content: draft });
      if (!result.ok) { setEditError(result.error.message); return; }
      toast.success("Report saved");
      setEditing(false);
      router.refresh();
    });
  }

  function generate() {
    // An edited report would lose the edits: ask first.
    if (report?.editedAt && !confirmRegenerate) { setConfirmRegenerate(true); return; }
    setConfirmRegenerate(false);
    setError(undefined);
    startTransition(async () => {
      const result = await generateReport({ sprint: sprintKey });
      if (!result.ok) { setError(result.error.message); return; }
      toast.success(report ? "Report regenerated" : "Report generated");
      router.refresh();
    });
  }

  /** "doc" = formatted for Google Docs (rich HTML + text fallback); "text" = plain text only. */
  async function copy(kind: "doc" | "text") {
    if (!parsed) return;
    const plain = reportToText(parsed);
    try {
      if (kind === "doc" && typeof ClipboardItem !== "undefined") {
        const html = reportToHtml(parsed);
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([plain], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(plain);
      }
      setCopied(kind);
      toast.success(kind === "doc" ? "Report copied — paste it into your doc" : "Report copied as plain text");
      setTimeout(() => setCopied(null), 1800);
    } catch {
      toast.error("Couldn't copy — your browser blocked clipboard access");
    }
  }

  return (
    <div className="tk-focus flex w-full min-w-0 flex-col gap-8">
      <PageHead title="Reports" description="A 5-15 report for each sprint, built from your work logs — copy it straight into your doc." stats={[{ value: sprints.length, label: sprints.length === 1 ? "sprint" : "sprints" }, { value: sprints.filter((entry) => entry.hasReport).length, label: "reports saved" }]} />

      {!aiOn ? (
        <p role="status" className="wl-card flex items-start gap-2 px-4 py-3 text-sm text-text md:px-5">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
          <span>
            Reports are written by AI, and AI isn’t set up. Add your OpenRouter key in{" "}
            <Link href="/profile?section=ai" className="font-semibold text-accent-text hover:underline">Profile → AI</Link> to generate one.
          </span>
        </p>
      ) : error ? (
        <p role="alert" className="wl-card flex items-start gap-2 px-4 py-3 text-sm text-text md:px-5">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          <span>
            {error} Nothing was generated{report ? " — the saved report below is unchanged" : ""}.
            {/Profile/.test(error) ? <> <Link href="/profile?section=ai" className="font-semibold text-accent-text hover:underline">Open AI settings</Link></> : null}
          </span>
        </p>
      ) : null}

      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        {/* Sprint list (Ocean, 2026-11-01): a column beside the paper from lg, a sideways strip below; newest first. */}
        <nav aria-label="Choose a sprint" className="-mx-1 flex gap-2 overflow-x-auto px-1 py-1 [scrollbar-width:none] lg:sticky lg:top-[calc(var(--dock-clearance)+1.5rem)] lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
          {sprints.map((s) => {
            const on = s.key === sprintKey;
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={on}
                onClick={() => router.push(`/reports?sprint=${s.key}`)}
                className={cn(
                  "flex w-52 shrink-0 cursor-pointer flex-col gap-2 rounded-2xl border p-4 text-left transition-colors duration-150 lg:w-full",
                  on ? "border-primary bg-surface text-text shadow-card ring-1 ring-primary" : "border-transparent bg-surface/50 text-text hover:bg-surface",
                )}
              >
                <span className="text-sm font-semibold">{s.label}</span>
                <span className="flex flex-wrap gap-1.5">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", "border border-border text-text-muted")}>{s.logCount} {s.logCount === 1 ? "log" : "logs"}</span>
                  {s.hasReport ? <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", "bg-primary-subtle text-accent-text")}>Saved</span> : null}
                </span>
              </button>
            );
          })}
        </nav>

        {/* The desk: a floating toolbar, then the report as a sheet of paper. */}
        <section aria-labelledby="report-heading" aria-busy={pending} className="flex min-w-0 flex-col items-center gap-4">
          <div className="flex w-full max-w-3xl flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface/90 p-2 pl-4 shadow-card">
            <h2 id="report-heading" className="mr-auto text-sm font-semibold text-text">{selected ? `${selected.label} report` : "Report"}</h2>
            {report && editing ? (
              <>
                <Button size="sm" variant="secondary" onClick={() => { setEditing(false); setEditError(undefined); }} disabled={saving}>Cancel</Button>
                <Button size="sm" onClick={saveEdit} loading={saving}><Check aria-hidden="true" />Save report</Button>
              </>
            ) : report ? (
              <>
                <Button size="sm" variant="secondary" onClick={startEdit} disabled={pending}>
                  <Pencil aria-hidden="true" />Edit
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void copy("text")} disabled={pending || !parsed}>
                  {copied === "text" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  {copied === "text" ? "Copied" : "Copy as plain text"}
                </Button>
                <Button size="sm" onClick={() => void copy("doc")} disabled={pending || !parsed}>
                  {copied === "doc" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  {copied === "doc" ? "Copied" : "Copy for Google Docs"}
                </Button>
              </>
            ) : null}
            {editing ? null : <Button size="sm" variant={report ? "secondary" : "primary"} onClick={generate} loading={pending} disabled={!aiOn || !selected?.logCount}>
              {!pending ? <RefreshCw aria-hidden="true" /> : null}
              {pending ? "Generating…" : report ? "Regenerate" : "Generate report"}
            </Button>}
          </div>

          {report && editing ? (
            <div className="grid w-full min-w-0 gap-4 xl:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-2">
                <label htmlFor="report-markdown" className="text-sm font-semibold text-text">Report text</label>
                <p id="report-markdown-hint" className="text-sm text-text-muted">
                  <code>##</code> section · <code>###</code> ticket or group · <code>-</code> bullet · <code>**bold**</code>. The preview updates as you type.
                </p>
                <textarea
                  id="report-markdown"
                  autoFocus
                  value={draft}
                  maxLength={15000}
                  aria-describedby="report-markdown-hint"
                  aria-invalid={editError ? true : undefined}
                  onChange={(event) => { setDraft(event.target.value); setEditError(undefined); }}
                  onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); saveEdit(); } }}
                  className="min-h-[70dvh] w-full resize-y rounded-lg border border-border-strong bg-surface p-4 font-mono text-sm leading-relaxed text-text shadow-card outline-none focus:border-primary focus:shadow-[var(--sh-focus)]"
                />
                {editError ? <p role="alert" className="text-sm font-semibold text-danger">{editError}</p> : null}
                <p className="text-xs text-text-muted">⌘/Ctrl + Enter saves.</p>
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <p className="text-sm font-semibold text-text" aria-hidden="true">Preview</p>
                <div className="w-full rounded-lg border border-border bg-surface shadow-card">
                  {draftParsed ? <ReportDocument report={draftParsed} /> : null}
                </div>
              </div>
            </div>
          ) : report ? (
            <>
              {stale ? <p className="w-full max-w-3xl text-sm font-semibold text-text">Logs in this sprint changed since this was generated — regenerate to include them.</p> : null}
              <div className="w-full max-w-3xl rounded-lg border border-border bg-surface shadow-card">
                {parsed ? <ReportDocument report={parsed} /> : null}
              </div>
              <p className="w-full max-w-3xl text-xs text-text-muted" aria-live="polite">
                AI report · {report.model} · Generated{" "}
                <time dateTime={report.generatedAt}>{format(new Date(report.generatedAt), "d MMM yyyy, h:mm a")}</time>
                {report.editedAt ? <> · Edited <time dateTime={report.editedAt}>{format(new Date(report.editedAt), "d MMM yyyy, h:mm a")}</time></> : null}
              </p>
            </>
          ) : (
            <div className="flex w-full max-w-3xl flex-col items-start gap-2 rounded-lg border border-dashed border-border-strong bg-surface/60 px-6 py-10">
              <FileText className="size-6 text-accent-text" aria-hidden="true" />
              <p className="text-base font-semibold text-text">
                {pending ? "Writing the report…" : selected?.logCount ? "No report for this sprint yet." : "No work logs in this sprint yet."}
              </p>
              <p className="max-w-[60ch] text-sm text-text-muted">
                {!selected?.logCount
                  ? "Log some days first, then come back to generate the report."
                  : aiOn
                    ? "Generate one and AI groups the sprint’s tickets, work done and to-dos into Completed This Week and Problems or Blockers."
                    : "Set up AI (above) to generate it."}
              </p>
            </div>
          )}
        </section>
      </div>

      <ConfirmationDialog
        open={confirmRegenerate}
        title="Regenerate this report?"
        description="You edited this report. Regenerating writes it again from your work logs and your edits are lost."
        confirmLabel="Regenerate"
        destructive
        onConfirm={generate}
        onCancel={() => setConfirmRegenerate(false)}
      />
    </div>
  );
}

/** On-screen preview in the doc's layout: centred title, section bands, bold groups, bullets. */
function ReportDocument({ report }: { report: ParsedReport }) {
  return (
    <article className="mx-auto flex max-w-3xl flex-col px-6 py-10 text-text md:px-16 md:py-14">
      <header className="pb-4 text-center">
        <p className="text-2xl font-bold tracking-[-0.01em]">{report.title}</p>
        {report.dates ? <p className="mt-1 text-lg font-bold">{report.dates}</p> : null}
      </header>
      {report.sections.map((section, index) => (
        <section key={index} className="mt-6 flex flex-col gap-5">
          {section.heading ? <h3 className="rounded-sm bg-primary-subtle px-3 py-2.5 text-lg font-bold">{section.heading}</h3> : null}
          {section.groups.map((group, groupIndex) => (
            <div key={groupIndex}>
              {group.title ? <h4 className="text-base font-bold">{group.title}</h4> : null}
              {group.bullets.length ? (
                <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-6 text-sm leading-relaxed">
                  {group.bullets.map((bullet, bulletIndex) => <li key={bulletIndex}>{bullet}</li>)}
                </ul>
              ) : null}
            </div>
          ))}
        </section>
      ))}
    </article>
  );
}

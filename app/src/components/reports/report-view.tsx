"use client";

import { format } from "date-fns";
import { Check, CircleAlert, Copy, FileText, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { generateReport } from "@/actions/reports";
import { PageHead } from "@/components/shell/page-head";
import { cn } from "@/components/cn";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { parseReport, reportToHtml, reportToText, type ParsedReport } from "@/components/reports/report-format";

type SprintOption = { key: string; label: string; logCount: number; hasReport: boolean };
type Report = { content: string; model: string | null; generatedAt: string };

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

  function generate() {
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

      {/* Sprint rail (2026-10-08): one card per sprint, newest first. */}
      <nav aria-label="Choose a sprint" className="-mx-1 flex gap-2.5 overflow-x-auto px-1 py-1 [scrollbar-width:none]">
        {sprints.map((s) => {
          const on = s.key === sprintKey;
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={on}
              onClick={() => router.push(`/reports?sprint=${s.key}`)}
              className={cn(
                "flex w-52 shrink-0 cursor-pointer flex-col gap-2 rounded-2xl border p-4 text-left transition-colors duration-150",
                on ? "border-sidebar bg-sidebar text-sidebar-fg" : "border-border bg-surface text-text hover:border-border-strong",
              )}
            >
              <span className="text-sm font-semibold">{s.label}</span>
              <span className="flex flex-wrap gap-1.5">
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", on ? "bg-sidebar-2 text-sidebar-fg" : "border border-border text-text-muted")}>{s.logCount} {s.logCount === 1 ? "log" : "logs"}</span>
                {s.hasReport ? <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", on ? "bg-surface text-text" : "bg-primary-subtle text-accent-text")}>Saved</span> : null}
              </span>
            </button>
          );
        })}
      </nav>

      {!aiOn ? (
        <p role="status" className="wl-card flex items-start gap-2 px-4 py-3 text-sm text-text md:px-5">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
          <span>
            Reports are written by AI, and AI isn’t set up. Add your OpenRouter key in{" "}
            <Link href="/profile" className="font-semibold text-accent-text hover:underline">Profile → Account</Link> to generate one.
          </span>
        </p>
      ) : error ? (
        <p role="alert" className="wl-card flex items-start gap-2 px-4 py-3 text-sm text-text md:px-5">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          <span>
            {error} Nothing was generated{report ? " — the saved report below is unchanged" : ""}.
            {/Profile/.test(error) ? <> <Link href="/profile" className="font-semibold text-accent-text hover:underline">Open Profile</Link></> : null}
          </span>
        </p>
      ) : null}

      {/* The desk: a toolbar, then the report as a sheet of paper. */}
      <section aria-labelledby="report-heading" aria-busy={pending} className="flex flex-col items-center gap-4 rounded-3xl border border-border bg-surface px-3 py-5 md:px-6 md:py-8">
        <div className="flex w-full max-w-3xl flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface p-2 pl-4">
          <h2 id="report-heading" className="mr-auto text-sm font-semibold text-text">{selected ? `${selected.label} report` : "Report"}</h2>
          {report ? (
            <>
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
          <Button size="sm" variant={report ? "secondary" : "primary"} onClick={generate} loading={pending} disabled={!aiOn || !selected?.logCount}>
            {!pending ? <RefreshCw aria-hidden="true" /> : null}
            {pending ? "Generating…" : report ? "Regenerate" : "Generate report"}
          </Button>
        </div>

        {report ? (
          <>
            {stale ? <p className="w-full max-w-3xl text-sm font-semibold text-text">Logs in this sprint changed since this was generated — regenerate to include them.</p> : null}
            <div className="w-full max-w-3xl rounded-md border border-border bg-surface">
              {parsed ? <ReportDocument report={parsed} /> : null}
            </div>
            <p className="w-full max-w-3xl text-xs text-text-muted" aria-live="polite">
              AI report · {report.model} · Generated{" "}
              <time dateTime={report.generatedAt}>{format(new Date(report.generatedAt), "d MMM yyyy, h:mm a")}</time>
            </p>
          </>
        ) : (
          <div className="flex w-full max-w-3xl flex-col items-start gap-2 rounded-md border border-dashed border-border-strong px-6 py-10">
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

import "server-only";

import { addDays, format } from "date-fns";

import { TICKET_STATUS_LABELS } from "@/components/ui/ticket-status-badge";
import { EntryKind, FollowUpStatus } from "@/generated/prisma/enums";
import { getOpenRouterConfig } from "@/lib/ai-settings";
import { type AiFailure, openRouterComplete } from "@/lib/ai-summary";
import { prisma } from "@/lib/prisma";
import { getSprint, type SprintConfig } from "@/lib/sprint";
import { normalizeTicketStatus, type WorkflowStatus } from "@/lib/workflow-status";
import { formatDateKey } from "@/lib/worklogs";

/**
 * Reports: one "5-15 Report" per sprint, in the user's own doc format —
 *
 *   # {Name} 5-15 Report
 *   (dd-MM-yyyy to dd-MM-yyyy)
 *   ## Completed This Week   → ### group (ticket or topic) → bullets
 *   ## Problems or Blockers  → ### group → bullets
 *
 * The title and date lines are always written here; the body comes from AI
 * (OpenRouter, same key as work-log summaries). AI only — no code-built report.
 */

const MAX_INPUT_CHARS = 40_000;
const MAX_REPORT_CHARS = 15_000;

const REPORT_PROMPT = `You write a developer's sprint status report from their daily work logs.
Reply with ONLY this Markdown structure, nothing before or after it:

## Completed This Week

### <Ticket 12345 - Short ticket title> or <Topic / site name - what was done>
- <bullet>
- <bullet>

(repeat ### groups)

## Problems or Blockers

### <Topic - short description>
- <bullet>

Rules:
- Group related work into 3–8 groups. Use "Ticket <key> - <title>" when the work is one ticket; otherwise a short topic title.
- 1–5 bullets per group, each one full past-tense sentence: what was done, where (dev/sandbox/live), verification, who was involved, and the outcome or current status.
- Merge repeated daily updates on the same work into one story; don't list days.
- Never make a group for meetings, sync-ups or discussions. Meeting notes are context only: use a detail from one only when it explains work in another group.
- Under "Problems or Blockers" list only real blockers, waiting-on items, unfinished work and overdue to-dos. If there are none, write a single bullet "- None." under that heading with no ### group.
- Use only facts in the logs. Never invent names, numbers or results. No preamble, no reasoning.`;

// ---------------------------------------------------------------------------
// Sprints
// ---------------------------------------------------------------------------

/** UTC-midnight calendar day for a local date — the storage form of WorkLog.date. */
function storageDay(local: Date) {
  return new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
}

/** Local date from a "YYYY-MM-DD" key. */
function localFromKey(key: string) {
  return new Date(`${key}T00:00:00`);
}

function keyOf(local: Date) {
  return format(local, "yyyy-MM-dd");
}

export type ReportSprint = { key: string; start: Date; end: Date; current: boolean; logCount: number; hasReport: boolean };

/** The current sprint plus every earlier sprint that has work logs, newest first. */
export async function listReportSprints(userId: string, config: SprintConfig): Promise<ReportSprint[]> {
  const [logs, reports] = await Promise.all([
    prisma.workLog.findMany({ where: { userId }, select: { date: true } }),
    // Reports without a model were code-built before AI-only (2026-10-02); ignored.
    prisma.sprintReport.findMany({ where: { userId, model: { not: null } }, select: { sprintStart: true } }),
  ]);
  const current = getSprint(new Date(), config);
  const byKey = new Map<string, ReportSprint>();
  const add = (local: Date) => {
    const sprint = getSprint(local, config);
    if (sprint.offset > current.offset) return;
    const key = keyOf(sprint.start);
    const entry = byKey.get(key) ?? { key, start: sprint.start, end: sprint.end, current: sprint.offset === current.offset, logCount: 0, hasReport: false };
    byKey.set(key, entry);
    return entry;
  };
  add(new Date());
  // WorkLog.date's ISO prefix is the calendar day.
  for (const log of logs) {
    const entry = add(localFromKey(formatDateKey(log.date)));
    if (entry) entry.logCount++;
  }
  const reported = new Set(reports.map((r) => formatDateKey(r.sprintStart)));
  for (const entry of byKey.values()) entry.hasReport = reported.has(entry.key);
  return [...byKey.values()].sort((a, b) => b.start.getTime() - a.start.getTime());
}

/** Resolve a `?sprint=` key (any day inside it works) to its sprint. */
export function resolveSprint(key: string | undefined, config: SprintConfig) {
  const day = key && /^\d{4}-\d{2}-\d{2}$/.test(key) ? localFromKey(key) : new Date();
  const sprint = getSprint(Number.isNaN(day.getTime()) ? new Date() : day, config);
  return { key: keyOf(sprint.start), start: sprint.start, end: sprint.end };
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

type SprintData = Awaited<ReturnType<typeof loadSprintData>>;

async function loadSprintData(userId: string, start: Date, end: Date, ticketsEnabled: boolean) {
  const from = storageDay(start);
  const to = storageDay(end);
  const [logs, completedTodos, overdueTodos] = await Promise.all([
    prisma.workLog.findMany({
      where: { userId, date: { gte: from, lte: to } },
      orderBy: { date: "asc" },
      select: {
        date: true,
        dayType: true,
        title: true,
        learningNotes: true,
        updatedAt: true,
        meetings: { where: { NOT: { notes: "" } }, orderBy: { order: "asc" }, select: { name: true, notes: true } },
        ticketUpdates: {
          orderBy: { createdAt: "asc" },
          select: { description: true, status: true, ticket: { select: { ticketId: true, title: true, projectName: true } } },
        },
      },
    }),
    prisma.followUp.findMany({
      where: { userId, kind: EntryKind.Task, completedAt: { gte: start, lt: addDays(end, 1) } },
      select: { subject: true },
    }),
    // Due within or before the sprint and still not done when it ended.
    prisma.followUp.findMany({
      where: {
        userId,
        kind: EntryKind.Task,
        dueDate: { lte: to },
        OR: [{ status: FollowUpStatus.Open }, { completedAt: { gte: addDays(end, 1) } }],
      },
      select: { subject: true },
    }),
  ]);
  return {
    logs: logs.map((log) => ({
      ...log,
      ticketUpdates: ticketsEnabled
        ? log.ticketUpdates.map((u) => ({ ...u, status: normalizeTicketStatus(u.status) as WorkflowStatus }))
        : [],
    })),
    completedTodos: [...new Set(completedTodos.map((t) => t.subject))],
    overdueTodos: [...new Set(overdueTodos.map((t) => t.subject))],
  };
}

/** Chronological plain text of the sprint — what the AI reads. */
function sprintAsText(data: SprintData) {
  const days = data.logs.map((log) => {
    const label = `${format(localFromKey(formatDateKey(log.date)), "EEE d MMM yyyy")}${log.dayType === "Work" ? "" : ` — ${log.dayType}`}`;
    if (log.dayType !== "Work") return label;
    return [
      label,
      ...log.ticketUpdates.map((u) => `Ticket ${u.ticket.ticketId} - ${u.ticket.title}${u.ticket.projectName ? ` (${u.ticket.projectName})` : ""} [${TICKET_STATUS_LABELS[u.status]}]${u.description.trim() ? `: ${u.description.trim()}` : ""}`),
      // Context only — the prompt forbids a meetings group.
      ...log.meetings.map((m) => `(Meeting note, context only) ${m.name}: ${m.notes.trim()}`),
      log.learningNotes.trim() ? `Work done:\n${log.learningNotes.trim()}` : "",
    ].filter(Boolean).join("\n");
  });
  return [
    days.join("\n\n"),
    data.completedTodos.length ? `To-dos completed during the sprint:\n${data.completedTodos.map((t) => `- ${t}`).join("\n")}` : "",
    data.overdueTodos.length ? `To-dos overdue / not done at sprint end:\n${data.overdueTodos.map((t) => `- ${t}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
}

// ---------------------------------------------------------------------------
// Read / generate
// ---------------------------------------------------------------------------

const SECTION_LINE = /^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\s*(completed this (?:week|sprint)|problems?(?:\s*(?:or|\/|&|and)\s*blockers?)?|blockers?)\s*:?\s*(?:\*\*|__)?\s*:?\s*$/i;

/**
 * Bring a model's reply into the report shape, tolerating the usual drift
 * ("**Completed This Week**", "# Problems/Blockers:", bold group titles, "*" or "•"
 * bullets). Returns the body from "## Completed This Week" on, or null if either
 * section is missing.
 */
export function normalizeReportBody(text: string): string | null {
  const lines = text.split("\n").map((line) => {
    const section = line.match(SECTION_LINE);
    if (section) return /^completed/i.test(section[1]!) ? "## Completed This Week" : "## Problems or Blockers";
    const heading = line.match(/^\s*#{1,6}\s+(.+?)\s*$/);
    if (heading) return `### ${heading[1]!.replace(/^\*\*(.+)\*\*$/, "$1")}`;
    const boldTitle = line.match(/^\s*(?:\*\*|__)(.+?)(?:\*\*|__)\s*:?\s*$/);
    if (boldTitle) return `### ${boldTitle[1]}`;
    return line.replace(/^(\s*)[*•]\s+/, "$1- ");
  });
  const start = lines.indexOf("## Completed This Week");
  if (start === -1 || !lines.includes("## Problems or Blockers")) return null;
  return lines.slice(start).join("\n").trim();
}

function reportHeader(name: string, start: Date, end: Date) {
  return `# ${name} 5-15 Report\n\n(${format(start, "dd-MM-yyyy")} to ${format(end, "dd-MM-yyyy")})`;
}

export async function getSprintReport(userId: string, start: Date, end: Date) {
  const [report, lastEdit] = await Promise.all([
    prisma.sprintReport.findUnique({ where: { userId_sprintStart: { userId, sprintStart: storageDay(start) } } }),
    prisma.workLog.findFirst({
      where: { userId, date: { gte: storageDay(start), lte: storageDay(end) } },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
  ]);
  // Code-built reports from before AI-only (no model) aren't shown.
  const shown = report?.model ? report : null;
  return {
    report: shown,
    // A log in the sprint was edited after the report was made.
    stale: Boolean(shown && lastEdit && lastEdit.updatedAt > shown.generatedAt),
  };
}

export type SprintReportResult =
  | { ok: true; generatedAt: Date; model: string }
  | { ok: false; reason: AiFailure | "empty"; model?: string };

/**
 * Write the sprint's report with AI and store it. AI only: if it isn't set up,
 * fails, or ignores the format, nothing is stored and the reason comes back.
 */
export async function generateSprintReport(
  userId: string,
  { start, end, name, ticketsEnabled }: { start: Date; end: Date; name: string; ticketsEnabled: boolean },
): Promise<SprintReportResult> {
  const data = await loadSprintData(userId, start, end, ticketsEnabled);
  if (!data.logs.some((log) => log.dayType === "Work")) return { ok: false, reason: "empty" };

  const config = await getOpenRouterConfig(userId);
  if (!config) return { ok: false, reason: "not_configured" };
  const ai = await openRouterComplete(config, {
    system: REPORT_PROMPT,
    user: sprintAsText(data).slice(0, MAX_INPUT_CHARS),
    maxChars: MAX_REPORT_CHARS,
    maxTokens: 8000,
    accept: normalizeReportBody,
  });
  if (!ai.ok) return ai;
  const body = ai.text;

  const content = `${reportHeader(name, start, end)}\n\n${body}`;
  const sprintStart = storageDay(start);
  const saved = await prisma.sprintReport.upsert({
    where: { userId_sprintStart: { userId, sprintStart } },
    create: { userId, sprintStart, content, model: ai.model },
    update: { content, model: ai.model, generatedAt: new Date() },
  });
  return { ok: true, generatedAt: saved.generatedAt, model: ai.model };
}

import "server-only";

import { z } from "zod";

import type {
  DraftFollowUp,
  DraftMeeting,
  DraftTicket,
  DraftTodo,
  QuickLogApplied,
  QuickLogDraft,
  QuickLogKind,
} from "@/components/quick-log/types";
import { getOpenRouterConfig } from "@/lib/ai-settings";
import { type AiFailure, aiFailureMessage, openRouterComplete } from "@/lib/ai-summary";
import { createFollowUp, listFollowUpPeople } from "@/lib/follow-ups";
import { addTicketWorkUpdate, findTicketsByKeyHint, listActiveTickets, upsertTicketForWorkLog } from "@/lib/tickets";
import { getOrderedList } from "@/lib/user-lists";
import { getUserSettings } from "@/lib/user-settings";
import type { applyQuickLogSchema } from "@/lib/validation";
import { WORKFLOW_STATUS_ORDER } from "@/lib/workflow-status";
import {
  addMeeting,
  formatDateKey,
  getOrCreateWorkLog,
  getWorkLogByDate,
  saveLearningNotesRow,
  todayUtc,
  touchWorkLog,
  updateMeeting,
} from "@/lib/worklogs";

/**
 * Quick log — paste rough text, get a reviewable draft, then apply it.
 *
 * The split is deliberate (free OpenRouter models are inconsistent):
 *  - the AI only does the fuzzy part — splitting text into meetings / tickets /
 *    to-dos / follow-ups and reading status words — and returns JSON;
 *  - code does the exact part — matching "1233" to ASU-1233, "asu meeting" to
 *    the "ASU Sync-up" card, names to known people, and checking dates;
 *  - nothing is written until the user applies the reviewed draft, and the
 *    writes go through the same lib functions the editor uses.
 *
 * Applying twice on one day APPENDS to that day's meeting notes, ticket update
 * and Work done (the same-log upsert is the one allowed in-place write).
 */

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Ticket statuses the AI may name; anything else (or null) means "unchanged".
const STATUS_HELP = `"InProgress" (started / working on), "SentToQA" (sent to QA / testing / review), "ReadyForProduction" (QA passed / ready to deploy), "Released" (released / deployed / live), "Done" (done / closed / completed)`;

// Small free models follow a worked example far better than rules, so the
// commonest shapes (a heading naming two meetings, notes on the next line) are shown.
const WORKLOG_EXAMPLE = (ticketsEnabled: boolean) => `Example — KNOWN MEETINGS: ASU Sync-up; Veritech Sync-up; Client Sync-up
NOTES:
For ASU and client meeting
Shared progress on 1233 search filters

veritech meeting: waiting for Ravi to confirm the design
${ticketsEnabled ? "1233 worked on filters, same status\nASU-1240 login bug fixed, sent to QA\n" : ""}Reviewed release notes
REPLY:
${JSON.stringify({
  meetings: [
    { name: "ASU Sync-up", notes: "- Shared progress on 1233 search filters" },
    { name: "Client Sync-up", notes: "- Shared progress on 1233 search filters" },
    { name: "Veritech Sync-up", notes: "- Waiting for Ravi to confirm the design" },
  ],
  tickets: ticketsEnabled
    ? [
        { key: "1233", title: "", project: "", status: null, update: "- Worked on filters" },
        { key: "ASU-1240", title: "Login bug", project: "", status: "SentToQA", update: "- Fixed the login bug" },
      ]
    : [],
  workDone: ticketsEnabled ? "- Reviewed release notes" : "- Worked on 1233 filters\n- Fixed the ASU-1240 login bug\n- Reviewed release notes",
  followUps: [{ person: "Ravi", subject: "Design confirmation", note: "Waiting for Ravi to confirm the design" }],
})}`;

const WORKLOG_PROMPT = (ticketsEnabled: boolean) => `You turn a developer's rough notes about one work day into JSON for their work log.
Reply with ONLY one JSON object — no code fences, no commentary:
{"meetings":[{"name":"","notes":""}],"tickets":[{"key":"","title":"","project":"","status":null,"update":""}],"workDone":"","followUps":[{"person":"","subject":"","note":""}]}
Rules:
- A line like "For ASU meeting", "Veritech meeting:" or "ASU Sync-up:" is a HEADING, not notes. The notes are the text after the colon or on the lines below it, up to the next heading or blank line. Never use the heading itself as the notes.
- A heading naming several meetings ("For ASU and client meeting") gives EACH of those meetings the same notes.
- meetings: when a meeting is clearly one of KNOWN MEETINGS ("asu meeting" = "ASU Sync-up"), use that exact name; otherwise a short name. notes = what was said, as "- " bullet lines. Leave out meetings with nothing said.
${ticketsEnabled
  ? `- tickets: one entry per ticket mentioned with work done or a status. key = the ticket id exactly as written (e.g. "1233" or "ASU-1240"); "ticket 23324" and "ticker 23324" mean key "23324". update = the work done on it, as "- " bullet lines. title = a ticket title the user gives anywhere (e.g. "23324 Workflow modules" → "Workflow modules"), else "". project only if stated, else "".
- status: one of ${STATUS_HELP} — only when the user names a status or a change. Use null for "same status", "no change" or when not mentioned.`
  : `- tickets: always []. Put any ticket work into workDone.`}
- workDone: other work not tied to a meeting${ticketsEnabled ? " or ticket" : ""}, as "- " bullet lines, or "".
- followUps: only when the user is clearly waiting on a named person (e.g. "waiting for Ravi to confirm"). person = the name (prefer KNOWN PEOPLE spelling), subject = a short title, note = what was asked. Otherwise [].
- Keep the user's facts and wording; fix obvious typos; never invent anything. Empty sections are [] or "".

${WORKLOG_EXAMPLE(ticketsEnabled)}`;

const TODO_PROMPT = `You turn a developer's rough list into to-dos.
Reply with ONLY one JSON object — no code fences, no commentary:
{"todos":[{"title":"","due":null}]}
Rules:
- One entry per task. title = short and clear, without the date words.
- due = "YYYY-MM-DD" when a date is given ("tomorrow", "Friday", "by the 12th", "next Monday"), worked out from TODAY. A bare weekday means the next one after TODAY. Otherwise null.
- Never invent tasks.`;

const FOLLOWUP_PROMPT = `You turn a developer's rough notes into follow-ups: things they told or asked someone and may need a reply to.
Reply with ONLY one JSON object — no code fences, no commentary:
{"followUps":[{"person":"","subject":"","message":"","channel":null}]}
Rules:
- One entry per person + topic. person = the name (prefer KNOWN PEOPLE spelling). subject = a short title (e.g. "API keys"). message = what the user said or asked, in their words.
- channel = one of CHANNELS when the text implies it ("on Slack" → "Slack", "mailed" → "Email", "called" → "Call"), else null.
- Never invent anything.`;

// Lenient readers for the AI's JSON: a wrong type becomes empty, not an error.
const text = z.string().trim().catch("");
const list = <T extends z.ZodTypeAny>(item: T) => z.array(item).catch([]);

const worklogReply = z.object({
  meetings: list(z.object({ name: text, notes: text })),
  tickets: list(
    z.object({
      key: z.union([z.string(), z.number()]).transform(String).catch(""),
      title: text,
      project: text,
      status: z.enum(WORKFLOW_STATUS_ORDER).nullable().catch(null),
      update: text,
    }),
  ),
  workDone: text,
  followUps: list(z.object({ person: text, subject: text, note: text })),
});
const todoReply = z.object({ todos: list(z.object({ title: text, due: z.string().nullable().catch(null) })) });
const followUpReply = z.object({
  followUps: list(z.object({ person: text, subject: text, message: text, channel: z.string().nullable().catch(null) })),
});

/** The first {...} in a reply, without code fences. Null if it isn't JSON. */
function extractJson(raw: string): unknown {
  const body = raw.replace(/```(?:json)?/gi, "");
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** `accept` for openRouterComplete: valid JSON that the schema can read, else retry. */
function acceptJson(schema: z.ZodTypeAny) {
  return (raw: string) => {
    const json = extractJson(raw);
    return json && typeof json === "object" && schema.safeParse(json).success ? JSON.stringify(json) : null;
  };
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** "ravi" → "Ravi Kumar" when exactly one known person matches by full or first name. */
function matchPerson(name: string, people: string[]) {
  const exact = people.find((person) => same(person, name));
  if (exact) return exact;
  const byFirst = people.filter((person) => same(person.split(/\s+/)[0] ?? "", name));
  return byFirst.length === 1 ? byFirst[0]! : name;
}

function matchChannel(channel: string | null, channels: string[]) {
  return (channel && channels.find((option) => same(option, channel))) || channels[0] || "Slack";
}

/** "#asu 1233" → "ASU1233"; null if nothing usable is left. */
function cleanKey(raw: string) {
  const key = raw.replace(/^#+/, "").replace(/\s+/g, "").toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  return /^[A-Z0-9][A-Z0-9_-]*$/.test(key) ? key.slice(0, 64) : null;
}

function validDay(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()) ? null : value;
}

/** Append a Markdown block below what's already there. */
function appendBlock(existing: string | null | undefined, addition: string) {
  const before = (existing ?? "").trimEnd();
  return before ? `${before}\n\n${addition.trim()}` : addition.trim();
}

function contextHeader(today: Date, extra: Record<string, string[]>) {
  const lines = [`TODAY: ${formatDateKey(today)} (${DAY_NAMES[today.getUTCDay()]})`];
  for (const [label, values] of Object.entries(extra)) lines.push(`${label}: ${values.length ? values.join("; ") : "(none)"}`);
  return lines.join("\n");
}

/** Empty "- " lines left over from the template are noise to a small model. */
function tidyText(raw: string) {
  return raw.replace(/^[ \t]*[-*•][ \t]*$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
}

type DraftInput = { kind: QuickLogKind; text: string; date: Date; today: Date };
export type DraftResult = { ok: true; draft: QuickLogDraft } | { ok: false; reason: AiFailure; model?: string };

export async function draftQuickLog(userId: string, raw: DraftInput): Promise<DraftResult> {
  const input = { ...raw, text: tidyText(raw.text) };
  const config = await getOpenRouterConfig(userId);

  if (input.kind === "todo") {
    // To-dos still work without AI: one per line, no dates — and the preview says so.
    const ai = config
      ? await openRouterComplete(config, {
          system: TODO_PROMPT,
          user: `${contextHeader(input.today, {})}\nLIST:\n${input.text}`,
          maxChars: 20_000,
          maxTokens: 4000,
          accept: acceptJson(todoReply),
          checkReasoning: false,
        })
      : ({ ok: false, reason: "not_configured" } as const);
    if (!ai.ok) {
      const todos = input.text
        .split("\n")
        .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)]|\[\s?\])\s*/, "").trim())
        .filter(Boolean)
        .slice(0, 50)
        .map((subject) => ({ subject: subject.slice(0, 300), dueDate: null }));
      return { ok: true, draft: { kind: "todo", todos, model: null, fallbackReason: aiFailureMessage(ai) } };
    }
    const reply = todoReply.parse(JSON.parse(ai.text));
    const todos: DraftTodo[] = reply.todos
      .filter((todo) => todo.title)
      .slice(0, 50)
      .map((todo) => ({ subject: todo.title.slice(0, 300), dueDate: validDay(todo.due) }));
    return { ok: true, draft: { kind: "todo", todos, model: ai.model } };
  }

  if (!config) return { ok: false, reason: "not_configured" };
  const [people, channels] = await Promise.all([
    listFollowUpPeople(userId),
    getOrderedList(userId, "FollowUpChannel"),
  ]);

  if (input.kind === "followup") {
    const ai = await openRouterComplete(config, {
      system: FOLLOWUP_PROMPT,
      user: `${contextHeader(input.today, { "KNOWN PEOPLE": people.slice(0, 40), CHANNELS: channels })}\nNOTES:\n${input.text}`,
      maxChars: 20_000,
      maxTokens: 4000,
      accept: acceptJson(followUpReply),
      checkReasoning: false,
    });
    if (!ai.ok) return ai;
    const reply = followUpReply.parse(JSON.parse(ai.text));
    const followUps: DraftFollowUp[] = reply.followUps
      .filter((item) => item.subject || item.message)
      .slice(0, 30)
      .map((item) => ({
        person: matchPerson(item.person, people).slice(0, 120),
        subject: (item.subject || item.message).slice(0, 300),
        note: item.message,
        channel: matchChannel(item.channel, channels),
      }));
    return { ok: true, draft: { kind: "followup", followUps, channels, model: ai.model } };
  }

  // Work log.
  const [settings, log, defaultMeetings] = await Promise.all([
    getUserSettings(userId),
    getWorkLogByDate(userId, input.date),
    getOrderedList(userId, "DefaultMeeting"),
  ]);
  // A new log gets the Default meetings cards, so those count as existing too.
  const cardNames = log ? log.meetings.map((meeting) => meeting.name) : defaultMeetings;
  const knownMeetings = [...new Set([...cardNames, ...defaultMeetings])];

  const ai = await openRouterComplete(config, {
    system: WORKLOG_PROMPT(settings.ticketsEnabled),
    user: `${contextHeader(input.today, { "LOG DAY": [formatDateKey(input.date)], "KNOWN MEETINGS": knownMeetings, "KNOWN PEOPLE": people.slice(0, 40) })}\nNOTES:\n${input.text}`,
    maxChars: 30_000,
    maxTokens: 8000,
    accept: acceptJson(worklogReply),
    checkReasoning: false,
  });
  if (!ai.ok) return ai;
  const reply = worklogReply.parse(JSON.parse(ai.text));

  // Meetings: canonical names, one entry per card.
  const meetings: DraftMeeting[] = [];
  for (const item of reply.meetings) {
    if (!item.notes) continue;
    const name = (knownMeetings.find((known) => same(known, item.name)) ?? item.name) || "Meeting";
    const existing = meetings.find((meeting) => same(meeting.name, name));
    if (existing) existing.notes = appendBlock(existing.notes, item.notes);
    else meetings.push({ name: name.slice(0, 120), notes: item.notes, existing: cardNames.some((card) => same(card, name)) });
  }

  // Tickets: resolve each written key against the user's own tickets.
  const tickets: DraftTicket[] = [];
  if (settings.ticketsEnabled) {
    for (const item of reply.tickets.slice(0, 30)) {
      const written = cleanKey(item.key);
      // A template line left blank: nothing to record.
      if (!written || (!item.update && !item.status)) continue;
      const matches = await findTicketsByKeyHint(userId, written);
      const match = matches[0];
      const key = match?.ticketId ?? written;
      const duplicate = tickets.find((ticket) => ticket.key === key);
      if (duplicate) {
        if (item.update) duplicate.update = appendBlock(duplicate.update, item.update);
        if (item.status) duplicate.status = item.status;
        continue;
      }
      tickets.push({
        key,
        written,
        title: match?.title ?? item.title.slice(0, 300),
        projectName: match ? match.projectName : item.project.slice(0, 160) || null,
        exists: Boolean(match),
        currentStatus: match?.status ?? null,
        status: item.status ?? match?.status ?? "InProgress",
        update: item.update,
        candidates: matches.length > 1 ? matches.map((m) => ({ key: m.ticketId, title: m.title, status: m.status })) : [],
      });
    }
  }

  const followUps: DraftFollowUp[] = reply.followUps
    .filter((item) => item.person && item.subject)
    .slice(0, 20)
    .map((item) => ({
      person: matchPerson(item.person, people).slice(0, 120),
      subject: item.subject.slice(0, 300),
      note: item.note,
      channel: channels[0] ?? "Slack",
    }));

  return {
    ok: true,
    draft: {
      kind: "worklog",
      date: formatDateKey(input.date),
      logExists: Boolean(log),
      ticketsEnabled: settings.ticketsEnabled,
      meetings,
      tickets,
      workDone: reply.workDone,
      followUps,
      channels,
      model: ai.model,
    },
  };
}

/**
 * A work-log starting text in the shape the reader handles best: the day's meeting
 * cards (or Default meetings) and the user's open tickets as headings, so the user
 * only types under each. Blank sections are dropped when the text is read.
 */
export async function workLogTemplate(userId: string, date: Date) {
  const [settings, log, defaultMeetings] = await Promise.all([
    getUserSettings(userId),
    getWorkLogByDate(userId, date),
    getOrderedList(userId, "DefaultMeeting"),
  ]);
  const meetings = log ? log.meetings.map((meeting) => meeting.name) : defaultMeetings;
  const tickets = settings.ticketsEnabled
    ? (await listActiveTickets(userId, 10)).filter((t) => t.status === "InProgress" || t.status === "SentToQA").slice(0, 6)
    : [];
  const blocks = meetings.map((name) => `${name}:\n- `);
  if (settings.ticketsEnabled) {
    blocks.push(["Tickets:", ...tickets.map((t) => `${t.ticketId} ${t.title}:\n- `)].join("\n"));
  }
  blocks.push("Work done:\n- ");
  return blocks.join("\n\n");
}

type ApplyInput = z.output<typeof applyQuickLogSchema>;
export type ApplyResult = { ok: true; data: QuickLogApplied } | { ok: false; message: string };

export async function applyQuickLog(userId: string, input: ApplyInput): Promise<ApplyResult> {
  if (input.kind === "todo") {
    for (const todo of input.todos) {
      await createFollowUp(userId, { kind: "Task", subject: todo.subject, dueDate: todo.dueDate });
    }
    return { ok: true, data: { kind: "todo", workLogId: null, count: input.todos.length } };
  }

  if (input.kind === "followup") {
    for (const item of input.followUps) {
      await createFollowUp(userId, { kind: "FollowUp", person: item.person, subject: item.subject, note: item.note, channel: item.channel });
    }
    return { ok: true, data: { kind: "followup", workLogId: null, count: input.followUps.length } };
  }

  // Same rules as opening a day from the Work Logs page.
  if (input.date.getTime() > todayUtc().getTime()) return { ok: false, message: "You can't log a future date" };
  const existing = await getWorkLogByDate(userId, input.date);
  if (!existing && (input.date.getUTCDay() === 0 || input.date.getUTCDay() === 6)) {
    return { ok: false, message: "Work logs can only be created on weekdays" };
  }
  const log = existing ?? (await getOrCreateWorkLog(userId, input.date));
  const { ticketsEnabled } = await getUserSettings(userId);
  let count = 0;

  for (const meeting of input.meetings) {
    const card = log.meetings.find((m) => same(m.name, meeting.name));
    if (card) await updateMeeting(userId, card.id, { notes: appendBlock(card.notes, meeting.notes) });
    else await addMeeting(userId, log.id, meeting.name, meeting.notes);
    count += 1;
  }

  if (ticketsEnabled) {
    for (const ticket of input.tickets) {
      const attached = await upsertTicketForWorkLog(userId, {
        workLogId: log.id,
        ticketKey: ticket.key,
        title: ticket.title ?? undefined,
        projectName: ticket.projectName,
        status: ticket.status,
      });
      if (!attached) continue;
      await addTicketWorkUpdate(userId, {
        workLogId: log.id,
        ticketId: attached.ticket.id,
        description: ticket.update ? appendBlock(attached.currentUpdate.description, ticket.update) : attached.currentUpdate.description,
        status: ticket.status,
      });
      count += 1;
    }
  }

  if (input.workDone.trim()) {
    await saveLearningNotesRow(userId, log.id, appendBlock(log.learningNotes, input.workDone));
    count += 1;
  }

  for (const item of input.followUps) {
    await createFollowUp(userId, { kind: "FollowUp", person: item.person, subject: item.subject, note: item.note, channel: item.channel });
    count += 1;
  }

  await touchWorkLog(log.id);
  return { ok: true, data: { kind: "worklog", workLogId: log.id, count } };
}

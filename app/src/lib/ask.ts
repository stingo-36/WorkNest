import "server-only";

import { differenceInCalendarDays, format, parseISO } from "date-fns";

import { EntryKind } from "@/generated/prisma/enums";
import { aiFailureMessage, type ChatMessage, openRouterChat, openRouterComplete, type ToolSpec } from "@/lib/ai-summary";
import { DEFAULT_OPENROUTER_MODEL, getOpenRouterConfig } from "@/lib/ai-settings";
import { findIcon, toIconLabel, type IconLibrary } from "@/lib/note-icons";
import { documentOutline, type ParsedDocument, parseDocument, planDocumentSave, splitMessage } from "@/lib/note-import";
import { prisma } from "@/lib/prisma";
import { docToText, markdownPreview } from "@/lib/rich-text";
import { getUserSettings } from "@/lib/user-settings";
import { askChangeSchema, askNotebookSchema, askProposalSchema, askRangeSchema, type AskProposal, dateOnlySchema } from "@/lib/validation";

/**
 * Ask: an assistant over your own workspace. Answers come from your records
 * only, with numbered sources linking back to them.
 *
 * It's a small agent loop: the AI starts with the open Tracker and keyword
 * matches for the message, and can call tools to search again, read work logs
 * for a date range or list finished Tracker items, then answers. It can also
 * propose Tracker changes (create, mark done/reopen, reschedule, add an
 * update) — never applied here: the chat shows each one and the user confirms
 * it with a click, which goes through the normal actions/follow-ups.ts.
 *
 * Retrieval is keyword-based (Postgres ILIKE over the user's rows, scored by
 * how many words each record contains) — no embeddings to keep in sync.
 * Every query is scoped by `userId`; record numbers map back to ids here on
 * the server, so the AI never handles ids.
 *
 * Notebooks too: create one, rename it or change its description or icon, and
 * save a pasted document into a new or existing notebook. The AI decides (and
 * asks when it's unclear); a document's text is turned into pages by
 * lib/note-import.ts, never retyped by the model. The chat saves each one
 * through actions/notes.ts after the user presses Save.
 */

export type AskSource = { n: number; kind: "Work log" | "To-do" | "Follow-up" | "Note" | "Ticket" | "Resource" | "Notebook"; title: string; date: string | null; href: string };
export type AskTurn = { question: string; answer: string };
export type { AskProposal };
/** `hasDocument`: this message carried a pasted document, so the chat sends it along with later messages. */
export type AskResult = { ok: true; answer: string; sources: AskSource[]; proposals: AskProposal[]; hasDocument: boolean; model: string } | { ok: false; message: string };

/** `entry` is set for Tracker entries, so a proposed change can point at one. */
type Candidate = Omit<AskSource, "n"> & { text: string; at: Date; entry?: { id: string; kind: EntryKind; open: boolean; due: string | null } };

const STOPWORDS = new Set(
  "a an and are about after all also any as at be been before but by can could did do does done for from get got had has have how i if in into is it its just me my of on or our said say says should so tell than that the their them then there these they this to told up us was we were what when where which who why will with would you your did didn't any anything something".split(" "),
);
const PER_SOURCE = 25;
const MAX_SOURCES = 10;
const MAX_OPEN_ENTRIES = 40;
const MAX_PROPOSALS = 5;
const MAX_RECORD_CHARS = 1_500;
const MAX_HISTORY = 6;
/** Tool rounds before the AI must answer. */
const MAX_STEPS = 4;
/**
 * Free models that handle tool calls well (checked 2026-10-19). Used only while
 * the user is on the default model list — the default's first pick often can't
 * call tools, which leaves `openrouter/free` to land on tiny models.
 */
const ASK_MODELS = ["nvidia/nemotron-3-ultra-550b-a55b:free", "nvidia/nemotron-3-super-120b-a12b:free"];
/**
 * `openrouter/free` (any free model) only when there's no Groq backup: it often
 * lands on small models that misread requests (2026-10-27: "remind me to…" taken
 * as a follow-up, wrong citations). With Groq, a busy OpenRouter goes there instead.
 */
const ANY_FREE_MODEL = "openrouter/free";

/** Search words from the question (and the previous one, so "and him?" still finds things). */
export function searchTerms(...texts: string[]): string[] {
  const terms = new Set<string>();
  for (const text of texts) {
    for (const raw of text.toLowerCase().match(/[a-z0-9][a-z0-9_.#-]*[a-z0-9]|[a-z0-9]/g) ?? []) {
      const word = raw.replace(/^#/, "");
      if (word.length >= 3 && !STOPWORDS.has(word)) terms.add(word);
      else if (/^\d{3,}$/.test(word)) terms.add(word);
    }
  }
  return [...terms].slice(0, 10);
}

const contains = (value: string) => ({ contains: value, mode: "insensitive" as const });
const day = (date: Date) => format(date, "d MMM yyyy");

const ENTRY_SELECT = {
  id: true, kind: true, subject: true, person: true, ticketKey: true, status: true, dueDate: true, completedAt: true, createdAt: true, updatedAt: true, tags: true, personal: true,
  updates: { orderBy: { occurredAt: "desc" as const }, take: 8, select: { note: true, occurredAt: true, fromThem: true, channel: true } },
};
type EntryRow = { id: string; kind: EntryKind; subject: string; person: string | null; ticketKey: string | null; status: string; dueDate: Date | null; completedAt: Date | null; createdAt: Date; updatedAt: Date; tags: string[]; personal: boolean; updates: Array<{ note: string; occurredAt: Date; fromThem: boolean; channel: string }> };

/** "21 Oct 2026 (in 2 days)" — said in words, so the AI never has to do date maths. */
function dueText(dueDate: Date, open: boolean, todayKey: string) {
  // `dueDate` is a date column (UTC midnight), so its ISO prefix is the calendar day.
  const key = dueDate.toISOString().slice(0, 10);
  const label = format(parseISO(key), "EEE d MMM yyyy");
  if (!open) return label;
  const diff = differenceInCalendarDays(parseISO(key), parseISO(todayKey));
  const when = diff < 0 ? `overdue by ${-diff} day${diff === -1 ? "" : "s"}` : diff === 0 ? "due today" : diff === 1 ? "due tomorrow" : `upcoming, in ${diff} days`;
  return `${label} (${when})`;
}

function entryCandidate(entry: EntryRow, todayKey: string, maxUpdates: number): Candidate {
  const kind = entry.kind === EntryKind.FollowUp ? "Follow-up" : entry.kind === EntryKind.Task ? "To-do" : "Note";
  const open = entry.status === "Open";
  const waiting = entry.kind === EntryKind.FollowUp && open ? (entry.updates[0]?.fromThem ? " — they replied, your move" : " — waiting on them") : "";
  const facts = [
    entry.person ? `Person: ${entry.person}` : "",
    entry.ticketKey ? `Ticket: ${entry.ticketKey}` : "",
    entry.personal ? "List: personal (not work)" : "",
    `Status: ${open ? (entry.kind === EntryKind.Note ? "active" : "open") : `done${entry.completedAt ? ` on ${day(entry.completedAt)}` : ""}`}${waiting}`,
    entry.dueDate ? `Due: ${dueText(entry.dueDate, open, todayKey)}` : entry.kind === EntryKind.Task && open ? "Due: no date" : "",
    `Created: ${day(entry.createdAt)}`,
    entry.tags.length ? `Tags: ${entry.tags.join(", ")}` : "",
  ].filter(Boolean);
  const updates = entry.updates.slice(0, maxUpdates).map((u) => `- ${day(u.occurredAt)}${entry.kind === EntryKind.FollowUp ? (u.fromThem ? " (they replied" : " (you said") + `, ${u.channel})` : ""}: ${u.note}`);
  return {
    kind,
    title: entry.kind === EntryKind.FollowUp && entry.person ? `${entry.person} · ${entry.subject}` : entry.subject,
    date: day(entry.updates[0]?.occurredAt ?? entry.createdAt),
    href: `/tracker?view=${entry.kind === EntryKind.FollowUp ? "followups" : entry.kind === EntryKind.Note ? "notes" : "todo"}&open=${entry.id}`,
    text: [entry.subject, facts.join(" · "), updates.length ? `History (newest first):\n${updates.join("\n")}` : ""].filter(Boolean).join("\n"),
    at: entry.updatedAt,
    entry: { id: entry.id, kind: entry.kind, open, due: entry.dueDate ? entry.dueDate.toISOString().slice(0, 10) : null },
  };
}

const LOG_SELECT = {
  id: true, date: true, title: true, dayType: true, learningNotes: true,
  meetings: { select: { name: true, notes: true } },
  ticketUpdates: { select: { description: true, status: true, ticket: { select: { ticketId: true, title: true } } } },
};
type LogRow = { id: string; date: Date; title: string; dayType: string; learningNotes: string; meetings: Array<{ name: string; notes: string }>; ticketUpdates: Array<{ description: string; status: string; ticket: { ticketId: string; title: string } }> };

function logCandidate(log: LogRow): Candidate {
  const parts = [
    log.dayType !== "Work" ? `Day type: ${log.dayType}` : "",
    log.learningNotes.trim() ? `Work done:\n${markdownPreview(log.learningNotes)}` : "",
    ...log.ticketUpdates.map((u) => `Ticket ${u.ticket.ticketId} ${u.ticket.title} [${u.status}]: ${markdownPreview(u.description)}`),
    ...log.meetings.filter((m) => m.notes.trim()).map((m) => `Meeting ${m.name}: ${markdownPreview(m.notes)}`),
  ].filter(Boolean);
  return { kind: "Work log", title: log.title, date: day(log.date), href: `/work-logs/${log.id}`, text: [log.title, ...parts].join("\n"), at: log.date };
}

/**
 * Everything open in the Tracker right now — small for one person, and it
 * answers "what's due / upcoming / waiting" — plus exact counts, because
 * models miscount long lists.
 */
async function openTracker(userId: string, todayKey: string): Promise<{ candidates: Candidate[]; counts: string }> {
  const entries = await prisma.followUp.findMany({
    where: { userId, status: "Open" },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }],
    take: MAX_OPEN_ENTRIES,
    select: ENTRY_SELECT,
  });
  const when = (entry: EntryRow) => {
    if (!entry.dueDate) return "no date";
    const diff = differenceInCalendarDays(parseISO(entry.dueDate.toISOString().slice(0, 10)), parseISO(todayKey));
    return diff < 0 ? "overdue" : diff === 0 ? "due today" : "upcoming";
  };
  const tally = (list: EntryRow[]) => {
    const by = new Map<string, number>();
    for (const entry of list) by.set(when(entry), (by.get(when(entry)) ?? 0) + 1);
    return ["overdue", "due today", "upcoming", "no date"].filter((k) => by.get(k)).map((k) => `${by.get(k)} ${k}`).join(", ") || "none";
  };
  const todos = entries.filter((e) => e.kind === EntryKind.Task);
  const follows = entries.filter((e) => e.kind === EntryKind.FollowUp);
  const replied = follows.filter((e) => e.updates[0]?.fromThem).length;
  const counts = [
    `Open to-dos: ${todos.length} (${tally(todos)})`,
    `Open follow-ups: ${follows.length} (${tally(follows)}; ${replied} replied — your move, ${follows.length - replied} waiting on them)`,
    `Active notes: ${entries.length - todos.length - follows.length}`,
    entries.length === MAX_OPEN_ENTRIES ? `(only the first ${MAX_OPEN_ENTRIES} open entries are listed)` : "",
  ].filter(Boolean).join("\n");
  return { candidates: entries.map((entry) => entryCandidate(entry, todayKey, 2)), counts };
}

/**
 * With `terms`, rows mentioning any of them. Without (recent mode), what's
 * current: open Tracker entries and the latest logs — so broad questions
 * ("what's overdue?", "what am I waiting on?") have something to go on.
 */
async function findCandidates(userId: string, terms: string[], ticketsEnabled: boolean, todayKey: string): Promise<Candidate[]> {
  // Without terms: the latest logs only (open Tracker entries come from `openTracker`).
  const recent = terms.length === 0;
  const any = <T>(build: (term: string) => T) => terms.map(build);
  const patterns = terms.map((term) => `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);

  const [entries, logs, tickets, resources, pages] = await Promise.all([
    recent ? Promise.resolve([]) : prisma.followUp.findMany({
      where: {
        userId,
        OR: [
          ...any((t) => ({ subject: contains(t) })),
          ...any((t) => ({ person: contains(t) })),
          ...any((t) => ({ ticketKey: contains(t) })),
          ...any((t) => ({ tags: { has: t } })),
          ...any((t) => ({ updates: { some: { note: contains(t) } } })),
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: PER_SOURCE,
      select: ENTRY_SELECT,
    }),
    prisma.workLog.findMany({
      where: recent ? { userId } : {
        userId,
        OR: [
          ...any((t) => ({ title: contains(t) })),
          ...any((t) => ({ learningNotes: contains(t) })),
          ...any((t) => ({ meetings: { some: { OR: [{ name: contains(t) }, { notes: contains(t) }] } } })),
          ...any((t) => ({ ticketUpdates: { some: { description: contains(t) } } })),
        ],
      },
      orderBy: { date: "desc" },
      take: recent ? 3 : PER_SOURCE,
      select: LOG_SELECT,
    }),
    ticketsEnabled && !recent
      ? prisma.ticket.findMany({
          where: {
            userId,
            OR: [
              ...any((t) => ({ ticketId: contains(t) })),
              ...any((t) => ({ title: contains(t) })),
              ...any((t) => ({ projectName: contains(t) })),
              ...any((t) => ({ updates: { some: { description: contains(t) } } })),
            ],
          },
          orderBy: { updatedAt: "desc" },
          take: PER_SOURCE,
          select: {
            id: true, ticketId: true, title: true, projectName: true, status: true, updatedAt: true,
            updates: { orderBy: { createdAt: "desc" }, take: 6, select: { description: true, status: true, workLog: { select: { date: true } } } },
          },
        })
      : Promise.resolve([]),
    recent ? Promise.resolve([]) : prisma.resource.findMany({
      where: {
        userId,
        OR: [
          ...any((t) => ({ title: contains(t) })),
          ...any((t) => ({ description: contains(t) })),
          ...any((t) => ({ content: contains(t) })),
          ...any((t) => ({ tags: { has: t } })),
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: PER_SOURCE,
      select: { id: true, title: true, type: true, url: true, description: true, content: true, tags: true, updatedAt: true },
    }),
    // Notebook pages are TipTap JSON; match on its text form. Owner check via the notebook.
    recent ? Promise.resolve([]) : prisma.$queryRaw<Array<{ id: string; noteId: string; noteTitle: string; title: string; content: unknown; updatedAt: Date }>>`
      SELECT p.id, n.id AS "noteId", n.title AS "noteTitle", p.title, p.content, p."updatedAt"
      FROM "NotePage" p
      JOIN "NoteSection" s ON s.id = p."sectionId"
      JOIN "Note" n ON n.id = s."noteId"
      WHERE n."userId" = ${userId} AND n."deletedAt" IS NULL
        AND (p.title ILIKE ANY(${patterns}) OR n.title ILIKE ANY(${patterns}) OR p.content::text ILIKE ANY(${patterns}))
      ORDER BY p."updatedAt" DESC
      LIMIT ${PER_SOURCE}`,
  ]);

  const candidates: Candidate[] = [];

  for (const entry of entries) candidates.push(entryCandidate(entry, todayKey, 8));

  for (const log of logs) candidates.push(logCandidate(log));

  for (const ticket of tickets) {
    const updates = ticket.updates.map((u) => `- ${u.workLog ? day(u.workLog.date) : "?"} [${u.status}]: ${markdownPreview(u.description)}`);
    candidates.push({
      kind: "Ticket",
      title: `${ticket.ticketId} ${ticket.title}`,
      date: day(ticket.updatedAt),
      href: `/tickets?ticket=${ticket.id}`,
      text: [`${ticket.ticketId} ${ticket.title}`, `Status: ${ticket.status}${ticket.projectName ? ` · Project: ${ticket.projectName}` : ""}`, updates.length ? `Work updates (newest first):\n${updates.join("\n")}` : ""].filter(Boolean).join("\n"),
      at: ticket.updatedAt,
    });
  }

  for (const resource of resources) {
    candidates.push({
      kind: "Resource",
      title: resource.title,
      date: day(resource.updatedAt),
      href: "/resources",
      text: [resource.title, `Type: ${resource.type}`, resource.url ? `URL: ${resource.url}` : "", resource.tags.length ? `Tags: ${resource.tags.join(", ")}` : "", markdownPreview(resource.description), markdownPreview(resource.content)].filter(Boolean).join("\n"),
      at: resource.updatedAt,
    });
  }

  for (const page of pages) {
    candidates.push({ kind: "Notebook", title: `${page.noteTitle} › ${page.title}`, date: day(page.updatedAt), href: `/notes/${page.noteId}`, text: [page.noteTitle, page.title, docToText(page.content)].join("\n"), at: page.updatedAt });
  }

  return candidates;
}

/** Most question words matched first; newer breaks ties. */
function rank(candidates: Candidate[], terms: string[]) {
  return candidates
    .map((candidate) => {
      const haystack = `${candidate.title}\n${candidate.text}`.toLowerCase();
      const hits = terms.filter((term) => haystack.includes(term)).length;
      const titleHits = terms.filter((term) => candidate.title.toLowerCase().includes(term)).length;
      return { candidate, score: hits * 2 + titleHits };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.candidate.at.getTime() - a.candidate.at.getTime())
    .slice(0, MAX_SOURCES)
    .map((item) => item.candidate);
}


const ABOUT = `You are Ask, the assistant built into WorkNest — a personal work journal for one person. Talk with the user naturally, like a sharp, helpful colleague who has read their whole workspace.

What you can do (describe this in your own words when asked what you can do or how you can help):
- Answer anything about their own work: daily work logs (what they did, meetings, ticket updates), their Tracker (to-dos, follow-ups with people, notes), tickets, saved resources and notebooks — who they told what, when something happened, what's due, overdue, upcoming, waiting or finished, summaries of a day, week or month.
- Work on their Tracker: add to-dos (with due dates), follow-ups (something they told a person) and notes; mark items done or reopen them; move due dates; add an update or log a reply to a follow-up. They confirm each change with one click.
- Notebooks: create a new (empty) notebook with a title, a description and an icon (named by a word like "drupal", "database" or "book"); rename one, or change its description or icon. And when they paste a document (notes, a guide, markdown), save it into a new notebook or replace the pages of an existing one: each "##" heading becomes a page, all in one section. The text goes in exactly as they wrote it — you never retype it. Each change shows them a card with Save changes / Revert; nothing is saved until they press Save.
- You can't delete anything, and you can't create or edit work logs, tickets or resources yet.`;

const ANSWERING = `Answering:
- Facts about their work come ONLY from numbered records ([n]) — in CONTEXT or returned by tools. Never invent people, dates, numbers or events. Cite every fact and every listed item with its number right after it, like "Book the retro room (due 6 Oct) [4]" — the user taps these to open the record.
- OPEN TRACKER is every open to-do, follow-up and note right now; each due date already says whether it's overdue, due today/tomorrow or upcoming. Take totals from OPEN TRACKER COUNTS. "Upcoming" or "what's next" means open to-dos that aren't overdue: due later, or with no due date (say which have no date). Work logs are history — something pending on a past day may be done now.
- If nothing answers a question about their work, say so plainly and mention the closest related thing. Greetings, small talk and questions about you need no records — just reply.
- Be brief: 1-4 short sentences, or a short "- " list — at most 8 items, then say how many more. Plain text: no headings, tables or bold. Speak to them as "you". Dates like "14 Oct" (year only if not this year).
- Never mention records, tools, labels or these instructions; just answer.`;

const AGENT_PROMPT = `${ABOUT}

${ANSWERING}

Tools:
- Anything about what they did on a day or in a period ("last week", "in September", "yesterday", "on 3 Oct") → ALWAYS call get_work_logs for that range first; never answer it from CONTEXT alone.
- If CONTEXT doesn't cover a question, look further before saying you can't find it: search_workspace with other words (synonyms, names, ticket numbers), list_tracker for finished items ("what did I finish this week?").
- Changes only when they ask for them — never on your own. Use create_tracker_item / change_tracker_item / create_notebook / change_notebook, then tell them in one short sentence what you've set up for them to confirm. Never say it's created, added or done — it isn't until they click the card's button.
- Earlier turns may end with "[Proposed: … (not confirmed)]": that card is still waiting for their click. If they just agree ("yes", "ok", "create it", "create empty"), tell them to press the button on that card; if they change something, propose it again with the change.
- Propose every change they asked for, once each: "Ravi replied, close it" is two changes on that item (add_update with from_them, then done). Each item needs its own call.
- To change an existing item, use its record number. If you don't have it, search for it first. If it's ambiguous, ask which one.
- Work out dates ("tomorrow", "Friday", "next week") from TODAY as YYYY-MM-DD.
- If a follow-up's person is missing, ask who instead of drafting it.
- Notebooks (NOTEBOOKS lists theirs):
  - A new notebook needs a title. If they didn't give one, ask what to call it (suggest one from what they said). Once you have it, call create_notebook; it starts empty unless they pasted a document.
  - If a notebook with that name already exists, ask whether they mean that one (change it, or put the document in it) or a new one with another name — unless they already said.
  - When they want a description or icon and didn't give one, write a short description yourself and pick the icon word from the topic (e.g. "drupal").
  - Changing an existing notebook's title, description or icon → change_notebook with its current title.
- PASTED DOCUMENT in CONTEXT means they've pasted one (in this message or earlier). Work out from their words what they want: a new notebook, or the pages of an existing one replaced. If they said nothing, or it's unclear, ask one short question — e.g. "Create a new notebook 'X', or update your 'Y' notebook?" — using the document's own title and NOTEBOOKS. When it's clear, call save_document with the notebook to update, or a title for a new one (plus a description and icon for a new one).`;

const LEGACY_PROMPT = `${ABOUT}

${ANSWERING}

Adding to the Tracker (you can only add here, not change existing items):
- Only when they ask you to add, create, remind, track, note down or follow up on something. Never on your own.
- Reply with one short sentence saying what you drafted, then on the last lines a block exactly like:
<items>
[{"kind":"todo","subject":"Review the release notes","due":"2026-10-21"}]
</items>
- kind is "todo", "followup" or "note". subject: short, starts with a verb for a to-do. due: "YYYY-MM-DD" or null — work out "tomorrow", "Friday", "next week" from TODAY; notes never have one. A followup also needs "person" and "note" (what they told that person); a note may have "note". Optional "tags": ["tag"]. At most 5.
- If a follow-up's person is missing, ask who instead of drafting it.`;

const date = { type: "string", description: "YYYY-MM-DD" };
const TOOLS: ToolSpec[] = [
  {
    type: "function",
    function: {
      name: "search_workspace",
      description: "Keyword search across work logs (incl. meetings and ticket updates), Tracker entries (open and done, with history), tickets, resources and notebook pages. Matches whole words in the text, so try names, ticket numbers and the words the user would have written.",
      parameters: { type: "object", properties: { query: { type: "string", description: "A few keywords" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_work_logs",
      description: "The user's daily work logs between two dates (inclusive, at most 62 days), oldest first. Use for anything about a day, week or period.",
      parameters: { type: "object", properties: { from: date, to: date }, required: ["from", "to"] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_tracker",
      description: "Tracker entries by status. 'done' lists finished ones, optionally only those finished between from and to.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["open", "done"] },
          kind: { type: "string", enum: ["todo", "followup", "note", "any"] },
          from: { ...date, description: "Finished on or after (YYYY-MM-DD). Optional." },
          to: { ...date, description: "Finished on or before (YYYY-MM-DD). Optional." },
        },
        required: ["status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_tracker_item",
      description: "Propose a new Tracker item; the user confirms it with one click. Only when they ask.",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["todo", "followup", "note"] },
          subject: { type: "string", description: "Short; a to-do starts with a verb" },
          person: { type: "string", description: "Follow-ups only: who they told" },
          note: { type: "string", description: "Follow-up: what they told that person. Note: its text." },
          due: { type: ["string", "null"], description: "YYYY-MM-DD or null. Never for notes." },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["kind", "subject"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_notebook",
      description: "Propose a new, empty notebook; the user confirms it with one click. Only when they ask.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string", description: "One or two sentences on what it's for" },
          icon: { type: "string", description: "One word to find an icon by: a technology or brand (drupal, react, aws) or a thing (book, database, rocket)" },
          empty: { type: "boolean", description: "Only when a PASTED DOCUMENT is in the chat and they want this notebook empty anyway" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_document",
      description: "Propose saving the PASTED DOCUMENT as notebook pages (one page per ## heading): into an existing notebook, replacing its pages, or as a new notebook. The user sees what changes and presses Save. Only when they've said what they want.",
      parameters: {
        type: "object",
        properties: {
          notebook: { type: "string", description: "An existing notebook's current title, to put the document in. Leave out for a new notebook." },
          title: { type: "string", description: "Title for a new notebook (or a new title for the existing one)" },
          description: { type: "string", description: "A short description (new notebook, or to replace the existing one's)" },
          icon: { type: "string", description: "One word to find an icon by (new notebook, or to replace)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "change_notebook",
      description: "Propose renaming a notebook or changing its description or icon; the user confirms it with one click. Only when they ask.",
      parameters: {
        type: "object",
        properties: {
          notebook: { type: "string", description: "The notebook's current title, from NOTEBOOKS" },
          title: { type: "string", description: "New title, only to rename it" },
          description: { type: "string", description: "New description" },
          icon: { type: "string", description: "One word to find the new icon by" },
        },
        required: ["notebook"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "change_tracker_item",
      description: "Propose a change to an existing to-do, follow-up or note, by its record number; the user confirms it with one click. Only when they ask.",
      parameters: {
        type: "object",
        properties: {
          record: { type: "integer", description: "The [n] number of the Tracker record" },
          change: { type: "string", enum: ["done", "reopen", "reschedule", "add_update"], description: "done/reopen; reschedule = new due date; add_update = append a note (for a follow-up: what they said, or their reply with from_them)" },
          due: { type: ["string", "null"], description: "reschedule: YYYY-MM-DD, or null to clear" },
          note: { type: "string", description: "add_update: the text" },
          from_them: { type: "boolean", description: "add_update on a follow-up: true if this is the other person's reply" },
        },
        required: ["record", "change"],
      },
    },
  },
];

/** Records the AI has seen this turn, numbered once so citations and changes point at the same thing. */
class Records {
  list: Candidate[] = [];
  /** Numbers handed out by tools (not the starting CONTEXT). */
  looked: number[] = [];
  add(candidate: Candidate) {
    const found = this.list.findIndex((c) => c.href === candidate.href);
    if (found !== -1) return found + 1;
    this.list.push(candidate);
    return this.list.length;
  }
  render(candidates: Candidate[], chars: number, fromTool = true) {
    if (!candidates.length) return "Nothing found.";
    return candidates
      .map((c) => {
        const n = this.add(c);
        if (fromTool && !this.looked.includes(n)) this.looked.push(n);
        return `[${n}] ${c.kind}: ${c.title} (${c.date ?? "no date"})\n${c.text.slice(0, chars)}`;
      })
      .join("\n\n");
  }
}

const KIND_OF: Record<string, EntryKind | undefined> = { todo: EntryKind.Task, followup: EntryKind.FollowUp, note: EntryKind.Note };

type ToolContext = { userId: string; ticketsEnabled: boolean; todayKey: string; records: Records; proposals: AskProposal[]; document: ParsedDocument | null };

type NotebookRow = { id: string; title: string; description: string | null; iconName: string | null; iconLibrary: string | null };
/** The user's live notebook with this title — exact first, else the only one containing it. */
async function findNotebookByTitle(userId: string, title: string): Promise<NotebookRow | NotebookRow[]> {
  const found = await prisma.note.findMany({
    where: { userId, deletedAt: null, title: contains(title) },
    orderBy: { updatedAt: "desc" },
    take: 5,
    select: { id: true, title: true, description: true, iconName: true, iconLibrary: true },
  });
  return found.find((n) => n.title.toLowerCase() === title.trim().toLowerCase()) ?? (found.length === 1 ? found[0]! : found);
}
const iconLabelOf = (n: NotebookRow) => (n.iconName && (n.iconLibrary === "si" || n.iconLibrary === "lu" || n.iconLibrary === "fa6") ? toIconLabel(n.iconLibrary as IconLibrary, n.iconName) : null);

async function runTool(name: string, rawArgs: string, ctx: ToolContext): Promise<string> {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(rawArgs || "{}") as Record<string, unknown>;
  } catch {
    return "Error: the arguments weren't valid JSON.";
  }
  switch (name) {
    case "search_workspace": {
      const terms = searchTerms(String(args.query ?? ""));
      if (!terms.length) return "Error: give a few keywords.";
      return ctx.records.render(rank(await findCandidates(ctx.userId, terms, ctx.ticketsEnabled, ctx.todayKey), terms), 1_200);
    }
    case "get_work_logs": {
      const range = askRangeSchema.safeParse(args);
      if (!range.success) return "Error: from and to must be YYYY-MM-DD, from before to, at most 62 days apart.";
      const logs = await prisma.workLog.findMany({
        where: { userId: ctx.userId, date: { gte: range.data.from, lte: range.data.to } },
        orderBy: { date: "asc" },
        take: 62,
        select: LOG_SELECT,
      });
      if (!logs.length) {
        // Say where the nearest logs are, so the AI answers instead of searching in circles.
        const [before, after] = await Promise.all([
          prisma.workLog.findFirst({ where: { userId: ctx.userId, date: { lt: range.data.from } }, orderBy: { date: "desc" }, select: { date: true } }),
          prisma.workLog.findFirst({ where: { userId: ctx.userId, date: { gt: range.data.to } }, orderBy: { date: "asc" }, select: { date: true } }),
        ]);
        return `No work logs between ${day(range.data.from)} and ${day(range.data.to)}.${before ? ` The latest log before that is ${day(before.date)}.` : ""}${after ? ` The next one after is ${day(after.date)}.` : ""}`;
      }
      // A long period gets shorter logs so it still fits.
      return ctx.records.render(logs.map(logCandidate), logs.length > 15 ? 500 : 1_200);
    }
    case "list_tracker": {
      const done = args.status === "done";
      const kind = KIND_OF[String(args.kind ?? "")];
      const bound = (value: unknown) => {
        const parsed = dateOnlySchema.safeParse(value);
        return value && parsed.success ? parsed.data : undefined;
      };
      const between = { from: bound(args.from), to: bound(args.to) };
      const entries = await prisma.followUp.findMany({
        where: {
          userId: ctx.userId,
          status: done ? "Done" : "Open",
          ...(kind ? { kind } : {}),
          ...(done && (between.from || between.to)
            ? { completedAt: { ...(between.from ? { gte: between.from } : {}), ...(between.to ? { lt: new Date(between.to.getTime() + 86_400_000) } : {}) } }
            : {}),
        },
        orderBy: done ? { completedAt: "desc" } : [{ dueDate: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }],
        take: 40,
        select: ENTRY_SELECT,
      });
      return ctx.records.render(entries.map((entry) => entryCandidate(entry, ctx.todayKey, 2)), 400);
    }
    case "create_tracker_item": {
      if (ctx.proposals.length >= MAX_PROPOSALS) return "Error: that's enough for one message.";
      const item = askProposalSchema.safeParse(args);
      if (!item.success) return `Error: ${item.error.issues[0]?.message ?? "invalid item"}. Fix it or ask the user.`;
      if (ctx.proposals.some((p) => p.action === "create" && p.kind === item.data.kind && p.subject.toLowerCase() === item.data.subject.toLowerCase())) return "Already proposed — don't repeat it.";
      ctx.proposals.push(cleanDue(item.data, ctx.todayKey));
      return "Proposed. The user will see it and confirm it with one click.";
    }
    case "create_notebook":
    case "change_notebook":
    case "save_document": {
      if (ctx.proposals.length >= MAX_PROPOSALS) return "Error: that's enough for one message.";
      const input = askNotebookSchema.safeParse(args);
      if (!input.success) return `Error: ${input.error.issues[0]?.message ?? "invalid notebook"}.`;
      const { notebook, title, description, icon } = input.data;
      if (name === "save_document" && !ctx.document) return "Error: there's no pasted document in this chat. Ask them to paste it.";
      // A pasted document dropped by picking the wrong tool would be lost content.
      if (name === "create_notebook" && ctx.document && !input.data.empty) return "Error: there's a PASTED DOCUMENT in this chat. To put it in this new notebook, call save_document with this title (and the description and icon). Only if they want an empty notebook, call create_notebook again with empty: true.";

      let existing: NotebookRow | null = null;
      if (notebook) {
        const found = await findNotebookByTitle(ctx.userId, notebook);
        if (Array.isArray(found)) return found.length ? `Error: more than one notebook matches: ${found.map((n) => `"${n.title}"`).join(", ")}. Ask which.` : `Error: no notebook is called "${notebook}". Check NOTEBOOKS, or ask.`;
        existing = found;
      } else if (name === "change_notebook") {
        return "Error: say which notebook (its current title).";
      }
      if (name === "change_notebook" && !title && description == null && !icon) return "Error: say what to change — title, description or icon.";

      const newTitle = title ?? existing?.title ?? (name === "save_document" ? ctx.document!.title : null);
      if (!newTitle) return "Error: a new notebook needs a title. Ask the user what to call it (suggest one).";
      if (!existing) {
        // A new notebook with an existing name is almost always a mix-up; make the AI ask.
        const clash = await findNotebookByTitle(ctx.userId, newTitle);
        if (!Array.isArray(clash) && clash.title.toLowerCase() === newTitle.toLowerCase()) {
          return `Error: they already have a notebook called "${clash.title}". Ask whether to ${name === "save_document" ? "put the document in it" : "change it"} or use a different name for a new one.`;
        }
      }
      const plan = name === "save_document" ? await planDocumentSave(ctx.userId, ctx.document!, existing?.id ?? null, newTitle) : null;
      if (name === "save_document" && !plan) return "Error: that notebook couldn't be read.";
      const picked = icon ? await findIcon(icon) : null;
      ctx.proposals.push({
        action: "notebook",
        kind: "Notebook",
        noteId: existing?.id ?? null,
        subject: newTitle,
        currentTitle: existing?.title ?? null,
        description: description ?? null,
        iconName: picked?.name ?? null,
        iconLibrary: picked?.library ?? null,
        iconLabel: picked?.label ?? null,
        before: existing ? { title: existing.title, description: existing.description, iconLabel: iconLabelOf(existing) } : null,
        document: plan,
        dueDate: null,
      });
      const pages = plan ? ` It will ${existing ? `make "${existing.title}" match the document (${plan.changedPages} pages changed, ${plan.newPages} new, ${plan.removedPages} removed)` : `have ${plan.pages} pages`}.` : "";
      return `Proposed${icon && !picked ? ` (no icon matched "${icon}", so none is set)` : picked ? ` with the ${picked.label} icon` : ""}.${pages} The user will see it and press Save changes or Revert.`;
    }
    case "change_tracker_item": {
      if (ctx.proposals.length >= MAX_PROPOSALS) return "Error: that's enough for one message.";
      const change = askChangeSchema.safeParse(args);
      if (!change.success) return `Error: ${change.error.issues[0]?.message ?? "invalid change"}.`;
      const record = ctx.records.list[change.data.record - 1];
      if (!record?.entry) return "Error: that number isn't a Tracker to-do, follow-up or note. Search for it first.";
      const { entry } = record;
      if (change.data.change === "done" && !entry.open) return "It's already done.";
      if (change.data.change === "reopen" && entry.open) return "It's already open.";
      if (change.data.change === "reschedule" && entry.kind === EntryKind.Note) return "Error: notes have no due date.";
      if (change.data.change === "update" && !change.data.note && !(change.data.fromThem && entry.kind === EntryKind.FollowUp)) return "Error: add_update needs a note.";
      if (ctx.proposals.some((p) => p.action !== "create" && p.action === change.data.change && p.entryId === entry.id)) return "Already proposed — don't repeat it. Propose any other changes they asked for, then answer.";
      ctx.proposals.push({
        action: change.data.change,
        entryId: entry.id,
        kind: entry.kind,
        subject: record.title,
        dueDate: change.data.change === "reschedule" ? change.data.due : null,
        note: change.data.change === "update" ? change.data.note : null,
        fromThem: change.data.change === "update" && entry.kind === EntryKind.FollowUp && change.data.fromThem,
        currentDue: entry.due,
      });
      return "Proposed. The user will see it and confirm it with one click.";
    }
    default:
      return `Error: there's no tool called ${name}.`;
  }
}

/** A due date long past is a misread, not a plan; drop it rather than file the item overdue. */
function cleanDue(item: AskProposal, todayKey: string): AskProposal {
  if (item.action !== "create" || !item.dueDate) return item;
  return differenceInCalendarDays(parseISO(item.dueDate), parseISO(todayKey)) < -1 ? { ...item, dueDate: null } : item;
}

/** The `<items>` block of the no-tools fallback; anything malformed is dropped. */
function parseItems(text: string, todayKey: string): { rest: string; proposals: AskProposal[]; failed: boolean } {
  const match = /<items>([\s\S]*?)(?:<\/items>|$)/i.exec(text);
  if (!match) return { rest: text, proposals: [], failed: false };
  const rest = text.slice(0, match.index).replace(/```\w*\s*$/, "").trim();
  let raw: unknown;
  try {
    raw = JSON.parse(match[1]!.replace(/```\w*/g, "").trim());
  } catch {
    return { rest, proposals: [], failed: true };
  }
  const proposals = (Array.isArray(raw) ? raw : [raw])
    .slice(0, MAX_PROPOSALS)
    .map((item) => askProposalSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => cleanDue(result.data, todayKey));
  return { rest, proposals, failed: proposals.length === 0 };
}

/** Keep only the records the answer cites, renumbered in order of first mention. */
function withCitations(text: string, records: Candidate[]) {
  const order: number[] = [];
  for (const match of text.matchAll(/\[(\d+)\]/g)) {
    const n = Number(match[1]);
    if (n >= 1 && n <= records.length && !order.includes(n)) order.push(n);
  }
  const answer = text
    .replace(/\[(\d+)\]/g, (whole, raw: string) => {
      const index = order.indexOf(Number(raw));
      return index === -1 ? "" : `[${index + 1}]`;
    })
    .replace(/[ \t]+([.,;:])/g, "$1")
    .trim();
  const sources = order.map((n, i) => {
    const { kind, title, date, href } = records[n - 1]!;
    return { n: i + 1, kind, title, date, href };
  });
  return { answer, sources };
}

export async function askWorkspace(userId: string, input: { question: string; history: AskTurn[]; today: Date; document?: string }): Promise<AskResult> {
  // A document pasted now, or earlier in the chat (the browser sends that one along).
  const split = splitMessage(input.question);
  const documentText = split?.document ?? (input.document ? splitMessage(input.document)?.document ?? input.document : null);
  const document = documentText ? parseDocument(documentText) : null;
  const message = split ? split.instruction || "(They pasted the document with no other words.)" : input.question;

  const [saved, settings] = await Promise.all([getOpenRouterConfig(userId), getUserSettings(userId)]);
  if (!saved) return { ok: false, message: aiFailureMessage({ reason: "not_configured" }) };
  const onDefault = saved.models.join(",") === DEFAULT_OPENROUTER_MODEL.replace(/\s/g, "");
  const config = onDefault ? { ...saved, models: saved.groq ? ASK_MODELS : [...ASK_MODELS, ANY_FREE_MODEL] } : saved;

  const history = input.history.slice(-MAX_HISTORY);
  const today = new Date(input.today.getTime() + input.today.getTimezoneOffset() * 60_000);
  const todayKey = format(today, "yyyy-MM-dd");
  const terms = searchTerms(message, history.at(-1)?.question ?? "");
  const [matched, { candidates: open, counts }, logSpan, notebooks] = await Promise.all([
    terms.length ? findCandidates(userId, terms, settings.ticketsEnabled, todayKey).then((found) => rank(found, terms)) : Promise.resolve([]),
    openTracker(userId, todayKey),
    prisma.workLog.aggregate({ where: { userId }, _min: { date: true }, _max: { date: true }, _count: true }),
    prisma.note.findMany({ where: { userId, deletedAt: null }, orderBy: { updatedAt: "desc" }, take: 40, select: { title: true } }),
  ]);
  // Few keyword hits: add the latest logs too, so broad questions ("what did I do?") have something.
  const extra = matched.length >= 4 ? [] : (await findCandidates(userId, [], settings.ticketsEnabled, todayKey)).filter((c) => !matched.some((m) => m.href === c.href));

  const records = new Records();
  const matching = [...matched, ...extra];
  const context = [
    `TODAY: ${format(today, "EEEE d MMM yyyy")} (${todayKey})`,
    // So the AI knows what get_work_logs can find, and never guesses dates.
    logSpan._count && logSpan._min.date && logSpan._max.date
      ? `WORK LOGS ON FILE: ${logSpan._count}, from ${day(logSpan._min.date)} to ${day(logSpan._max.date)} (latest). Only a few are in CONTEXT — use get_work_logs for any day or period.`
      : "WORK LOGS ON FILE: none yet.",
    `MATCHING RECORDS:\n${records.render(matching, MAX_RECORD_CHARS, false)}`,
    `NOTEBOOKS: ${notebooks.length ? notebooks.map((n) => `"${n.title}"`).join(", ") : "none yet"}`,
    document && documentText ? `PASTED DOCUMENT (${split ? "in this message" : "from earlier in this chat"}):\n${documentOutline(document, documentText)}` : "",
    `OPEN TRACKER COUNTS (exact):\n${counts}`,
    `OPEN TRACKER:\n${records.render(open.filter((c) => !matching.some((m) => m.href === c.href)), 500, false)}`,
  ].filter(Boolean).join("\n\n");
  const past: ChatMessage[] = history.flatMap((turn) => [
    { role: "user" as const, content: turn.question },
    { role: "assistant" as const, content: turn.answer.replace(/\[\d+\]/g, "") },
  ]);
  const proposals: AskProposal[] = [];
  const ctx: ToolContext = { userId, ticketsEnabled: settings.ticketsEnabled, todayKey, records, proposals, document };

  const messages: ChatMessage[] = [{ role: "system", content: AGENT_PROMPT }, ...past, { role: "user", content: `CONTEXT:\n${context}\n\nMESSAGE: ${message}` }];
  let reply: string | null = null;
  let model = config.models[0]!;
  for (let step = 0; step <= MAX_STEPS && reply === null; step++) {
    // The last round has no tools, so the AI has to answer with what it found.
    const last = step === MAX_STEPS;
    const result = await openRouterChat(config, last ? { messages: flatten(messages), maxTokens: 6_000 } : { messages, tools: TOOLS, maxTokens: 6_000 });
    if (!result.ok) {
      if (result.noTools && step === 0) return askWithoutTools(config, context, past, message, todayKey, records);
      return { ok: false, message: aiFailureMessage(result) };
    }
    model = result.model;
    if (!result.toolCalls.length) {
      reply = result.content;
      break;
    }
    messages.push({ role: "assistant", content: result.content || null, tool_calls: result.toolCalls });
    for (const call of result.toolCalls) {
      messages.push({ role: "tool", tool_call_id: call.id, content: (await runTool(call.function.name, call.function.arguments, ctx)).slice(0, 24_000) });
    }
  }

  // A model that still tries to call a tool in the last round writes it as text; drop it.
  const text = (reply ?? "").replace(/<tool_call>[\s\S]*$|<function=[\s\S]*$/, "");
  const { answer, sources } = withCitations(text, records.list);
  // Models sometimes skip the [n] marks; then list what they looked up, so the answer still links back.
  if (!sources.length && records.looked.length) {
    for (const n of records.looked.slice(0, 6)) {
      const { kind, title, date, href } = records.list[n - 1]!;
      sources.push({ n: sources.length + 1, kind, title, date, href });
    }
  }
  const fallback = proposals.length ? "Here's what I've set up — confirm below." : "Sorry, I couldn't put an answer together. Try asking again.";
  return { ok: true, answer: answer || fallback, sources, proposals, hasDocument: Boolean(split && document), model };
}

/**
 * The conversation with tool calls turned into plain text, for a final call
 * without tools (some providers reject tool messages when no tools are sent).
 */
function flatten(messages: ChatMessage[]): ChatMessage[] {
  const flat: ChatMessage[] = messages.map((message) => {
    if (message.role === "tool") return { role: "user", content: `Lookup result:\n${message.content}` };
    if (message.role === "assistant" && message.tool_calls?.length) {
      return { role: "assistant", content: `${message.content ? `${message.content}\n` : ""}(Looked up: ${message.tool_calls.map((call) => `${call.function.name} ${call.function.arguments}`).join("; ")})` };
    }
    return message;
  });
  return [...flat, { role: "user", content: "Answer my message now from what you found, citing [n] numbers. No more lookups." }];
}

/** For models without tool calling: one plain completion; it can only add items, via an `<items>` block. */
async function askWithoutTools(
  config: NonNullable<Awaited<ReturnType<typeof getOpenRouterConfig>>>,
  context: string,
  past: ChatMessage[],
  question: string,
  todayKey: string,
  records: Records,
): Promise<AskResult> {
  const conversation = past.length ? `EARLIER IN THIS CHAT:\n${past.map((m) => `${m.role === "user" ? "User" : "You"}: ${m.content}`).join("\n")}\n\n` : "";
  const ai = await openRouterComplete(config, {
    system: LEGACY_PROMPT,
    user: `CONTEXT:\n${context}\n\n${conversation}MESSAGE: ${question}`,
    maxChars: 6_000,
    // Free reasoning models think at length; too low a cap cuts them off and costs a retry.
    maxTokens: 6_000,
    checkReasoning: false,
  });
  if (!ai.ok) return { ok: false, message: aiFailureMessage(ai) };
  const { rest, proposals, failed } = parseItems(ai.text, todayKey);
  const { answer, sources } = withCitations(rest, records.list);
  const note = failed ? "I couldn't put that into a Tracker item — try saying it a little differently." : "";
  return { ok: true, answer: [answer, note].filter(Boolean).join("\n\n") || "Here you go.", sources, proposals, hasDocument: false, model: ai.model };
}

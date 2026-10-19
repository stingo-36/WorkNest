import "server-only";

import { format } from "date-fns";

import { EntryKind } from "@/generated/prisma/enums";
import { aiFailureMessage, openRouterComplete } from "@/lib/ai-summary";
import { getOpenRouterConfig } from "@/lib/ai-settings";
import { prisma } from "@/lib/prisma";
import { docToText, markdownPreview } from "@/lib/rich-text";
import { getUserSettings } from "@/lib/user-settings";

/**
 * Ask: questions about your own workspace, answered by the AI from your
 * records only, with numbered sources linking back to them.
 *
 * Retrieval is keyword-based (Postgres ILIKE over the user's rows, scored by
 * how many question words each record contains) — no embeddings to keep in
 * sync. Every query is scoped by `userId`; the AI sees only the handful of
 * records that matched, never the whole account.
 */

export type AskSource = { n: number; kind: "Work log" | "To-do" | "Follow-up" | "Note" | "Ticket" | "Resource" | "Notebook"; title: string; date: string | null; href: string };
export type AskTurn = { question: string; answer: string };
export type AskResult = { ok: true; answer: string; sources: AskSource[]; model: string } | { ok: false; message: string };

type Candidate = Omit<AskSource, "n"> & { text: string; at: Date };

const STOPWORDS = new Set(
  "a an and are about after all also any as at be been before but by can could did do does done for from get got had has have how i if in into is it its just me my of on or our said say says should so tell than that the their them then there these they this to told up us was we were what when where which who why will with would you your did didn't any anything something".split(" "),
);
const PER_SOURCE = 25;
const MAX_SOURCES = 10;
const MAX_RECORD_CHARS = 1_500;
const MAX_HISTORY = 4;

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

/**
 * With `terms`, rows mentioning any of them. Without (recent mode), what's
 * current: open Tracker entries and the latest logs — so broad questions
 * ("what's overdue?", "what am I waiting on?") have something to go on.
 */
async function findCandidates(userId: string, terms: string[], ticketsEnabled: boolean): Promise<Candidate[]> {
  const recent = terms.length === 0;
  const any = <T>(build: (term: string) => T) => terms.map(build);
  const patterns = terms.map((term) => `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);

  const [entries, logs, tickets, resources, pages] = await Promise.all([
    prisma.followUp.findMany({
      where: recent ? { userId, status: "Open" } : {
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
      take: recent ? 15 : PER_SOURCE,
      select: {
        id: true, kind: true, subject: true, person: true, ticketKey: true, status: true, dueDate: true, completedAt: true, createdAt: true, updatedAt: true, tags: true,
        updates: { orderBy: { occurredAt: "desc" }, take: 8, select: { note: true, occurredAt: true, fromThem: true, channel: true } },
      },
    }),
    prisma.workLog.findMany({
      where: recent ? { userId } : {
        userId,
        OR: [
          ...any((t) => ({ title: contains(t) })),
          ...any((t) => ({ learningNotes: contains(t) })),
          ...any((t) => ({ summary: contains(t) })),
          ...any((t) => ({ meetings: { some: { OR: [{ name: contains(t) }, { notes: contains(t) }] } } })),
          ...any((t) => ({ ticketUpdates: { some: { description: contains(t) } } })),
        ],
      },
      orderBy: { date: "desc" },
      take: recent ? 3 : PER_SOURCE,
      select: {
        id: true, date: true, title: true, dayType: true, learningNotes: true, summary: true,
        meetings: { select: { name: true, notes: true } },
        ticketUpdates: { select: { description: true, status: true, ticket: { select: { ticketId: true, title: true } } } },
      },
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

  for (const entry of entries) {
    const kind = entry.kind === EntryKind.FollowUp ? "Follow-up" : entry.kind === EntryKind.Task ? "To-do" : "Note";
    const facts = [
      entry.person ? `Person: ${entry.person}` : "",
      entry.ticketKey ? `Ticket: ${entry.ticketKey}` : "",
      `Status: ${entry.status}${entry.completedAt ? ` (done ${day(entry.completedAt)})` : ""}`,
      entry.dueDate ? `Due: ${day(entry.dueDate)}` : "",
      `Created: ${day(entry.createdAt)}`,
      entry.tags.length ? `Tags: ${entry.tags.join(", ")}` : "",
    ].filter(Boolean);
    const updates = entry.updates.map((u) => `- ${day(u.occurredAt)}${entry.kind === EntryKind.FollowUp ? (u.fromThem ? " (they replied" : " (you said") + `, ${u.channel})` : ""}: ${u.note}`);
    candidates.push({
      kind,
      title: entry.kind === EntryKind.FollowUp && entry.person ? `${entry.person} · ${entry.subject}` : entry.subject,
      date: day(entry.updates[0]?.occurredAt ?? entry.createdAt),
      href: `/tracker?view=${entry.kind === EntryKind.FollowUp ? "followups" : entry.kind === EntryKind.Note ? "notes" : "todo"}&open=${entry.id}`,
      text: [entry.subject, facts.join(" · "), updates.length ? `History (newest first):\n${updates.join("\n")}` : ""].filter(Boolean).join("\n"),
      at: entry.updatedAt,
    });
  }

  for (const log of logs) {
    const parts = [
      log.dayType !== "Work" ? `Day type: ${log.dayType}` : "",
      log.learningNotes.trim() ? `Work done:\n${markdownPreview(log.learningNotes)}` : "",
      ...log.ticketUpdates.map((u) => `Ticket ${u.ticket.ticketId} ${u.ticket.title} [${u.status}]: ${markdownPreview(u.description)}`),
      ...log.meetings.filter((m) => m.notes.trim()).map((m) => `Meeting ${m.name}: ${markdownPreview(m.notes)}`),
      log.summary ? `Summary: ${markdownPreview(log.summary)}` : "",
    ].filter(Boolean);
    candidates.push({ kind: "Work log", title: log.title, date: day(log.date), href: `/work-logs/${log.id}`, text: [log.title, ...parts].join("\n"), at: log.date });
  }

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

const SYSTEM_PROMPT = `You answer questions about the user's own work records in WorkNest (work logs, to-dos, follow-ups, notes, tickets, resources).

Rules:
- Use ONLY the numbered SOURCES. Never invent people, dates, numbers or events.
- Cite every fact with its source number in square brackets, like [2]. Several: [1][3].
- If the sources don't answer the question, say plainly that you couldn't find it in their workspace, and mention the closest related thing if there is one.
- Speak to the user as "you". Be brief: 1-4 short sentences, or a short "- " list when listing several items. Plain text, no headings, no tables.
- Give dates as "14 Oct" (add the year only if it isn't this year).
- Don't mention "sources" or "records" in general terms; just answer.`;

export async function askWorkspace(userId: string, input: { question: string; history: AskTurn[]; today: Date }): Promise<AskResult> {
  const [config, settings] = await Promise.all([getOpenRouterConfig(userId), getUserSettings(userId)]);
  if (!config) return { ok: false, message: aiFailureMessage({ reason: "not_configured" }) };

  const history = input.history.slice(-MAX_HISTORY);
  const terms = searchTerms(input.question, history.at(-1)?.question ?? "");
  const matched = terms.length ? rank(await findCandidates(userId, terms, settings.ticketsEnabled), terms) : [];
  // Few or no keyword hits: add what's current, so broad questions still get an answer.
  const sources = matched.length >= 4 ? matched : [
    ...matched,
    ...(await findCandidates(userId, [], settings.ticketsEnabled)).filter((c) => !matched.some((m) => m.href === c.href)),
  ].slice(0, MAX_SOURCES + 6);

  const sourceText = sources.length
    ? sources.map((s, i) => `[${i + 1}] ${s.kind}: ${s.title} (${s.date ?? "no date"})\n${s.text.slice(0, MAX_RECORD_CHARS)}`).join("\n\n")
    : "(nothing matched)";
  const conversation = history.length
    ? `EARLIER IN THIS CHAT:\n${history.map((turn) => `User: ${turn.question}\nYou: ${turn.answer.replace(/\[\d+\]/g, "")}`).join("\n")}\n\n`
    : "";

  const ai = await openRouterComplete(config, {
    system: SYSTEM_PROMPT,
    user: `TODAY: ${format(new Date(input.today.getTime() + input.today.getTimezoneOffset() * 60_000), "EEEE d MMM yyyy")}\n\nSOURCES:\n${sourceText}\n\n${conversation}QUESTION: ${input.question}`,
    maxChars: 4_000,
    maxTokens: 3_000,
    checkReasoning: false,
  });
  if (!ai.ok) return { ok: false, message: aiFailureMessage(ai) };

  // Keep only the sources the answer cites, renumbered in order of first mention.
  const order: number[] = [];
  for (const match of ai.text.matchAll(/\[(\d+)\]/g)) {
    const n = Number(match[1]);
    if (n >= 1 && n <= sources.length && !order.includes(n)) order.push(n);
  }
  const answer = ai.text
    .replace(/\[(\d+)\]/g, (whole, raw: string) => {
      const index = order.indexOf(Number(raw));
      return index === -1 ? "" : `[${index + 1}]`;
    })
    .replace(/[ \t]+([.,;:])/g, "$1")
    .trim();
  const cited = order.map((n, i) => {
    const { kind, title, date, href } = sources[n - 1]!;
    return { n: i + 1, kind, title, date, href };
  });
  return { ok: true, answer, sources: cited, model: ai.model };
}

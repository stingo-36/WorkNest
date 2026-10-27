import "server-only";

import type { JSONContent } from "@tiptap/core";
import { marked, type Token, type Tokens } from "marked";

import { createNote, getNote, updateNote } from "@/lib/note-store";
import { type NoteInput, noteSchema } from "@/lib/notes";
import { prisma } from "@/lib/prisma";

/**
 * Markdown → notebook, for documents pasted into Ask.
 *
 *   # Title           → the notebook (matched by title: created if new, updated if it exists),
 *                       with ONE section of the same name (owner, 2026-10-26: not a section per ##)
 *   ## Heading        → a page
 *   ### / #### …      → headings inside that page
 *   text before the first ## → an "Overview" page
 *
 * Parsing is plain code, not the AI: the pasted text (commands, tables, links)
 * lands in the pages exactly as written. Updating makes the notebook match the
 * paste: pages are matched by title, and pages (and sections) the paste doesn't
 * have are removed — the card says how many before anything is saved.
 */

export type ParsedNotebook = { title: string; sections: Array<{ title: string; pages: Array<{ title: string; content: JSONContent }> }> };

/** What confirming the import would do — shown on Ask's card before anything is saved. */
export type NotebookPlan = {
  mode: "create" | "update";
  title: string;
  /** The existing notebook being updated. */
  noteId: string | null;
  sections: number;
  pages: number;
  newPages: number;
  changedPages: number;
  /** Pages in the notebook that the paste doesn't have; confirming removes them. */
  removedPages: number;
  /** The notebook's sections or page order change (e.g. a section per heading → one section). */
  reshaped: boolean;
};

const OVERVIEW = "Overview";
const MAX_TITLE = 200;

/** Matching key: case, spacing and a leading "3." don't matter, so renumbered steps still match. */
const key = (title: string) => title.toLowerCase().replace(/^\s*\d+[.)]\s*/, "").replace(/\s+/g, " ").trim();
const clip = (title: string) => title.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE);

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };
const decode = (text: string) => text.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, name: string) => ENTITIES[name]!);

type Mark = { type: string; attrs?: Record<string, unknown> };

function inline(tokens: Token[] | undefined, marks: Mark[] = []): JSONContent[] {
  const out: JSONContent[] = [];
  const text = (value: string, extra: Mark[] = marks) => {
    if (value) out.push(extra.length ? { type: "text", text: value, marks: extra } : { type: "text", text: value });
  };
  for (const token of tokens ?? []) {
    switch (token.type) {
      case "strong": out.push(...inline(token.tokens, [...marks, { type: "bold" }])); break;
      case "em": out.push(...inline(token.tokens, [...marks, { type: "italic" }])); break;
      case "del": out.push(...inline(token.tokens, [...marks, { type: "strike" }])); break;
      // TipTap's code mark excludes every other mark except a link.
      case "codespan": text(decode(token.text), [...marks.filter((m) => m.type === "link"), { type: "code" }]); break;
      case "link": out.push(...inline(token.tokens, [...marks, { type: "link", attrs: { href: token.href } }])); break;
      case "image": text(token.text || token.href, [...marks, { type: "link", attrs: { href: token.href } }]); break;
      case "br": out.push({ type: "hardBreak" }); break;
      case "text":
        if (token.tokens?.length) out.push(...inline(token.tokens, marks));
        else text(decode(token.text));
        break;
      default: text(decode("text" in token && typeof token.text === "string" ? token.text : token.raw));
    }
  }
  return out;
}

const paragraph = (tokens: Token[] | undefined): JSONContent => {
  const content = inline(tokens);
  return content.length ? { type: "paragraph", content } : { type: "paragraph" };
};

function listItem(item: Tokens.ListItem, task: boolean): JSONContent {
  const content = blocks(item.tokens.filter((t) => t.type !== "checkbox"));
  // A list item has to open with a paragraph.
  if (content[0]?.type !== "paragraph") content.unshift({ type: "paragraph" });
  return task ? { type: "taskItem", attrs: { checked: Boolean(item.checked) }, content } : { type: "listItem", content };
}

function blocks(tokens: Token[]): JSONContent[] {
  const out: JSONContent[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case "space": break;
      case "paragraph": out.push(paragraph(token.tokens)); break;
      // Tight list items hold a bare text token.
      case "text": out.push(paragraph(token.tokens ?? [token])); break;
      // Inside a page, #### is the top heading level (the page title sits above it).
      case "heading": out.push({ type: "heading", attrs: { level: Math.min(Math.max(token.depth - 2, 1), 3) }, content: inline(token.tokens) }); break;
      case "code": out.push({ type: "codeBlock", attrs: { language: token.lang?.trim().split(/\s/)[0] || "plaintext" }, ...(token.text ? { content: [{ type: "text", text: token.text }] } : {}) }); break;
      case "blockquote": {
        const content = blocks(token.tokens ?? []);
        out.push({ type: "blockquote", content: content.length ? content : [{ type: "paragraph" }] });
        break;
      }
      case "hr": out.push({ type: "horizontalRule" }); break;
      case "list": {
        const list = token as Tokens.List;
        const task = list.items.length > 0 && list.items.every((item) => item.task);
        const items = list.items.map((item) => listItem(item, task));
        out.push(
          task ? { type: "taskList", content: items }
          : list.ordered ? { type: "orderedList", attrs: { start: Number(list.start) || 1 }, content: items }
          : { type: "bulletList", content: items },
        );
        break;
      }
      case "table": {
        const table = token as Tokens.Table;
        const row = (cells: Tokens.TableCell[], cell: "tableHeader" | "tableCell"): JSONContent => ({ type: "tableRow", content: cells.map((c) => ({ type: cell, content: [paragraph(c.tokens)] })) });
        out.push({ type: "table", content: [row(table.header, "tableHeader"), ...table.rows.map((r) => row(r, "tableCell"))] });
        break;
      }
      default: {
        const raw = token.raw.trim();
        if (raw) out.push({ type: "paragraph", content: [{ type: "text", text: raw }] });
      }
    }
  }
  return out;
}

/** A page body; a leading or trailing `---` (a divider between sections in the source) is dropped. */
function pageDoc(tokens: Token[]): JSONContent | null {
  const content = blocks(tokens);
  while (content[0]?.type === "horizontalRule") content.shift();
  while (content.at(-1)?.type === "horizontalRule") content.pop();
  return content.length ? { type: "doc", content } : null;
}

/** A heading's words without its markdown (so `machine_name` keeps its underscore). */
const headingText = (token: Tokens.Heading) => clip(inline(token.tokens).map((node) => node.text ?? "").join(""));

/**
 * The notebook in a pasted document, or null when it isn't one: it needs a
 * `# Title` and either `##` headings or a few lines of text. Anything above the
 * `#` line (e.g. "add this to my notebooks:") is ignored.
 */
export function parseNotebookMarkdown(markdown: string): ParsedNotebook | null {
  const tokens = marked.lexer(markdown.replace(/\r\n?/g, "\n"), { gfm: true });
  const start = tokens.findIndex((t) => t.type === "heading" && t.depth === 1);
  if (start === -1) return null;
  const title = headingText(tokens[start] as Tokens.Heading);
  const body = tokens.slice(start + 1);
  const hasSections = body.some((t) => t.type === "heading" && t.depth === 2);
  if (title.length < 2 || (!hasSections && markdown.length < 200)) return null;

  // One page per ## (a second # counts as one too); ### and deeper stay inside the page.
  const chunks: Array<{ title: string; tokens: Token[] }> = [{ title: OVERVIEW, tokens: [] }];
  for (const token of body) {
    if (token.type === "heading" && token.depth <= 2) chunks.push({ title: headingText(token as Tokens.Heading), tokens: [] });
    else chunks.at(-1)!.tokens.push(token);
  }
  const pages = chunks.flatMap((chunk, i) => {
    const content = pageDoc(chunk.tokens);
    // A ## with nothing under it is still a (blank) page; an empty overview isn't.
    if (!content && i === 0) return [];
    return [{ title: chunk.title || "Untitled", content: content ?? { type: "doc", content: [{ type: "paragraph" }] } }];
  });
  return pages.length ? { title, sections: [{ title, pages }] } : null;
}

/** The live notebook with this title, most recently touched first. */
async function findNotebook(userId: string, title: string) {
  const candidates = await prisma.note.findMany({
    where: { userId, deletedAt: null, title: { equals: title, mode: "insensitive" } },
    orderBy: { updatedAt: "desc" },
    take: 1,
    select: { id: true },
  });
  return candidates[0] ? getNote(userId, candidates[0].id) : null;
}

/** Postgres `jsonb` reorders object keys, so compare with keys sorted. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
const sameContent = (a: unknown, b: unknown) => canonical(a) === canonical(b);

/**
 * The existing notebook reshaped to match the paste: the tree `updateNote` saves
 * (which deletes whatever it leaves out), and what changes. A page is matched by
 * title anywhere in the notebook, so an old layout (a section per heading) folds
 * into the new one; a matched page in the same section keeps its id.
 */
function merge(existing: NonNullable<Awaited<ReturnType<typeof getNote>>>, parsed: ParsedNotebook) {
  const counts = { newPages: 0, changedPages: 0, removedPages: 0 };
  const oldPages = existing.sections.flatMap((section) => section.pages.map((page) => ({ ...page, sectionId: section.id })));
  const usedSections = new Set<string>();
  const usedPages = new Set<string>();
  const sections: NoteInput["sections"] = parsed.sections.map((section, order) => {
    const match = existing.sections.find((s) => !usedSections.has(s.id) && key(s.title) === key(section.title)) ?? existing.sections.find((s) => !usedSections.has(s.id));
    if (match) usedSections.add(match.id);
    const pages = section.pages.map((page, i) => {
      const old = oldPages.find((p) => !usedPages.has(p.id) && key(p.title) === key(page.title));
      if (!old) {
        counts.newPages++;
        return { title: page.title, content: page.content, order: i };
      }
      usedPages.add(old.id);
      if (!sameContent(old.content, page.content) || old.title !== page.title) counts.changedPages++;
      return { ...(old.sectionId === match?.id ? { id: old.id } : {}), title: page.title, content: page.content, order: i };
    });
    return { ...(match ? { id: match.id } : {}), title: section.title, order, pages };
  });
  counts.removedPages = oldPages.filter((p) => !usedPages.has(p.id)).length;
  const input: NoteInput = {
    title: parsed.title,
    description: existing.description ?? "",
    iconName: existing.iconName ?? "",
    iconLibrary: (existing.iconLibrary as NoteInput["iconLibrary"]) ?? undefined,
    sections,
  };
  // A changed layout counts as a change even when every page's text is the same.
  const reshaped = existing.sections.length !== sections.length || oldPages.some((p, i) => p.title !== sections.flatMap((s) => s.pages)[i]?.title);
  return { input, counts, reshaped };
}

function newNotebook(parsed: ParsedNotebook): NoteInput {
  return {
    title: parsed.title,
    sections: parsed.sections.map((section, order) => ({ title: section.title, order, pages: section.pages.map((page, i) => ({ ...page, order: i })) })),
  };
}

const pageCount = (parsed: ParsedNotebook) => parsed.sections.reduce((sum, s) => sum + s.pages.length, 0);

/** What importing would do, without saving anything. */
export async function planNotebookImport(userId: string, parsed: ParsedNotebook): Promise<NotebookPlan> {
  const existing = await findNotebook(userId, parsed.title);
  const base = { title: parsed.title, sections: parsed.sections.length, pages: pageCount(parsed) };
  if (!existing) return { ...base, mode: "create", noteId: null, newPages: base.pages, changedPages: 0, removedPages: 0, reshaped: false };
  const { counts, reshaped } = merge(existing, parsed);
  return { ...base, mode: "update", noteId: existing.id, ...counts, reshaped };
}

/** Creates the notebook, or merges into the one with the same title. Returns its id. */
export async function importNotebook(userId: string, parsed: ParsedNotebook): Promise<{ noteId: string; mode: "create" | "update" }> {
  const existing = await findNotebook(userId, parsed.title);
  // Same checks the note editor's save goes through.
  if (existing && (await updateNote(userId, existing.id, noteSchema.parse(merge(existing, parsed).input)))) return { noteId: existing.id, mode: "update" };
  return { noteId: await createNote(userId, noteSchema.parse(newNotebook(parsed))), mode: "create" };
}

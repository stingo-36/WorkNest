import "server-only";

import type { JSONContent } from "@tiptap/core";
import { marked, type Token, type Tokens } from "marked";

import { createNote, getNote, updateNote } from "@/lib/note-store";
import { type NoteInput, noteSchema } from "@/lib/notes";
import { ASK_MESSAGE_MAX } from "@/lib/validation";

/**
 * Markdown → notebook pages, for documents pasted into Ask.
 *
 * The AI decides what to do with a document — which notebook, new or existing,
 * its title, description and icon, or to ask first (lib/ask.ts). This file only
 * turns the text into pages, so commands, tables and links land exactly as
 * written instead of being retyped by a model:
 *
 *   # Title           → the document's own title (a suggestion; the AI picks the notebook's)
 *   ## Heading        → a page, all in ONE section named after the notebook
 *                       (owner, 2026-10-26: not a section per ##)
 *   ### / #### …      → headings inside that page
 *   text before the first ## → an "Overview" page
 *
 * Saving into an existing notebook makes it match the document: pages are
 * matched by title, and pages (and sections) the document doesn't have are
 * removed — the card counts them before anything is saved.
 */

type Page = { title: string; content: JSONContent };
type ParsedNotebook = { title: string; sections: Array<{ title: string; pages: Page[] }> };
/** A pasted document: its own `#` title, if it has one, and the pages it becomes. */
export type ParsedDocument = { title: string | null; pages: Page[]; chars: number };

/** What saving a document into a notebook would do to its pages — shown on Ask's card first. */
export type DocumentPlan = {
  pages: number;
  newPages: number;
  changedPages: number;
  /** Pages in the notebook that the document doesn't have; saving removes them. */
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
 * The document inside an Ask message, and the words around it: "add this to my
 * Drupal notebook: # …" → instruction + document. A message counts as carrying
 * one when it has markdown headings with some body, or is too long to be a chat
 * message. What to do with it is the AI's call.
 */
export function splitMessage(message: string): { instruction: string; document: string } | null {
  const text = message.replace(/\r\n?/g, "\n");
  const heading = /^#{1,6}[ \t]+\S/m.exec(text);
  if (heading) {
    const document = text.slice(heading.index);
    const headings = document.match(/^#{1,6}[ \t]+\S/gm)?.length ?? 0;
    if (headings >= 2 || document.length >= 300) return { instruction: text.slice(0, heading.index).trim(), document };
  }
  return text.length > ASK_MESSAGE_MAX ? { instruction: "", document: text } : null;
}

/** The pages a document becomes, or null when there's nothing in it. Anything above its `#` line is skipped. */
export function parseDocument(markdown: string): ParsedDocument | null {
  const tokens = marked.lexer(markdown.replace(/\r\n?/g, "\n"), { gfm: true });
  const start = tokens.findIndex((t) => t.type === "heading" && t.depth === 1);
  const title = start === -1 ? null : headingText(tokens[start] as Tokens.Heading) || null;
  const body = start === -1 ? tokens : tokens.slice(start + 1);

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
  return pages.length ? { title, pages, chars: markdown.length } : null;
}

/** What the AI is told about a document: enough to decide, without the whole text. */
export function documentOutline(doc: ParsedDocument, markdown: string) {
  const titles = doc.pages.map((page) => `"${page.title}"`);
  return [
    `Its own title: ${doc.title ? `"${doc.title}"` : "none (it has no # heading)"}`,
    `Length: ${doc.chars} characters. Saved, it becomes ${doc.pages.length} page${doc.pages.length === 1 ? "" : "s"}: ${titles.slice(0, 40).join(", ")}${titles.length > 40 ? ` and ${titles.length - 40} more` : ""}`,
    `Start of the text:\n${markdown.slice(0, 700)}${markdown.length > 700 ? "…" : ""}`,
  ].join("\n");
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

type Existing = NonNullable<Awaited<ReturnType<typeof getNote>>>;
export type NotebookDetails = { title: string; description?: string | null; iconName?: string | null; iconLibrary?: string | null };

/** The document as a one-section notebook named `title`. */
const asNotebook = (doc: ParsedDocument, title: string): ParsedNotebook => ({ title, sections: [{ title, pages: doc.pages }] });

/**
 * The existing notebook reshaped to match the document: the tree `updateNote`
 * saves (which deletes whatever it leaves out), and what changes. A page is
 * matched by title anywhere in the notebook, so an old layout (a section per
 * heading) folds into the new one; a matched page in the same section keeps its id.
 */
function merge(existing: Existing, parsed: ParsedNotebook, details: NotebookDetails) {
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
  // An icon is a pair; only a whole new one replaces the old.
  const icon = details.iconName && details.iconLibrary ? { iconName: details.iconName, iconLibrary: details.iconLibrary } : { iconName: existing.iconName, iconLibrary: existing.iconLibrary };
  const input: NoteInput = {
    title: parsed.title,
    description: details.description ?? existing.description ?? "",
    iconName: icon.iconName ?? "",
    iconLibrary: (icon.iconLibrary as NoteInput["iconLibrary"]) ?? undefined,
    sections,
  };
  // A changed layout counts as a change even when every page's text is the same.
  const reshaped = existing.sections.length !== sections.length || oldPages.some((p, i) => p.title !== sections.flatMap((s) => s.pages)[i]?.title);
  return { input, counts, reshaped };
}

/** What saving `doc` would do: into notebook `noteId`, or (null) as a new one. Null when that notebook isn't the user's. */
export async function planDocumentSave(userId: string, doc: ParsedDocument, noteId: string | null, title: string): Promise<DocumentPlan | null> {
  if (!noteId) return { pages: doc.pages.length, newPages: doc.pages.length, changedPages: 0, removedPages: 0, reshaped: false };
  const existing = await getNote(userId, noteId);
  if (!existing) return null;
  const { counts, reshaped } = merge(existing, asNotebook(doc, title), { title });
  return { pages: doc.pages.length, ...counts, reshaped };
}

/** Saves `doc` into notebook `noteId` (making it match), or as a new notebook. Returns its id. */
export async function saveDocument(userId: string, doc: ParsedDocument, noteId: string | null, details: NotebookDetails): Promise<{ noteId: string; mode: "create" | "update" } | null> {
  const parsed = asNotebook(doc, details.title);
  // Same checks the note editor's save goes through.
  if (noteId) {
    const existing = await getNote(userId, noteId);
    if (!existing || !(await updateNote(userId, noteId, noteSchema.parse(merge(existing, parsed, details).input)))) return null;
    return { noteId, mode: "update" };
  }
  const input: NoteInput = {
    title: details.title,
    description: details.description ?? "",
    ...(details.iconName && details.iconLibrary ? { iconName: details.iconName, iconLibrary: details.iconLibrary as NoteInput["iconLibrary"] } : {}),
    sections: parsed.sections.map((section, order) => ({ title: section.title, order, pages: section.pages.map((page, i) => ({ ...page, order: i })) })),
  };
  return { noteId: await createNote(userId, noteSchema.parse(input)), mode: "create" };
}

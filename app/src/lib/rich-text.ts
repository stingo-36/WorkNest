/**
 * Helpers for Tracker updates written in the rich editor (TipTap JSON).
 * Shared by client and server, so no `server-only` and no DOM.
 *
 * The plain text is what everything else reads (search, AI summaries, Work
 * Logs), so lists keep a "- " prefix and blocks keep their line breaks.
 */

type DocNode = { type?: string; text?: string; attrs?: Record<string, unknown>; content?: DocNode[]; marks?: Array<{ type?: string; attrs?: Record<string, unknown> }> };

/** Where an uploaded Tracker file is served from; ids in a doc are found by this prefix. */
export const TRACKER_FILE_PATH = "/api/tracker-files/";

/** Bytes per uploaded image or file. Vercel functions accept ~4.5 MB per request. */
export const MAX_TRACKER_FILE_BYTES = 4 * 1024 * 1024;

const BLOCKS = new Set(["paragraph", "heading", "blockquote", "codeBlock", "listItem", "taskItem", "tableRow", "image", "horizontalRule"]);

function walk(node: DocNode, out: string[], prefix: string) {
  if (node.type === "text") { out.push(node.text ?? ""); return; }
  if (node.type === "hardBreak") { out.push("\n"); return; }
  if (node.type === "image") { out.push(`[image: ${String(node.attrs?.alt || "image")}]`); return; }
  const children = node.content ?? [];
  if (node.type === "bulletList" || node.type === "orderedList" || node.type === "taskList") {
    children.forEach((child, i) => {
      const marker = node.type === "orderedList" ? `${i + 1}. ` : node.type === "taskList" ? (child.attrs?.checked ? "[x] " : "[ ] ") : "- ";
      walk(child, out, prefix + marker);
    });
    return;
  }
  if (node.type === "listItem" || node.type === "taskItem") {
    // The first block in the item carries the marker; nested lists indent.
    children.forEach((child, i) => walk(child, out, i === 0 ? prefix : prefix.replace(/[^\s]/g, " ")));
    return;
  }
  if (BLOCKS.has(node.type ?? "")) {
    const line: string[] = [];
    children.forEach((child) => walk(child, line, ""));
    out.push(`${prefix}${line.join("")}\n`);
    return;
  }
  children.forEach((child) => walk(child, out, prefix));
}

/** The doc as plain text (≤ 10,000 chars, the `note` column's limit). */
export function docToText(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  const out: string[] = [];
  walk(doc as DocNode, out, "");
  return out.join("").replace(/\n{3,}/g, "\n\n").trim().slice(0, 10_000);
}

/** Ids of uploaded files the doc points at (images and file links). */
export function docFileIds(doc: unknown): string[] {
  const ids = new Set<string>();
  const visit = (node: DocNode) => {
    const urls = [node.attrs?.src, ...(node.marks ?? []).map((mark) => mark.attrs?.href)];
    for (const url of urls) {
      if (typeof url === "string" && url.startsWith(TRACKER_FILE_PATH)) ids.add(url.slice(TRACKER_FILE_PATH.length).split(/[?#/]/)[0]);
    }
    node.content?.forEach(visit);
  };
  if (doc && typeof doc === "object") visit(doc as DocNode);
  return [...ids].filter(Boolean).slice(0, 100);
}

/**
 * A Markdown field as one plain preview line (Favourites cards, search
 * snippets): images and markers dropped, links reduced to their text.
 */
export function markdownPreview(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/```[^\n]*\n?/g, "")
    .replace(/(\*\*|__|~~|`)/g, "")
    .replace(/(^|\W)[*_]([^*_\n]+)[*_](?=\W|$)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

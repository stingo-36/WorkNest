import type { JSONContent } from "@tiptap/core";

/** Characters per rendered line at the note's 80ch measure (a little under, for wrapping). */
const CHARS_PER_LINE = 85;
/** One line of `.note-prose` body: 15px × 1.75. */
const LINE = 26;

function textLength(node: JSONContent): number {
  if (typeof node.text === "string") return node.text.length;
  return (node.content ?? []).reduce((sum, child) => sum + textLength(child), 0);
}

/**
 * A rough rendered height (px) for a page body that hasn't mounted yet.
 *
 * Unmounted pages used to hold a fixed three-line skeleton, so a long page grew
 * by a screen or more the moment it mounted — and while you scrolled or jumped
 * past a run of them, everything below lurched. Reserving about the right
 * height keeps the page still. It only has to be close, not exact.
 */
export function estimateDocHeight(doc: JSONContent): number {
  let height = 0;
  const walk = (node: JSONContent) => {
    switch (node.type) {
      case "paragraph":
        height += LINE * Math.max(1, Math.ceil(textLength(node) / CHARS_PER_LINE)) + 8;
        return;
      case "heading":
        height += 56;
        return;
      case "codeBlock":
        height += 48 + 22 * (node.content?.map((c) => c.text ?? "").join("").split("\n").length ?? 1);
        return;
      case "tableRow":
        height += 38;
        return;
      case "horizontalRule":
        height += 48;
        return;
      default:
        node.content?.forEach(walk);
    }
  };
  walk(doc);
  return Math.round(height);
}

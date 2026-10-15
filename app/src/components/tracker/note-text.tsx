"use client";

import { Bold, Italic, List } from "lucide-react";
import { Fragment, type ReactNode } from "react";

import { cn } from "@/components/cn";

/**
 * Tracker updates stay plain text (search, AI summaries and Work Logs read them
 * as-is), with a small Markdown subset for looks: **bold**, *italic*, and
 * "- " bullet lines. Rendered as React nodes — never as HTML.
 */

const INLINE = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|https?:\/\/[^\s]+)/g;

function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    if (/^https?:\/\//.test(part)) return <a key={i} href={part} target="_blank" rel="noreferrer" className="font-medium text-accent-text underline underline-offset-2 [overflow-wrap:anywhere]">{part}</a>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/** Lines → paragraphs, runs of "- " lines → a bullet list. */
export function FormattedNote({ text, className }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (!bullets.length) return;
    blocks.push(<ul key={`ul${blocks.length}`} className="list-disc pl-5">{bullets.map((item, i) => <li key={i}>{inline(item)}</li>)}</ul>);
    bullets = [];
  };
  for (const line of text.split("\n")) {
    const bullet = /^\s*[-•]\s+(.*)$/.exec(line);
    if (bullet) { bullets.push(bullet[1]); continue; }
    flush();
    blocks.push(line.trim() ? <p key={`p${blocks.length}`}>{inline(line)}</p> : <p key={`p${blocks.length}`} aria-hidden="true" className="h-2" />);
  }
  flush();
  return <div className={cn("flex flex-col gap-0.5 [overflow-wrap:anywhere]", className)}>{blocks}</div>;
}

type Format = "bold" | "italic" | "list";

/** Wrap the selection (or the word placeholder) in markers, or prefix the selected lines with "- ". */
function applyFormat(textarea: HTMLTextAreaElement, value: string, format: Format) {
  const { selectionStart: start, selectionEnd: end } = textarea;
  const selected = value.slice(start, end);
  if (format === "list") {
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const block = value.slice(lineStart, end);
    const listed = block.split("\n").map((line) => (line.startsWith("- ") ? line : `- ${line}`)).join("\n");
    return { next: value.slice(0, lineStart) + listed + value.slice(end), from: lineStart, to: lineStart + listed.length };
  }
  const mark = format === "bold" ? "**" : "*";
  const body = selected || (format === "bold" ? "bold text" : "italic text");
  return { next: value.slice(0, start) + mark + body + mark + value.slice(end), from: start + mark.length, to: start + mark.length + body.length };
}

/**
 * Bold / Italic / List buttons for a plain textarea, plus ⌘/Ctrl+B and +I via
 * `formatKey`. Works on the textarea by id so callers keep their own state.
 */
export function useNoteFormatting(textareaId: string, value: string, onChange: (next: string) => void) {
  function format(kind: Format) {
    const textarea = document.getElementById(textareaId) as HTMLTextAreaElement | null;
    if (!textarea) return;
    const { next, from, to } = applyFormat(textarea, value, kind);
    onChange(next);
    // After React writes the new value, restore focus and the selection.
    requestAnimationFrame(() => { textarea.focus(); textarea.setSelectionRange(from, to); });
  }

  function formatKey(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!(event.metaKey || event.ctrlKey)) return false;
    const key = event.key.toLowerCase();
    if (key !== "b" && key !== "i") return false;
    event.preventDefault();
    format(key === "b" ? "bold" : "italic");
    return true;
  }

  const bar = (
    <div role="toolbar" aria-label="Formatting" aria-controls={textareaId} className="flex items-center gap-0.5">
      {([
        { kind: "bold", label: "Bold (⌘/Ctrl+B)", Icon: Bold },
        { kind: "italic", label: "Italic (⌘/Ctrl+I)", Icon: Italic },
        { kind: "list", label: "Bulleted list", Icon: List },
      ] as const).map(({ kind, label, Icon }) => (
        <button
          key={kind}
          type="button"
          aria-label={label}
          title={label}
          // Keep the textarea's selection: don't take focus on mousedown.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => format(kind)}
          className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-md text-text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-text"
        >
          <Icon className="size-4.5" strokeWidth={2} aria-hidden="true" />
        </button>
      ))}
    </div>
  );

  return { bar, formatKey };
}

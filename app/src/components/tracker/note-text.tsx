"use client";

import { Fragment, type ReactNode } from "react";

import { cn } from "@/components/cn";

/**
 * Plain-text Tracker updates (written before the rich editor, or by Quick log)
 * with a small Markdown subset for looks: **bold**, *italic*, and "- " bullet
 * lines. Rendered as React nodes — never as HTML. Rich updates use `UpdateDoc`.
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

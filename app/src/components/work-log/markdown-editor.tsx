"use client";

import type { Editor, JSONContent } from "@tiptap/core";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import {
  Bold,
  Code,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useRef, type ReactNode } from "react";

import { cn } from "@/components/cn";

type MarkdownEditorProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  minHeight?: string;
};

const escapeHtml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function inlineMarkdown(value: string) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/~~([^~]+)~~/g, "<s>$1</s>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>");
}

/** Convert the stored Markdown string into the small schema used by this editor. */
function markdownToHtml(markdown: string) {
  if (!markdown.trim()) return "<p></p>";

  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const output: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (/^```/.test(line)) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) code.push(lines[index++]);
      index += 1;
      output.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      output.push(`<h${heading[1].length}>${inlineMarkdown(heading[2])}</h${heading[1].length}>`);
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quote.push(lines[index++].replace(/^>\s?/, ""));
      }
      output.push(`<blockquote><p>${quote.map(inlineMarkdown).join("<br>")}</p></blockquote>`);
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        items.push(`<li><p>${inlineMarkdown(lines[index++].replace(/^\s*[-*+]\s+/, ""))}</p></li>`);
      }
      output.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(`<li><p>${inlineMarkdown(lines[index++].replace(/^\s*\d+\.\s+/, ""))}</p></li>`);
      }
      output.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    const paragraph: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,3})\s+|^```|^>\s?|^\s*[-*+]\s+|^\s*\d+\.\s+/.test(lines[index])
    ) {
      paragraph.push(lines[index++]);
    }
    output.push(`<p>${paragraph.map(inlineMarkdown).join("<br>")}</p>`);
  }

  return output.join("");
}

function renderInline(node: JSONContent): string {
  if (node.type === "hardBreak") return "  \n";
  if (node.type !== "text") return (node.content ?? []).map(renderInline).join("");

  let value = node.text ?? "";
  for (const mark of node.marks ?? []) {
    if (mark.type === "bold") value = `**${value}**`;
    if (mark.type === "italic") value = `*${value}*`;
    if (mark.type === "strike") value = `~~${value}~~`;
    if (mark.type === "code") value = `\`${value}\``;
  }
  return value;
}

function nodeToMarkdown(node: JSONContent, depth = 0): string {
  const children = node.content ?? [];
  const inline = () => children.map(renderInline).join("");

  switch (node.type) {
    case "doc":
      return children.map((child) => nodeToMarkdown(child, depth)).filter(Boolean).join("\n\n");
    case "paragraph":
      return inline();
    case "heading":
      return `${"#".repeat(Number(node.attrs?.level ?? 2))} ${inline()}`;
    case "bulletList":
      return children.map((child) => nodeToMarkdown(child, depth)).join("\n");
    case "orderedList":
      return children.map((child, index) => `${index + 1}. ${nodeToMarkdown(child, depth + 1).trim()}`).join("\n");
    case "listItem": {
      const [first, ...rest] = children;
      const lead = first ? nodeToMarkdown(first, depth + 1) : "";
      const continuation = rest.map((child) => nodeToMarkdown(child, depth + 1)).join("\n");
      return `${depth > 0 ? "" : "- "}${lead}${continuation ? `\n  ${continuation}` : ""}`;
    }
    case "blockquote":
      return children.map((child) => nodeToMarkdown(child, depth)).join("\n").split("\n").map((line) => `> ${line}`).join("\n");
    case "codeBlock":
      return `\`\`\`\n${children.map(renderInline).join("")}\n\`\`\``;
    case "horizontalRule":
      return "---";
    default:
      return children.map((child) => nodeToMarkdown(child, depth)).join("");
  }
}

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "grid size-9 cursor-pointer place-items-center rounded-lg text-text-muted transition-colors duration-150 md:size-8",
        "hover:bg-surface-3 hover:text-text disabled:pointer-events-none disabled:opacity-35",
        active && "bg-surface-3 text-text",
      )}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      bullet: current.isActive("bulletList"),
      ordered: current.isActive("orderedList"),
      quote: current.isActive("blockquote"),
      code: current.isActive("code"),
      undo: current.can().undo(),
      redo: current.can().redo(),
    }),
  });

  return (
    <div className="flex min-h-11 flex-wrap items-center gap-0.5 border-b border-border bg-surface-2 px-2 py-1" role="toolbar" aria-label="Text formatting">
      <ToolButton label="Bold (Ctrl+B)" active={state.bold} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="size-4" aria-hidden="true" /></ToolButton>
      <ToolButton label="Italic (Ctrl+I)" active={state.italic} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="size-4" aria-hidden="true" /></ToolButton>
      <ToolButton label="Bullet list" active={state.bullet} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="size-4" aria-hidden="true" /></ToolButton>
      <ToolButton label="Numbered list" active={state.ordered} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="size-4" aria-hidden="true" /></ToolButton>
      <ToolButton label="Quote" active={state.quote} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="size-4" aria-hidden="true" /></ToolButton>
      <ToolButton label="Inline code" active={state.code} onClick={() => editor.chain().focus().toggleCode().run()}><Code className="size-4" aria-hidden="true" /></ToolButton>
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
      <ToolButton label="Undo" disabled={!state.undo} onClick={() => editor.chain().focus().undo().run()}><Undo2 className="size-4" aria-hidden="true" /></ToolButton>
      <ToolButton label="Redo" disabled={!state.redo} onClick={() => editor.chain().focus().redo().run()}><Redo2 className="size-4" aria-hidden="true" /></ToolButton>
      <span className="ml-auto hidden px-2 text-2xs font-medium text-text-subtle md:inline">* + Space makes a list</span>
    </div>
  );
}

function useMarkdownExtensions(placeholder?: string) {
  return useMemo(
    () => [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      ...(placeholder ? [Placeholder.configure({ placeholder })] : []),
    ],
    [placeholder],
  );
}

export function MarkdownEditor({
  id,
  value,
  onChange,
  onBlur,
  placeholder,
  ariaLabel,
  className,
  minHeight = "min-h-28",
}: MarkdownEditorProps) {
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);
  const lastEmitted = useRef(value);
  const extensions = useMarkdownExtensions(placeholder);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onBlurRef.current = onBlur; }, [onBlur]);

  const editor = useEditor({
    extensions,
    content: markdownToHtml(value),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        id,
        class: cn("worklog-prose worklog-editor-body outline-none", minHeight),
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": ariaLabel ?? "Markdown editor",
      },
    },
    onUpdate: ({ editor: current }) => {
      const next = nodeToMarkdown(current.getJSON()).trimEnd();
      lastEmitted.current = next;
      onChangeRef.current(next);
    },
    onBlur: () => onBlurRef.current?.(),
  });

  useEffect(() => {
    if (!editor || value === lastEmitted.current) return;
    const nextHtml = markdownToHtml(value);
    lastEmitted.current = value;
    editor.commands.setContent(nextHtml, { emitUpdate: false });
  }, [editor, value]);

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border-strong bg-surface transition-[border-color,box-shadow] duration-150 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20", className)}>
      {editor ? <Toolbar editor={editor} /> : <div className="h-11 border-b border-border" />}
      <EditorContent editor={editor} className="cursor-text bg-surface px-4 py-3" onClick={() => editor?.chain().focus().run()} />
    </div>
  );
}

export function MarkdownContent({ value, className }: { value: string; className?: string }) {
  const extensions = useMarkdownExtensions();
  const editor = useEditor({
    extensions,
    content: markdownToHtml(value),
    editable: false,
    immediatelyRender: false,
    editorProps: { attributes: { class: "worklog-prose" } },
  });

  useEffect(() => {
    editor?.commands.setContent(markdownToHtml(value), { emitUpdate: false });
  }, [editor, value]);

  return <EditorContent editor={editor} className={className} />;
}

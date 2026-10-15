"use client";

import type { Editor, JSONContent } from "@tiptap/core";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import {
  Bold,
  Code,
  FileUp,
  Heading2,
  Heading3,
  ImageUp,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Quote,
  Redo2,
  SquareCode,
  Strikethrough,
  Undo2,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

import { cn } from "@/components/cn";
import { insertUploads, TrackerImage, uploadFiles } from "@/components/ui/editor-uploads";
import { toast } from "@/components/ui/toast";
import { TRACKER_FILE_PATH } from "@/lib/rich-text";

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
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    // Links: web addresses, or our own uploads (📎 files).
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/api\/tracker-files\/)[^\s)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<]+)/g, '$1<a href="$2">$2</a>');
}

/** `![alt](/api/tracker-files/…)` on its own line — only our uploads become images. */
const IMAGE_LINE = /^!\[([^\]]*)\]\((\/api\/tracker-files\/[^\s)]+)\)\s*$/;

/** Plain text that's clearly Markdown — converted on paste instead of inserted literally. */
function looksLikeMarkdown(text: string) {
  return /^\s*([-*+]\s|\d+\.\s|#{1,3}\s|>\s|```)/m.test(text) || /\*\*[^*\n]+\*\*/.test(text);
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

    const image = line.trim().match(IMAGE_LINE);
    if (image) {
      output.push(`<img src="${escapeHtml(image[2])}" alt="${escapeHtml(image[1]).replaceAll('"', "&quot;")}">`);
      index += 1;
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
      !/^(#{1,3})\s+|^```|^>\s?|^\s*[-*+]\s+|^\s*\d+\.\s+|^!\[/.test(lines[index])
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
  const link = node.marks?.find((mark) => mark.type === "link");
  if (link?.attrs?.href) value = `[${value}](${String(link.attrs.href)})`;
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
    case "image":
      return String(node.attrs?.src ?? "").startsWith(TRACKER_FILE_PATH) ? `![${String(node.attrs?.alt ?? "").replace(/[[\]]/g, "")}](${String(node.attrs?.src)})` : "";
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

function Toolbar({ editor, uploading, onPick }: { editor: Editor; uploading: boolean; onPick: (kind: "image" | "file") => void }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      strike: current.isActive("strike"),
      code: current.isActive("code"),
      h2: current.isActive("heading", { level: 2 }),
      h3: current.isActive("heading", { level: 3 }),
      bullet: current.isActive("bulletList"),
      ordered: current.isActive("orderedList"),
      quote: current.isActive("blockquote"),
      codeBlock: current.isActive("codeBlock"),
      link: current.isActive("link"),
      undo: current.can().undo(),
      redo: current.can().redo(),
    }),
  });
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState("");
  const linkId = useId();
  const chain = () => editor.chain().focus();
  const icon = "size-4";

  function applyLink() {
    const url = href.trim();
    if (!url) chain().extendMarkRange("link").unsetLink().run();
    else chain().extendMarkRange("link").setLink({ href: /^(https?:\/\/|\/api\/)/i.test(url) ? url : `https://${url}` }).run();
    setLinkOpen(false);
  }

  return (
    <div className="border-b border-border bg-surface-2">
      <div className="flex min-h-11 flex-wrap items-center gap-0.5 px-2 py-1" role="toolbar" aria-label="Text formatting">
        <ToolButton label="Bold (Ctrl+B)" active={state.bold} onClick={() => chain().toggleBold().run()}><Bold className={icon} aria-hidden="true" /></ToolButton>
        <ToolButton label="Italic (Ctrl+I)" active={state.italic} onClick={() => chain().toggleItalic().run()}><Italic className={icon} aria-hidden="true" /></ToolButton>
        <ToolButton label="Strikethrough" active={state.strike} onClick={() => chain().toggleStrike().run()}><Strikethrough className={icon} aria-hidden="true" /></ToolButton>
        <ToolButton label="Inline code" active={state.code} onClick={() => chain().toggleCode().run()}><Code className={icon} aria-hidden="true" /></ToolButton>
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
        <ToolButton label="Heading" active={state.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}><Heading2 className={icon} aria-hidden="true" /></ToolButton>
        <ToolButton label="Subheading" active={state.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}><Heading3 className={icon} aria-hidden="true" /></ToolButton>
        <ToolButton label="Bullet list" active={state.bullet} onClick={() => chain().toggleBulletList().run()}><List className={icon} aria-hidden="true" /></ToolButton>
        <ToolButton label="Numbered list" active={state.ordered} onClick={() => chain().toggleOrderedList().run()}><ListOrdered className={icon} aria-hidden="true" /></ToolButton>
        <ToolButton label="Quote" active={state.quote} onClick={() => chain().toggleBlockquote().run()}><Quote className={icon} aria-hidden="true" /></ToolButton>
        <ToolButton label="Code block" active={state.codeBlock} onClick={() => chain().toggleCodeBlock().run()}><SquareCode className={icon} aria-hidden="true" /></ToolButton>
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
        <ToolButton label="Link" active={state.link} onClick={() => { setHref(String(editor.getAttributes("link").href ?? "")); setLinkOpen(!linkOpen); }}><Link2 className={icon} aria-hidden="true" /></ToolButton>
        <ToolButton label="Upload image" disabled={uploading} onClick={() => onPick("image")}><ImageUp className={icon} aria-hidden="true" /></ToolButton>
        <ToolButton label="Attach file" disabled={uploading} onClick={() => onPick("file")}><FileUp className={icon} aria-hidden="true" /></ToolButton>
        {uploading ? <Loader2 className="size-4 animate-spin text-text-muted motion-reduce:animate-none" aria-label="Uploading" /> : null}
        <span className="ml-auto flex items-center">
          <ToolButton label="Undo" disabled={!state.undo} onClick={() => chain().undo().run()}><Undo2 className={icon} aria-hidden="true" /></ToolButton>
          <ToolButton label="Redo" disabled={!state.redo} onClick={() => chain().redo().run()}><Redo2 className={icon} aria-hidden="true" /></ToolButton>
        </span>
      </div>
      {linkOpen ? (
        <div className="flex items-center gap-2 border-t border-border px-3 py-1.5">
          <label className="sr-only" htmlFor={linkId}>Link address</label>
          <input
            id={linkId}
            autoFocus
            value={href}
            placeholder="Paste a link, then Enter (empty removes it)"
            onChange={(event) => setHref(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") { event.preventDefault(); applyLink(); }
              if (event.key === "Escape") { event.preventDefault(); setLinkOpen(false); editor.commands.focus(); }
            }}
            className="h-9 min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
          />
          <button type="button" onClick={applyLink} className="h-9 cursor-pointer rounded-md px-3 text-sm font-semibold text-accent-text hover:bg-surface-3">Apply</button>
        </div>
      ) : null}
    </div>
  );
}

function useMarkdownExtensions(placeholder?: string) {
  return useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        // Markdown has no underline; links are kept ([text](url)).
        underline: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: "https", HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" } },
      }),
      TrackerImage,
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
  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(files: File[]) {
    const current = editorRef.current;
    if (!files.length || !current) return;
    setUploading(true);
    try {
      insertUploads(current, await uploadFiles(files));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

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
      // Pasted images/files upload; pasted Markdown-looking text becomes formatting.
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (files.length) { event.preventDefault(); void upload(files); return true; }
        const html = event.clipboardData?.getData("text/html");
        const text = event.clipboardData?.getData("text/plain") ?? "";
        if (!html && looksLikeMarkdown(text) && editorRef.current) {
          event.preventDefault();
          editorRef.current.chain().focus().insertContent(markdownToHtml(text)).run();
          return true;
        }
        return false;
      },
      handleDrop: (_view, event) => {
        const files = Array.from((event as DragEvent).dataTransfer?.files ?? []);
        if (!files.length) return false;
        event.preventDefault();
        void upload(files);
        return true;
      },
    },
    onUpdate: ({ editor: current }) => {
      const next = nodeToMarkdown(current.getJSON()).trimEnd();
      lastEmitted.current = next;
      onChangeRef.current(next);
    },
    onBlur: () => onBlurRef.current?.(),
  });

  useEffect(() => { editorRef.current = editor; }, [editor]);

  useEffect(() => {
    if (!editor || value === lastEmitted.current) return;
    const nextHtml = markdownToHtml(value);
    lastEmitted.current = value;
    editor.commands.setContent(nextHtml, { emitUpdate: false });
  }, [editor, value]);

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border-strong bg-surface transition-[border-color,box-shadow] duration-150 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20", className)}>
      {editor ? <Toolbar editor={editor} uploading={uploading} onPick={(kind) => (kind === "image" ? imageInput : fileInput).current?.click()} /> : <div className="h-11 border-b border-border" />}
      <EditorContent editor={editor} className="cursor-text bg-surface px-4 py-3" onClick={() => editor?.chain().focus().run()} />
      <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden onChange={(event) => { void upload(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
      <input ref={fileInput} type="file" multiple hidden onChange={(event) => { void upload(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
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

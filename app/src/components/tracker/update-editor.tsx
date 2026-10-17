"use client";

import type { Editor, JSONContent } from "@tiptap/core";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import {
  Bold,
  Code,
  FileUp,
  Heading2,
  Heading3,
  Highlighter,
  ImageUp,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Loader2,
  Minus,
  Quote,
  Redo2,
  SquareCode,
  Strikethrough,
  Underline,
  Undo2,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/components/cn";
import { buildNoteExtensions } from "@/components/notes/editor-extensions";
import { toast } from "@/components/ui/toast";
import { insertUploads, TrackerImage, uploadFiles } from "@/components/ui/editor-uploads";
import { docFileIds, docToText } from "@/lib/rich-text";

/**
 * The Tracker's rich editor (2026-10-15): the Notes schema (headings, lists,
 * tasks, quotes, code, links, highlight…) plus images. Toolbar inside the field,
 * CKEditor-style. Pasted HTML keeps its formatting; pasted Markdown-looking text
 * is converted; pasted/dropped images and files upload to `/api/tracker-files`.
 */

function trackerExtensions(placeholder?: string) {
  return [...buildNoteExtensions({ placeholder }), TrackerImage];
}

// --- Markdown-ish paste ---------------------------------------------------------

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inlineMd(text: string) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/(^|\W)_([^_\s][^_]*)_(?=\W|$)/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<]+)/g, '$1<a href="$2">$2</a>');
}

const LIST_LINE = /^(\s*)([-*+•]|\d+[.)])\s+(\[[ xX]\]\s+)?(.*)$/;

/** Plain text that's clearly Markdown (lists, headings, quotes, fences, bold). */
function looksLikeMarkdown(text: string) {
  return /^\s*([-*+•]\s|\d+[.)]\s|#{1,3}\s|>\s|```)/m.test(text) || /\*\*[^*\n]+\*\*/.test(text);
}

/** A small Markdown → HTML for pasting; nested lists by indentation. Everything is escaped first. */
function markdownToHtml(text: string) {
  const out: string[] = [];
  const stack: Array<{ tag: "ul" | "ol"; indent: number; task: boolean }> = [];
  const pop = () => out.push(`</li></${stack.pop()!.tag}>`);
  const closeAll = () => { while (stack.length) pop(); };
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      closeAll();
      const body: string[] = [];
      while (++i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i]);
      out.push(`<pre><code>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }
    const item = LIST_LINE.exec(line);
    if (item) {
      const indent = item[1].replace(/\t/g, "  ").length;
      const task = Boolean(item[3]);
      const tag = !task && /\d/.test(item[2]) ? "ol" : "ul";
      // Leave deeper lists, and a same-level list of another kind.
      while (stack.length && (stack[stack.length - 1].indent > indent || (stack[stack.length - 1].indent === indent && (stack[stack.length - 1].tag !== tag || stack[stack.length - 1].task !== task)))) pop();
      const top = stack[stack.length - 1];
      if (top && top.indent === indent) out.push("</li>");
      else { out.push(task ? '<ul data-type="taskList">' : `<${tag}>`); stack.push({ tag, indent, task }); }
      out.push(task ? `<li data-type="taskItem" data-checked="${/x/i.test(item[3] ?? "")}"><p>${inlineMd(item[4])}</p>` : `<li><p>${inlineMd(item[4])}</p>`);
      continue;
    }
    closeAll();
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) out.push(`<h${heading[1].length}>${inlineMd(heading[2])}</h${heading[1].length}>`);
    else if (/^\s*>\s?/.test(line)) out.push(`<blockquote><p>${inlineMd(line.replace(/^\s*>\s?/, ""))}</p></blockquote>`);
    else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) out.push("<hr>");
    else if (line.trim()) out.push(`<p>${inlineMd(line)}</p>`);
  }
  closeAll();
  return out.join("");
}

// --- toolbar ---------------------------------------------------------------------

function Tool({ label, active, disabled, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      // Keep the editor's selection: don't take focus on mousedown.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "grid size-10 shrink-0 cursor-pointer place-items-center rounded-md transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40 md:size-9",
        active ? "bg-surface-2 text-primary" : "text-text-muted hover:bg-surface-2 hover:text-text",
      )}
    >
      {children}
    </button>
  );
}

const Sep = () => <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border" />;

function Toolbar({ editor, uploading, onPick }: { editor: Editor; uploading: boolean; onPick: (kind: "image" | "file") => void }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"), italic: e.isActive("italic"), underline: e.isActive("underline"), strike: e.isActive("strike"),
      highlight: e.isActive("highlight"), code: e.isActive("code"), h2: e.isActive("heading", { level: 2 }), h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"), ordered: e.isActive("orderedList"), task: e.isActive("taskList"), quote: e.isActive("blockquote"),
      codeBlock: e.isActive("codeBlock"), link: e.isActive("link"), undo: e.can().undo(), redo: e.can().redo(),
    }),
  });
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState("");
  const chain = () => editor.chain().focus();
  const icon = "size-4.5";

  function applyLink() {
    const url = href.trim();
    if (!url) chain().extendMarkRange("link").unsetLink().run();
    else chain().extendMarkRange("link").setLink({ href: /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}` }).run();
    setLinkOpen(false);
  }

  return (
    <div className="border-b border-border">
      <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 px-1.5 py-1">
        <Tool label="Bold (⌘B)" active={state.bold} onClick={() => chain().toggleBold().run()}><Bold className={icon} /></Tool>
        <Tool label="Italic (⌘I)" active={state.italic} onClick={() => chain().toggleItalic().run()}><Italic className={icon} /></Tool>
        <Tool label="Underline (⌘U)" active={state.underline} onClick={() => chain().toggleUnderline().run()}><Underline className={icon} /></Tool>
        <Tool label="Strikethrough" active={state.strike} onClick={() => chain().toggleStrike().run()}><Strikethrough className={icon} /></Tool>
        <Tool label="Highlight" active={state.highlight} onClick={() => chain().toggleHighlight().run()}><Highlighter className={icon} /></Tool>
        <Tool label="Inline code" active={state.code} onClick={() => chain().toggleCode().run()}><Code className={icon} /></Tool>
        <Sep />
        <Tool label="Heading" active={state.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}><Heading2 className={icon} /></Tool>
        <Tool label="Subheading" active={state.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}><Heading3 className={icon} /></Tool>
        <Sep />
        <Tool label="Bulleted list" active={state.bullet} onClick={() => chain().toggleBulletList().run()}><List className={icon} /></Tool>
        <Tool label="Numbered list" active={state.ordered} onClick={() => chain().toggleOrderedList().run()}><ListOrdered className={icon} /></Tool>
        <Tool label="Checklist" active={state.task} onClick={() => chain().toggleTaskList().run()}><ListChecks className={icon} /></Tool>
        <Tool label="Quote" active={state.quote} onClick={() => chain().toggleBlockquote().run()}><Quote className={icon} /></Tool>
        <Tool label="Code block" active={state.codeBlock} onClick={() => chain().toggleCodeBlock().run()}><SquareCode className={icon} /></Tool>
        <Tool label="Divider" onClick={() => chain().setHorizontalRule().run()}><Minus className={icon} /></Tool>
        <Sep />
        <Tool label="Link" active={state.link} onClick={() => { setHref(String(editor.getAttributes("link").href ?? "")); setLinkOpen(!linkOpen); }}><Link2 className={icon} /></Tool>
        <Tool label="Upload image" disabled={uploading} onClick={() => onPick("image")}><ImageUp className={icon} /></Tool>
        <Tool label="Attach file" disabled={uploading} onClick={() => onPick("file")}><FileUp className={icon} /></Tool>
        {uploading ? <Loader2 className="size-4 animate-spin text-text-muted motion-reduce:animate-none" aria-label="Uploading" /> : null}
        <span className="ml-auto flex items-center">
          <Tool label="Undo (⌘Z)" disabled={!state.undo} onClick={() => chain().undo().run()}><Undo2 className={icon} /></Tool>
          <Tool label="Redo (⇧⌘Z)" disabled={!state.redo} onClick={() => chain().redo().run()}><Redo2 className={icon} /></Tool>
        </span>
      </div>
      {linkOpen ? (
        <div className="flex items-center gap-2 border-t border-border px-3 py-1.5">
          <label className="sr-only" htmlFor="tracker-link-url">Link address</label>
          <input
            id="tracker-link-url"
            autoFocus
            value={href}
            placeholder="Paste a link, then Enter (empty removes it)"
            onChange={(event) => setHref(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") { event.preventDefault(); applyLink(); }
              if (event.key === "Escape") { event.preventDefault(); setLinkOpen(false); editor.commands.focus(); }
            }}
            className="h-9 min-w-0 flex-1 bg-transparent text-md text-text outline-none placeholder:text-text-muted"
          />
          <button type="button" onClick={applyLink} className="h-9 cursor-pointer rounded-md px-3 text-sm font-semibold text-accent-text hover:bg-surface-2">Apply</button>
        </div>
      ) : null}
    </div>
  );
}

// --- the editor ------------------------------------------------------------------

export type EditorValue = { doc: JSONContent | null; text: string; hasContent: boolean };

/**
 * `boxed`: its own bordered field (the entry dialog). Otherwise it fills the
 * card it sits in (the new-note composer). Remount with a new `key` to clear.
 */
export function UpdateEditor({ id, label, placeholder, boxed = false, minHeight = "min-h-36", onChange, onSubmit }: {
  id: string;
  label: string;
  placeholder?: string;
  boxed?: boolean;
  minHeight?: string;
  onChange: (value: EditorValue) => void;
  onSubmit?: () => void;
}) {
  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // Handlers inside the editor outlive renders: they read the latest callback/editor via refs.
  const submitRef = useRef(onSubmit);
  const editorRef = useRef<Editor | null>(null);
  useEffect(() => { submitRef.current = onSubmit; });

  async function upload(editor: Editor, files: File[]) {
    if (!files.length) return;
    setUploading(true);
    try {
      insertUploads(editor, await uploadFiles(files));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const editor = useEditor({
    extensions: trackerExtensions(placeholder),
    immediatelyRender: false,
    editorProps: {
      attributes: { id, "aria-label": label, "aria-multiline": "true", role: "textbox", class: cn("note-prose px-4 py-3 outline-none", minHeight) },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && submitRef.current) {
          event.preventDefault();
          submitRef.current();
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (files.length && editorRef.current) { event.preventDefault(); void upload(editorRef.current, files); return true; }
        // Rich HTML pastes are handled by the schema; plain Markdown-looking text is converted.
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
        if (!files.length || !editorRef.current) return false;
        event.preventDefault();
        void upload(editorRef.current, files);
        return true;
      },
    },
    onUpdate: ({ editor: e }) => {
      // getJSON() reuses ProseMirror's null-prototype `attrs` objects, which a
      // Server Action can't serialise (they arrive as opaque references and
      // Prisma throws). A JSON round-trip makes every object plain.
      const doc = JSON.parse(JSON.stringify(e.getJSON())) as JSONContent;
      const text = docToText(doc);
      onChange({ doc: e.isEmpty ? null : doc, text, hasContent: !e.isEmpty && (text.trim().length > 0 || docFileIds(doc).length > 0) });
    },
  });
  useEffect(() => { editorRef.current = editor; }, [editor]);

  return (
    <div className={cn("flex min-w-0 flex-col", boxed && "overflow-hidden rounded-xl border border-border-strong bg-surface transition-colors duration-150 focus-within:border-primary focus-within:shadow-[var(--sh-focus)]")}>
      {editor ? <Toolbar editor={editor} uploading={uploading} onPick={(kind) => (kind === "image" ? imageInput : fileInput).current?.click()} /> : <div className="h-11 border-b border-border" />}
      <EditorContent editor={editor} className="max-h-[50dvh] min-w-0 overflow-y-auto" />
      <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden onChange={(event) => { if (editor) void upload(editor, Array.from(event.target.files ?? [])); event.target.value = ""; }} />
      <input ref={fileInput} type="file" multiple hidden onChange={(event) => { if (editor) void upload(editor, Array.from(event.target.files ?? [])); event.target.value = ""; }} />
    </div>
  );
}

/** A saved rich update, read-only, through the same schema (never raw HTML). */
export function UpdateDoc({ doc, className }: { doc: unknown; className?: string }) {
  const editor = useEditor({
    extensions: trackerExtensions(),
    content: doc as JSONContent,
    editable: false,
    immediatelyRender: false,
    editorProps: { attributes: { class: cn("note-prose", className) } },
  });
  return <EditorContent editor={editor} />;
}

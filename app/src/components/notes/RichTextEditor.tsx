"use client";

import type { Editor, JSONContent } from "@tiptap/core";
import {
  EditorContent,
  ReactNodeViewRenderer,
  useEditor,
  useEditorState,
} from "@tiptap/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Braces,
  Code,
  Columns3,
  Ellipsis,
  Eraser,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Link2,
  Link2Off,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  Rows3,
  Strikethrough,
  Table as TableIcon,
  Trash2,
  Underline,
  Undo2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { cn } from "@/components/cn";
import { Input } from "@/components/ui/input";

import { CodeBlock } from "./CodeBlock";
import { buildNoteExtensions, EMPTY_NOTE_DOC } from "./editor-extensions";

export type RichTextEditorProps = {
  /** TipTap JSON document. Anything falsy starts an empty note. */
  value: unknown;
  /** Called with the new TipTap JSON on every edit. */
  onChange: (json: unknown) => void;
  placeholder?: string;
  className?: string;
};

/* -------------------------------------------------------------------------- */
/* toolbar primitives                                                          */
/* -------------------------------------------------------------------------- */

/**
 * One toolbar control. Everything is a real <button> with an aria-label and,
 * for the toggles, an aria-pressed that mirrors `editor.isActive(...)` — the
 * icon alone carries no meaning to a screen reader.
 */
function ToolButton({
  label,
  icon,
  onClick,
  active,
  disabled,
  pressable = true,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  /** false for one-shot actions (undo, insert table…) which have no on-state */
  pressable?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressable ? Boolean(active) : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        // a touch larger on phones, where the pointer is a fingertip
        "inline-flex size-[34px] shrink-0 items-center justify-center rounded-full border md:size-[30px]",
        "transition-colors duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "disabled:pointer-events-none disabled:opacity-40",
        active
          ? "border-border bg-surface-2 text-primary"
          : "border-transparent text-text-muted hover:border-border hover:bg-surface-2 hover:text-text",
      )}
    >
      {icon}
    </button>
  );
}

/** A hairline between toolbar groups. Hidden when a group wraps to its own row. */
function Divider() {
  return (
    <span
      aria-hidden="true"
      className="mx-0.5 hidden h-5 w-px shrink-0 self-center bg-border md:block"
    />
  );
}

function Group({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-0.5">{children}</div>;
}

/**
 * Thirty controls do not fit on a 375px screen without turning the toolbar
 * into four rows of icons. Below `sm` the less-used groups live behind a
 * "More" toggle; from `sm` up the wrapper becomes `display: contents` and the
 * toolbar is the single flat row it has always been.
 */
function Advanced({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className={cn(open ? "contents" : "hidden", "md:contents")}>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* link editing                                                                */
/* -------------------------------------------------------------------------- */

/**
 * An inline popover instead of `window.prompt` — the browser dialog steals
 * focus out of the document, can't be styled, and is blocked outright in some
 * embedded contexts.
 */
function LinkControl({ editor, active }: { editor: Editor; active: boolean }) {
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const reduceMotion = useReducedMotion();

  const close = useCallback(
    (refocus = true) => {
      setOpen(false);
      if (refocus) editor.chain().focus().run();
    },
    [editor],
  );

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    inputRef.current?.select();

    const onPointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const apply = () => {
    const url = href.trim();
    if (!url) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setOpen(false);
      return;
    }
    // a bare "nexa.app" is a URL the user meant, not a relative path
    const normalised = /^[a-z][a-z0-9+.-]*:|^\//i.test(url)
      ? url
      : `https://${url}`;
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: normalised })
      .run();
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative flex items-center gap-0.5">
      <ToolButton
        label={active ? "Edit link" : "Add link"}
        active={active}
        icon={<Link2 aria-hidden="true" className="size-[15px]" />}
        onClick={() => {
          if (open) {
            close();
            return;
          }
          setHref((editor.getAttributes("link").href as string) ?? "");
          setOpen(true);
        }}
      />
      <ToolButton
        label="Remove link"
        pressable={false}
        disabled={!active}
        icon={<Link2Off aria-hidden="true" className="size-[15px]" />}
        onClick={() =>
          editor.chain().focus().extendMarkRange("link").unsetLink().run()
        }
      />

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
            transition={{ duration: reduceMotion ? 0 : 0.14, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "absolute left-0 top-[calc(100%+8px)] z-30 w-[min(320px,calc(100vw-3rem))]",
              "rounded-[12px] bg-surface border border-border p-2.5 shadow-sm",
            )}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                close();
              }
            }}
          >
            <label htmlFor={inputId} className="sr-only">
              Link address
            </label>
            <div className="flex items-center gap-1.5">
              <Input
                id={inputId}
                ref={inputRef}
                type="url"
                inputMode="url"
                placeholder="https://example.com"
                value={href}
                onChange={(event) => setHref(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    apply();
                  }
                }}
                className="min-w-0 flex-1 text-sm [&_input]:py-1.5"
              />
              <button
                type="button"
                onClick={apply}
                className={cn(
                  "shrink-0 rounded-full border border-border bg-surface px-3 py-1.5",
                  "text-xs font-medium text-text transition-colors",
                  "hover:border-border-strong hover:bg-surface-2",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                )}
              >
                Apply
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* toolbar                                                                     */
/* -------------------------------------------------------------------------- */

function Toolbar({ editor }: { editor: Editor }) {
  /** Only consulted below `sm`; from there up every group is always shown. */
  const [showAll, setShowAll] = useState(false);

  // One subscription for the whole toolbar rather than a re-render per button.
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      paragraph: e.isActive("paragraph"),
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      highlight: e.isActive("highlight"),
      bulletList: e.isActive("bulletList"),
      orderedList: e.isActive("orderedList"),
      taskList: e.isActive("taskList"),
      blockquote: e.isActive("blockquote"),
      code: e.isActive("code"),
      codeBlock: e.isActive("codeBlock"),
      link: e.isActive("link"),
      inTable: e.isActive("table"),
      alignCenter: e.isActive({ textAlign: "center" }),
      alignRight: e.isActive({ textAlign: "right" }),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  if (!s) return null;

  const chain = () => editor.chain().focus();

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      aria-orientation="horizontal"
      className={cn(
        "sticky top-0 z-20 flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1",
        "rounded-t-[13px] border-b border-border-strong bg-surface/95 px-1.5 py-1.5 backdrop-blur",
        "md:px-2 md:py-2",
      )}
    >
      <Group>
        <ToolButton
          label="Paragraph"
          active={s.paragraph}
          icon={<Pilcrow aria-hidden="true" className="size-[15px]" />}
          onClick={() => chain().setParagraph().run()}
        />
        <ToolButton
          label="Heading 1"
          active={s.h1}
          icon={<Heading1 aria-hidden="true" className="size-[16px]" />}
          onClick={() => chain().toggleHeading({ level: 1 }).run()}
        />
        <ToolButton
          label="Heading 2"
          active={s.h2}
          icon={<Heading2 aria-hidden="true" className="size-[16px]" />}
          onClick={() => chain().toggleHeading({ level: 2 }).run()}
        />
        <ToolButton
          label="Heading 3"
          active={s.h3}
          icon={<Heading3 aria-hidden="true" className="size-[16px]" />}
          onClick={() => chain().toggleHeading({ level: 3 }).run()}
        />
      </Group>

      <Divider />

      <Group>
        <ToolButton
          label="Bold"
          active={s.bold}
          icon={<Bold aria-hidden="true" className="size-[15px]" />}
          onClick={() => chain().toggleBold().run()}
        />
        <ToolButton
          label="Italic"
          active={s.italic}
          icon={<Italic aria-hidden="true" className="size-[15px]" />}
          onClick={() => chain().toggleItalic().run()}
        />
        <ToolButton
          label="Underline"
          active={s.underline}
          icon={<Underline aria-hidden="true" className="size-[15px]" />}
          onClick={() => chain().toggleUnderline().run()}
        />
        <ToolButton
          label="Strikethrough"
          active={s.strike}
          icon={<Strikethrough aria-hidden="true" className="size-[15px]" />}
          onClick={() => chain().toggleStrike().run()}
        />
        <ToolButton
          label="Highlight"
          active={s.highlight}
          icon={<Highlighter aria-hidden="true" className="size-[15px]" />}
          onClick={() => chain().toggleHighlight().run()}
        />
      </Group>

      <Divider />

      <Group>
        <ToolButton
          label="Bullet list"
          active={s.bulletList}
          icon={<List aria-hidden="true" className="size-[15px]" />}
          onClick={() => chain().toggleBulletList().run()}
        />
        <ToolButton
          label="Numbered list"
          active={s.orderedList}
          icon={<ListOrdered aria-hidden="true" className="size-[15px]" />}
          onClick={() => chain().toggleOrderedList().run()}
        />
        <ToolButton
          label="Checklist"
          active={s.taskList}
          icon={<ListChecks aria-hidden="true" className="size-[15px]" />}
          onClick={() => chain().toggleTaskList().run()}
        />
        <ToolButton
          label="Blockquote"
          active={s.blockquote}
          icon={<Quote aria-hidden="true" className="size-[15px]" />}
          onClick={() => chain().toggleBlockquote().run()}
        />
      </Group>

      <Advanced open={showAll}>
      <Divider />

      <Group>
        <ToolButton
          label="Inline code"
          active={s.code}
          icon={<Code aria-hidden="true" className="size-[15px]" />}
          onClick={() => chain().toggleCode().run()}
        />
        <ToolButton
          label="Code block"
          active={s.codeBlock}
          icon={<Braces aria-hidden="true" className="size-[15px]" />}
          onClick={() => chain().toggleCodeBlock().run()}
        />
        <LinkControl editor={editor} active={s.link} />
      </Group>

      <Divider />

      <Group>
        <ToolButton
          label="Align left"
          active={!s.alignCenter && !s.alignRight}
          icon={<AlignLeft aria-hidden="true" className="size-[15px]" />}
          onClick={() => chain().setTextAlign("left").run()}
        />
        <ToolButton
          label="Align center"
          active={s.alignCenter}
          icon={<AlignCenter aria-hidden="true" className="size-[15px]" />}
          onClick={() => chain().setTextAlign("center").run()}
        />
        <ToolButton
          label="Align right"
          active={s.alignRight}
          icon={<AlignRight aria-hidden="true" className="size-[15px]" />}
          onClick={() => chain().setTextAlign("right").run()}
        />
      </Group>

      <Divider />

      <Group>
        <ToolButton
          label="Insert table"
          pressable={false}
          icon={<TableIcon aria-hidden="true" className="size-[15px]" />}
          onClick={() =>
            chain()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
        />
        <ToolButton
          label="Add row below"
          pressable={false}
          disabled={!s.inTable}
          icon={<Rows3 aria-hidden="true" className="size-[15px]" />}
          onClick={() => chain().addRowAfter().run()}
        />
        <ToolButton
          label="Add column after"
          pressable={false}
          disabled={!s.inTable}
          icon={<Columns3 aria-hidden="true" className="size-[15px]" />}
          onClick={() => chain().addColumnAfter().run()}
        />
        <ToolButton
          label="Delete row"
          pressable={false}
          disabled={!s.inTable}
          icon={
            <span aria-hidden="true" className="text-2xs font-semibold leading-none">
              −R
            </span>
          }
          onClick={() => chain().deleteRow().run()}
        />
        <ToolButton
          label="Delete column"
          pressable={false}
          disabled={!s.inTable}
          icon={
            <span aria-hidden="true" className="text-2xs font-semibold leading-none">
              −C
            </span>
          }
          onClick={() => chain().deleteColumn().run()}
        />
        <ToolButton
          label="Delete table"
          pressable={false}
          disabled={!s.inTable}
          icon={<Trash2 aria-hidden="true" className="size-[15px]" />}
          onClick={() => chain().deleteTable().run()}
        />
      </Group>

      <Divider />

      <Group>
        <ToolButton
          label="Horizontal rule"
          pressable={false}
          icon={<Minus aria-hidden="true" className="size-[15px]" />}
          onClick={() => chain().setHorizontalRule().run()}
        />
        <ToolButton
          label="Clear formatting"
          pressable={false}
          icon={<Eraser aria-hidden="true" className="size-[15px]" />}
          onClick={() => chain().unsetAllMarks().clearNodes().run()}
        />
      </Group>
      </Advanced>

      <Divider />

      <Group>
        <ToolButton
          label="Undo"
          pressable={false}
          disabled={!s.canUndo}
          icon={<Undo2 aria-hidden="true" className="size-[15px]" />}
          onClick={() => chain().undo().run()}
        />
        <ToolButton
          label="Redo"
          pressable={false}
          disabled={!s.canRedo}
          icon={<Redo2 aria-hidden="true" className="size-[15px]" />}
          onClick={() => chain().redo().run()}
        />

        {/* the escape hatch for the groups folded away on small screens */}
        <button
          type="button"
          aria-label={showAll ? "Fewer formatting tools" : "More formatting tools"}
          aria-expanded={showAll}
          onClick={() => setShowAll((open) => !open)}
          className={cn(
            "inline-flex size-[34px] shrink-0 items-center justify-center rounded-full border md:hidden",
            "transition-colors duration-150",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            showAll
              ? "border-border bg-surface-2 text-primary"
              : "border-transparent text-text-muted hover:border-border hover:bg-surface-2 hover:text-text",
          )}
        >
          <Ellipsis aria-hidden="true" className="size-[16px]" />
        </button>
      </Group>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* editor                                                                      */
/* -------------------------------------------------------------------------- */

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Start writing… markdown works: # heading, - list, > quote, ``` code",
  className,
}: RichTextEditorProps) {
  // onChange changes identity on most parents; keep it in a ref so the editor
  // is created once instead of on every render of the page around it.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  /** The last JSON this editor emitted, so echoed props don't reset the doc. */
  const lastEmitted = useRef<string | null>(null);

  const extensions = useMemo(
    () =>
      buildNoteExtensions({
        placeholder,
        codeBlockNodeView: ReactNodeViewRenderer(CodeBlock),
        // the editor sits under the form's h2s — page headings start at h3
        headingOffset: 2,
      }),
    [placeholder],
  );

  const editor = useEditor({
    extensions,
    content: (value as JSONContent) ?? EMPTY_NOTE_DOC,
    // React 19 / Next.js renders this on the server first; rendering the editor
    // synchronously there produces markup the client cannot match.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "note-prose note-editor-body",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Note body",
      },
    },
    onUpdate: ({ editor: e }) => {
      const json = e.getJSON();
      lastEmitted.current = JSON.stringify(json);
      onChangeRef.current(json);
    },
  });

  // Accept content pushed in from outside (a note loaded after mount, an undo
  // upstream) without clobbering what the user is currently typing.
  useEffect(() => {
    if (!editor) return;
    const incoming = JSON.stringify(value ?? EMPTY_NOTE_DOC);
    if (incoming === lastEmitted.current) return;
    if (incoming === JSON.stringify(editor.getJSON())) return;
    lastEmitted.current = incoming;
    editor.commands.setContent((value as JSONContent) ?? EMPTY_NOTE_DOC, {
      emitUpdate: false,
    });
  }, [editor, value]);

  return (
    <div
      className={cn(
        "min-w-0 rounded-[14px] bg-surface border border-border",
        "transition-colors duration-150",
        "[&:hover:not(:focus-within)]:border-border-strong focus-within:border-border-strong",
        className,
      )}
    >
      {editor ? <Toolbar editor={editor} /> : <div className="h-[46px]" />}
      <EditorContent
        editor={editor}
        // clicking the padding below the last block should land the caret in it
        onClick={() => editor?.chain().focus().run()}
        className={cn(
          "min-h-[260px] cursor-text px-3 py-3.5 md:min-h-[320px] md:px-6 md:py-5 lg:px-8 lg:py-6",
          // `.note-prose` caps itself at 72ch for the read-only viewer; while
          // editing the box is the measure, so the body fills the width it was
          // given — tables and code blocks are the ones that need it
          "[&_.note-prose]:max-w-none",
          // the shared prose size is tuned for the viewer; ease it down on phones
          "[&_.note-prose]:text-base md:[&_.note-prose]:text-base",
        )}
      />
    </div>
  );
}

export default RichTextEditor;

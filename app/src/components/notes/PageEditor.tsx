"use client";

import { Reorder, useDragControls } from "framer-motion";
import { ChevronDown, CornerUpRight, Copy, FileText, GripVertical, Trash2 } from "lucide-react";
import type { JSONContent } from "@tiptap/core";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { estimateDocHeight } from "@/components/notes/doc-height";
import { RichTextEditor } from "@/components/notes/RichTextEditor";
import { isJumping, NOTE_SCROLL_END } from "@/components/notes/smooth-scroll";
import { cn } from "@/components/cn";

/** One page as the editor holds it. `id` doubles as the React key. */
export type PageDraft = {
  /** A database id for a saved page, a fresh uuid for one just added. */
  id: string;
  title: string;
  /** TipTap JSON — opaque here, it belongs to the editor. */
  content: unknown;
};

/** The bare shape the "move to section" picker needs from its siblings. */
export type SectionOption = { id: string; title: string };

/**
 * A page is a *document*, not a form row: the title sits above a full-width
 * body, never beside it. Long prose needs the whole column.
 */
export function PageEditor({
  page,
  index,
  sectionIndex,
  removable,
  sections,
  collapsed,
  onToggleCollapse,
  titleErrors,
  contentErrors,
  onChange,
  onDuplicate,
  onRemove,
  onMoveToSection,
}: {
  page: PageDraft;
  index: number;
  sectionIndex: number;
  /** false for a section's last page — a section with no pages reads as broken */
  removable: boolean;
  /** every section in the note, for the move picker */
  sections: SectionOption[];
  /** editor folded away — only the header shows */
  collapsed: boolean;
  onToggleCollapse: () => void;
  titleErrors?: string[];
  contentErrors?: string[];
  onChange: (next: PageDraft) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onMoveToSection: (targetSectionId: string) => void;
}) {
  const controls = useDragControls();
  const fieldId = useId();
  const titleId = `${fieldId}-title`;
  const moveId = `${fieldId}-move`;

  const label = `Page ${index + 1}`;

  return (
    <Reorder.Item
      as="div"
      value={page}
      dragListener={false}
      dragControls={controls}
      id={`note-page-${page.id}`}
      className="min-w-0 scroll-mt-48 overflow-hidden rounded-xl border border-border bg-surface shadow-xs"
    >
      {/* Page header: lighter than the section's, title inline. */}
      <div className={cn("flex min-w-0 flex-wrap items-center gap-2 px-2.5 py-2 md:flex-nowrap md:px-3", !collapsed && "border-b border-border")}>
        <button
          type="button"
          aria-label={`Reorder ${label}`}
          onPointerDown={(event) => controls.start(event)}
          className={cn(
            "inline-flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md",
            "text-text-subtle transition-colors hover:bg-surface-2 hover:text-text-muted active:cursor-grabbing",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          <GripVertical aria-hidden="true" className="size-[15px]" />
        </button>

        <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-primary/40 bg-primary-subtle px-2 py-0.5 text-2xs font-bold uppercase tracking-[0.08em] text-accent-text">
          <FileText aria-hidden="true" className="size-3" />
          {label}
        </span>

        <div className="order-last w-full min-w-0 md:order-none md:w-auto md:flex-1">
          <label htmlFor={titleId} className="sr-only">Page title</label>
          <input
            id={titleId}
            value={page.title}
            onChange={(event) => onChange({ ...page, title: event.target.value })}
            placeholder="Page title"
            aria-invalid={titleErrors?.length ? true : undefined}
            className="h-10 w-full min-w-0 rounded-lg border border-border-strong bg-surface px-3 text-base font-semibold text-text outline-none transition-[border-color,box-shadow] placeholder:font-normal placeholder:text-text-subtle hover:border-primary focus:border-primary focus:shadow-[0_0_0_3px_var(--c-primary-subtle)] aria-invalid:border-danger"
          />
          {titleErrors?.length ? <p role="alert" className="mt-1 px-2 text-xs text-danger">{titleErrors[0]}</p> : null}
        </div>

        <ToolbarGroup className="ml-auto md:ml-0">
          {sections.length > 1 ? (
            <>
              <label htmlFor={moveId} className="sr-only">
                Move {label} to another section
              </label>
              <div className="relative flex items-center">
                <CornerUpRight
                  aria-hidden="true"
                  className="pointer-events-none absolute left-2 size-[13px] text-text-subtle"
                />
                <select
                  id={moveId}
                  value={sections[sectionIndex]?.id ?? ""}
                  title="Move to section"
                  onChange={(event) => {
                    const target = event.target.value;
                    if (target && target !== sections[sectionIndex]?.id) {
                      onMoveToSection(target);
                    }
                  }}
                  className={cn(
                    "h-8 max-w-[150px] cursor-pointer appearance-none rounded-md bg-transparent py-1 pl-7 pr-2 text-xs font-medium text-text-muted outline-none transition-colors",
                    "hover:bg-surface-2 hover:text-text",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  )}
                >
                  {sections.map((section, order) => (
                    <option key={section.id} value={section.id}>
                      {section.title.trim() || `Section ${order + 1}`}
                    </option>
                  ))}
                </select>
              </div>
              <span className="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />
            </>
          ) : null}

          <IconAction label={`Duplicate ${label}`} onClick={onDuplicate} tone="copy">
            <Copy aria-hidden="true" className="size-[14px]" />
          </IconAction>
          <IconAction
            label={`Delete ${label}`}
            onClick={onRemove}
            disabled={!removable}
            danger
          >
            <Trash2 aria-hidden="true" className="size-[14px]" />
          </IconAction>
          <span className="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />
          <IconAction label={collapsed ? `Expand ${label}` : `Collapse ${label}`} onClick={onToggleCollapse} tone="fold">
            <ChevronDown aria-hidden="true" className={cn("size-4 transition-transform duration-200", !collapsed && "rotate-180")} />
          </IconAction>
        </ToolbarGroup>
      </div>

      {/* The body takes the whole card; folded pages keep just their header. */}
      <div className={cn("min-w-0 p-2 md:p-3", collapsed && "hidden")}>
        <p className="sr-only">Page content</p>
        <LazyBody content={page.content}>
          <RichTextEditor
            value={page.content}
            onChange={(content) => onChange({ ...page, content })}
          />
        </LazyBody>
        {contentErrors?.length ? (
          <p role="alert" className="mt-1.5 text-xs text-danger">
            {contentErrors[0]}
          </p>
        ) : null}
      </div>
    </Reorder.Item>
  );
}

/**
 * Mounts a page's editor only once it comes near the screen, then keeps it.
 *
 * Every page used to mount its own TipTap editor up front — fine for a short
 * note, but an imported notebook has 200+ pages and scrolling the edit page
 * stuttered under that many live editors. A folded page (display: none) never
 * intersects, so it never mounts. Saving doesn't need the editor: the page's
 * content lives in form state, not inside the editor.
 */
function LazyBody({ content, children }: { content: unknown; children: React.ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const reserve = useMemo(
    () =>
      typeof content === "object" && content !== null
        ? // toolbar + editor padding, around the estimated body
          Math.max(260, estimateDocHeight(content as JSONContent) + 110)
        : 260,
    [content],
  );

  useEffect(() => {
    const el = host.current;
    if (near || !el) return;
    // Editors a smooth jump flies past stay as placeholders (see smooth-scroll.ts);
    // the ones near where it lands mount when it announces the landing.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !isJumping()) setNear(true);
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(el);
    const onJumpEnd = () => {
      const rect = el.getBoundingClientRect();
      if (rect.height && rect.bottom > -800 && rect.top < window.innerHeight + 800) setNear(true);
    };
    window.addEventListener(NOTE_SCROLL_END, onJumpEnd);
    return () => {
      observer.disconnect();
      window.removeEventListener(NOTE_SCROLL_END, onJumpEnd);
    };
  }, [near]);

  return (
    <div ref={host} className="min-w-0">
      {near ? (
        children
      ) : (
        <div aria-hidden="true" className="rounded-[14px] border border-border bg-surface" style={{ minHeight: reserve }} />
      )}
    </div>
  );
}

/** Groups a header's actions into one compact bordered toolbar. */
export function ToolbarGroup({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex shrink-0 items-center gap-1 rounded-lg border border-border bg-surface p-1 shadow-xs", className)}>
      {children}
    </div>
  );
}

/** A small round icon button — shared by the page and section headers. */
export function IconAction({
  label,
  onClick,
  disabled,
  danger,
  tone = danger ? "danger" : "neutral",
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** Tinted by what the button does: copy = teal, delete = red, fold = navy. */
  tone?: "neutral" | "copy" | "danger" | "fold";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors",
        tone === "copy" && "bg-primary-subtle text-accent-text hover:bg-primary hover:text-primary-fg",
        tone === "danger" && "bg-danger-subtle text-danger hover:bg-danger hover:text-danger-fg",
        tone === "fold" && "bg-card-navy text-accent-text hover:bg-sidebar hover:text-sidebar-fg",
        tone === "neutral" && "text-text-muted hover:bg-surface-2 hover:text-text",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "disabled:pointer-events-none disabled:opacity-35",
      )}
    >
      {children}
    </button>
  );
}

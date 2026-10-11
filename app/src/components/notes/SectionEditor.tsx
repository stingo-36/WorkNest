"use client";

import { AnimatePresence, motion, Reorder, useDragControls, useReducedMotion } from "framer-motion";
import { ChevronDown, Copy, GripVertical, Plus, Trash2 } from "lucide-react";
import { useId } from "react";

import {
  IconAction,
  PageEditor,
  ToolbarGroup,
  type PageDraft,
  type SectionOption,
} from "@/components/notes/PageEditor";
import { cn } from "@/components/cn";

/** One section as the editor holds it. `id` doubles as the React key. */
export type SectionDraft = {
  id: string;
  title: string;
  pages: PageDraft[];
};

export function SectionEditor({
  section,
  index,
  removable,
  sections,
  collapsed,
  errors,
  onToggleCollapse,
  onChange,
  onDuplicate,
  onRemove,
  onAddPage,
  onMovePage,
  collapsedPages,
  onTogglePage,
}: {
  section: SectionDraft;
  index: number;
  /** false for the note's last section */
  removable: boolean;
  /** every section in the note, in order — for the page move picker */
  sections: SectionOption[];
  collapsed: boolean;
  /** the whole server/client error map, keyed by dotted Zod path */
  errors?: Record<string, string[]>;
  onToggleCollapse: () => void;
  onChange: (next: SectionDraft) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onAddPage: () => void;
  onMovePage: (pageId: string, targetSectionId: string) => void;
  /** page ids whose editors are folded */
  collapsedPages: string[];
  onTogglePage: (pageId: string) => void;
}) {
  const controls = useDragControls();
  const reduceMotion = useReducedMotion() ?? false;
  const fieldId = useId();
  const titleId = `${fieldId}-title`;
  const bodyId = `${fieldId}-body`;

  const path = `sections.${index}`;
  const label = `Section ${index + 1}`;
  const pageCount = section.pages.length;

  const setPages = (pages: PageDraft[]) => onChange({ ...section, pages });

  return (
    <Reorder.Item
      as="div"
      value={section}
      dragListener={false}
      dragControls={controls}
      id={`note-section-${section.id}`}
      className="wl-card min-w-0 scroll-mt-48 overflow-hidden [&:not(:first-child)]:mt-6"
    >
      {/* Section header: tinted bar, the title lives right in it. */}
      <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-border bg-card-tint px-3 py-3 md:flex-nowrap md:px-4">
        <button
          type="button"
          aria-label={`Reorder ${label}`}
          onPointerDown={(event) => controls.start(event)}
          className={cn(
            "inline-flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md",
            "text-text-subtle transition-colors hover:bg-surface hover:text-text-muted active:cursor-grabbing",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          <GripVertical aria-hidden="true" className="size-4" />
        </button>

        <span className="shrink-0 rounded-md bg-sidebar px-2 py-1 text-2xs font-bold uppercase tracking-[0.08em] text-sidebar-fg">
          {label}
        </span>

        <div className="order-last w-full min-w-0 md:order-none md:w-auto md:flex-1">
          <label htmlFor={titleId} className="sr-only">Section title</label>
          <input
            id={titleId}
            value={section.title}
            onChange={(event) => onChange({ ...section, title: event.target.value })}
            placeholder="Section title"
            aria-invalid={errors?.[`${path}.title`]?.length ? true : undefined}
            className="h-11 w-full min-w-0 rounded-lg border border-border-strong bg-surface px-3 text-lg font-semibold tracking-[-0.015em] text-text outline-none transition-[border-color,box-shadow] placeholder:font-normal placeholder:text-text-subtle hover:border-primary focus:border-primary focus:shadow-[0_0_0_3px_var(--c-primary-subtle)] aria-invalid:border-danger"
          />
          {errors?.[`${path}.title`]?.length ? (
            <p role="alert" className="mt-1 px-2 text-xs text-danger">{errors[`${path}.title`][0]}</p>
          ) : null}
        </div>

        <span className="ml-auto shrink-0 text-xs font-medium text-text-muted md:ml-0">
          {pageCount} page{pageCount === 1 ? "" : "s"}
        </span>

        <ToolbarGroup>
          <IconAction label={`Duplicate ${label}`} onClick={onDuplicate} tone="copy">
            <Copy aria-hidden="true" className="size-[15px]" />
          </IconAction>
          <IconAction label={`Delete ${label}`} onClick={onRemove} disabled={!removable} danger>
            <Trash2 aria-hidden="true" className="size-[15px]" />
          </IconAction>
          <span className="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-controls={bodyId}
            aria-label={collapsed ? `Expand ${label}` : `Collapse ${label}`}
            title={collapsed ? "Expand" : "Collapse"}
            onClick={onToggleCollapse}
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-md bg-card-navy text-accent-text transition-colors",
              "hover:bg-sidebar hover:text-sidebar-fg",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          >
            <ChevronDown aria-hidden="true" className={cn("size-4 transition-transform duration-200", !collapsed && "rotate-180")} />
          </button>
        </ToolbarGroup>
      </div>

      <AnimatePresence initial={false}>
        {collapsed ? null : (
          <motion.div
            id={bodyId}
            key="body"
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{
              duration: reduceMotion ? 0 : 0.24,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="min-w-0 overflow-hidden"
          >
            {/* Pages are white cards on the section's light tint. */}
            <div className="min-w-0 bg-surface-2 p-3 md:p-4">
              <Reorder.Group
                as="div"
                axis="y"
                values={section.pages}
                onReorder={setPages}
                className="flex min-w-0 flex-col gap-3"
              >
                {section.pages.map((page, pageIndex) => (
                  <PageEditor
                    key={page.id}
                    page={page}
                    index={pageIndex}
                    sectionIndex={index}
                    removable={pageCount > 1}
                    sections={sections}
                    collapsed={collapsedPages.includes(page.id) && !errors?.[`${path}.pages.${pageIndex}.title`] && !errors?.[`${path}.pages.${pageIndex}.content`]}
                    onToggleCollapse={() => onTogglePage(page.id)}
                    titleErrors={errors?.[`${path}.pages.${pageIndex}.title`]}
                    contentErrors={errors?.[`${path}.pages.${pageIndex}.content`]}
                    onChange={(next) =>
                      setPages(
                        section.pages.map((row) =>
                          row.id === page.id ? next : row,
                        ),
                      )
                    }
                    onDuplicate={() => {
                      const copy: PageDraft = {
                        ...page,
                        id: crypto.randomUUID(),
                        title: page.title ? `${page.title} copy` : "",
                      };
                      const next = [...section.pages];
                      next.splice(pageIndex + 1, 0, copy);
                      setPages(next);
                    }}
                    onRemove={() =>
                      setPages(section.pages.filter((row) => row.id !== page.id))
                    }
                    onMoveToSection={(targetId) => onMovePage(page.id, targetId)}
                  />
                ))}
              </Reorder.Group>

              <button
                type="button"
                onClick={onAddPage}
                className={cn(
                  "mt-3 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border-strong/60 px-3 py-2",
                  "text-sm font-semibold text-text-muted transition-colors",
                  "hover:border-primary hover:bg-surface hover:text-accent-text",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                )}
              >
                <Plus aria-hidden="true" className="size-4" />
                Add page{section.title.trim() ? ` to ${section.title.trim()}` : ""}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Reorder.Item>
  );
}

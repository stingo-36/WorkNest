"use client";

import { Reorder, useReducedMotion } from "framer-motion";
import { Loader2, Plus } from "lucide-react";
import Link from "next/link";
import {
  useActionState,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import type { NoteFormState } from "@/actions/notes";
import { Field } from "@/components/notes/note-field";
import { Input } from "@/components/ui/input";
import { EMPTY_NOTE_DOC } from "@/components/notes/editor-extensions";
import { NoteIconPicker } from "@/components/notes/NoteIconPicker";
import type { PageDraft } from "@/components/notes/PageEditor";
import { smoothScrollTo } from "@/components/notes/smooth-scroll";
import {
  SectionEditor,
  type SectionDraft,
} from "@/components/notes/SectionEditor";
import type { NoteIconRef } from "@/lib/note-icons";
import { noteSchema, type NoteDetail, type NoteInput } from "@/lib/notes";
import { cn } from "@/components/cn";

const initialState: NoteFormState = {};

/** Everything the editor needs from a saved note. */
export type NoteFormDefaults = Pick<
  NoteDetail,
  "id" | "title" | "description" | "iconName" | "iconLibrary" | "sections"
>;

/**
 * Ids for rows added at runtime. New ids never match a row in the database, so
 * `updateNote` treats them as inserts — which is exactly what they are.
 */
const newId = () => crypto.randomUUID();

const emptyPage = (id: string): PageDraft => ({
  id,
  title: "",
  content: EMPTY_NOTE_DOC,
});

/**
 * The starting tree: one section, one page. Ids are derived from `useId` rather
 * than `crypto.randomUUID` so the server and client render the same hidden
 * payload — a random id here is a hydration mismatch.
 */
function seedSections(base: string): SectionDraft[] {
  return [{ id: `${base}s`, title: "", pages: [emptyPage(`${base}p`)] }];
}

function fromDefaults(defaults: NoteFormDefaults): SectionDraft[] {
  return defaults.sections.map((section) => ({
    id: section.id,
    title: section.title,
    pages: section.pages.map((page) => ({
      id: page.id,
      title: page.title,
      content: page.content,
    })),
  }));
}

export function NoteForm({
  action,
  defaults,
  heading,
  submitLabel,
}: {
  action: (prev: NoteFormState, formData: FormData) => Promise<NoteFormState>;
  defaults?: NoteFormDefaults;
  heading: string;
  submitLabel: string;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const base = useId();

  const [title, setTitle] = useState(defaults?.title ?? "");
  const [description, setDescription] = useState(defaults?.description ?? "");
  const [icon, setIcon] = useState<NoteIconRef | null>(
    defaults?.iconName && defaults?.iconLibrary
      ? { library: defaults.iconLibrary, name: defaults.iconName }
      : null,
  );
  const [sections, setSections] = useState<SectionDraft[]>(() =>
    defaults && defaults.sections.length > 0
      ? fromDefaults(defaults)
      : seedSections(base),
  );
  const [collapsed, setCollapsed] = useState<string[]>([]);
  /** Page ids whose editor is folded away (header still shows). */
  const [collapsedPages, setCollapsedPages] = useState<string[]>([]);
  /**
   * Client validation runs the very same Zod schema as the action, so its
   * error keys already line up with `state.errors`. When it has an opinion it
   * is the fresher one, so it wins outright rather than merging.
   */
  const [clientErrors, setClientErrors] = useState<Record<
    string,
    string[]
  > | null>(null);

  const payload: NoteInput = useMemo(
    () => ({
      title,
      description,
      iconName: icon?.name ?? "",
      iconLibrary: icon
        ? (icon.library as NoteInput["iconLibrary"])
        : undefined,
      // order is never stored on the draft — array position is the truth
      sections: sections.map((section, sectionIndex) => ({
        id: section.id,
        title: section.title,
        order: sectionIndex,
        pages: section.pages.map((page, pageIndex) => ({
          id: page.id,
          title: page.title,
          content: page.content,
          order: pageIndex,
        })),
      })),
    }),
    [title, description, icon, sections],
  );

  const serialised = useMemo(() => JSON.stringify(payload), [payload]);
  // the payload as it stood when the editor opened, for the dirty indicator
  const [pristine] = useState(serialised);
  const dirty = serialised !== pristine;

  const errors = clientErrors ?? state.errors;
  const message = clientErrors
    ? "Please fix the highlighted fields."
    : state.message;

  /**
   * Sections carrying an error, by index. A folded section would hide its own
   * error message, so being flagged simply overrides the fold — derived here
   * rather than by writing back into `collapsed`.
   */
  const flagged = useMemo(() => {
    const found = new Set<number>();
    for (const key of Object.keys(errors ?? {})) {
      const match = /^sections\.(\d+)\./.exec(key);
      if (match) found.add(Number(match[1]));
    }
    return found;
  }, [errors]);

  useEffect(() => {
    if (!dirty || isPending) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, isPending]);

  const pageCount = sections.reduce(
    (total, section) => total + section.pages.length,
    0,
  );

  const updateSection = (id: string, next: SectionDraft) =>
    setSections((rows) => rows.map((row) => (row.id === id ? next : row)));

  const reduceMotion = useReducedMotion() ?? false;
  /** The sticky save bar — a revealed section/page lands just below it. */
  const barRef = useRef<HTMLDivElement>(null);

  /** Scroll a section/page into view once React has rendered (and unfolded) it. */
  const reveal = (elementId: string) =>
    window.setTimeout(() => {
      const target = document.getElementById(elementId);
      if (!target) return;
      const offset = (barRef.current?.getBoundingClientRect().bottom ?? 0) + 12;
      smoothScrollTo(target, { offset, reduceMotion });
    }, 80);

  const addSection = () => {
    const section: SectionDraft = {
      id: newId(),
      title: "",
      pages: [emptyPage(newId())],
    };
    // Fold the sections already written so the new one has the stage.
    setCollapsed(sections.map((row) => row.id));
    setSections((rows) => [...rows, section]);
    reveal(`note-section-${section.id}`);
  };

  const addPage = (section: SectionDraft) => {
    const page = emptyPage(newId());
    // Fold this section's other pages; keep the section itself open.
    setCollapsedPages((open) => [...new Set([...open, ...section.pages.map((row) => row.id)])]);
    setCollapsed((open) => open.filter((id) => id !== section.id));
    updateSection(section.id, { ...section, pages: [...section.pages, page] });
    reveal(`note-page-${page.id}`);
  };

  /** From the outline: open the section (and page) and bring it into view. */
  const jumpTo = (sectionId: string, pageId?: string) => {
    setCollapsed((open) => open.filter((id) => id !== sectionId));
    if (pageId) setCollapsedPages((open) => open.filter((id) => id !== pageId));
    reveal(pageId ? `note-page-${pageId}` : `note-section-${sectionId}`);
  };

  const duplicateSection = (index: number) => {
    setSections((rows) => {
      const source = rows[index];
      const copy: SectionDraft = {
        id: newId(),
        title: source.title ? `${source.title} copy` : "",
        pages: source.pages.map((page) => ({ ...page, id: newId() })),
      };
      const next = [...rows];
      next.splice(index + 1, 0, copy);
      return next;
    });
  };

  /** Lift a page out of one section and drop it at the end of another. */
  const movePage = (pageId: string, targetSectionId: string) => {
    setSections((rows) => {
      const moved = rows
        .flatMap((section) => section.pages)
        .find((page) => page.id === pageId);
      if (!moved) return rows;

      return rows.map((section) => {
        if (section.id === targetSectionId) {
          return { ...section, pages: [...section.pages, moved] };
        }
        if (!section.pages.some((page) => page.id === pageId)) return section;
        return {
          ...section,
          pages: section.pages.filter((page) => page.id !== pageId),
        };
      });
    });
    setCollapsed((open) => open.filter((id) => id !== targetSectionId));
  };

  const sectionOptions = useMemo(
    () => sections.map((section) => ({ id: section.id, title: section.title })),
    [sections],
  );

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    const parsed = noteSchema.safeParse(payload);
    if (parsed.success) {
      setClientErrors(null);
      return;
    }

    event.preventDefault();
    const found: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "form";
      found[key] = [...(found[key] ?? []), issue.message];
    }
    setClientErrors(found);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <form action={formAction} onSubmit={handleSubmit}>
      <input type="hidden" name="notes" value={serialised} />
      {defaults?.id ? (
        <input type="hidden" name="id" value={defaults.id} />
      ) : null}

      <div ref={barRef} className="sticky -top-6 z-30 -mx-4 -mt-6 mb-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border bg-bg/95 px-4 pb-3 pt-6 backdrop-blur-[12px] md:mb-6 md:pb-3.5 md:-top-8 md:-mx-5 md:-mt-8 md:px-5 md:pt-8 lg:-mx-8 lg:px-8">
        <div className="min-w-0 flex-1">
          {/* The page title above already says "Edit note" — the bar names the note. */}
          <p className="truncate text-md font-semibold tracking-[-0.03em] text-text">
            {title.trim() || `Untitled · ${heading}`}
          </p>
          <p className="text-xs text-text-muted md:text-sm">
            {sections.length} section{sections.length === 1 ? "" : "s"} ·{" "}
            {pageCount} page{pageCount === 1 ? "" : "s"}
            <span aria-live="polite" className="text-text-subtle">
              {" · "}
              {dirty ? "Unsaved changes" : "All changes saved"}
            </span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
          <Link
            href={
              defaults?.id ? `/notes/${defaults.id}` : "/notes"
            }
            className="inline-flex h-[44px] items-center justify-center rounded-full px-3 text-sm font-medium text-text-muted transition-colors hover:text-text md:h-[40px] md:px-4"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex h-[44px] items-center justify-center gap-2 rounded-full bg-sidebar px-4 text-sm font-medium text-sidebar-fg transition-colors hover:bg-sidebar-2 disabled:pointer-events-none disabled:opacity-70 md:h-[40px] md:px-5 md:text-base"
          >
            {isPending ? (
              <>
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                Saving
              </>
            ) : (
              submitLabel
            )}
          </button>
        </div>
      </div>

      {message ? (
        <p
          role="alert"
          className="mb-6 rounded-[10px] bg-danger-subtle px-4 py-3 text-sm text-danger"
        >
          {message}
        </p>
      ) : null}

      {/*
        One flowing document: the note's own details, a rule, then the sections.
        Deliberately not a stack of cards — the hierarchy is carried by
        headings, indentation and hairlines.
      */}
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
      <div className="w-full min-w-0">
        <section aria-labelledby="note-details-heading" className="wl-card min-w-0 p-5 md:p-6">
          <h2 id="note-details-heading" className="mb-4 text-lg font-semibold tracking-[-0.015em] text-text">Details</h2>
          {/* Title, description and icon on one row, all the same height. */}
          <div className="grid min-w-0 gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] md:items-end md:gap-4">
            <Field label="Title" htmlFor="note-title" errors={errors?.title}>
              <Input
                id="note-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Java Fundamentals"
              />
            </Field>

            <Field
              label="Description"
              htmlFor="note-description"
              optional
              errors={errors?.description}
            >
              <Input
                id="note-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-text">Icon</span>
              <NoteIconPicker value={icon} onChange={setIcon} label="Note icon" />
            </div>
          </div>
        </section>

        <div className="mt-8 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="flex items-baseline gap-2 text-lg font-semibold tracking-[-0.015em] text-text">
            Sections
            <span className="text-sm font-medium text-text-subtle tabular-nums">{sections.length}</span>
          </h2>
          <p className="text-xs text-text-muted md:text-sm">
            Drag a section or page by its handle to reorder it.
          </p>
        </div>

        <div className="mt-4 min-w-0">
          <Reorder.Group
            as="div"
            axis="y"
            values={sections}
            onReorder={setSections}
            className="min-w-0"
          >
            {sections.map((section, index) => (
              <SectionEditor
                key={section.id}
                section={section}
                index={index}
                removable={sections.length > 1}
                sections={sectionOptions}
                collapsed={
                  collapsed.includes(section.id) && !flagged.has(index)
                }
                errors={errors}
                onToggleCollapse={() =>
                  setCollapsed((open) =>
                    open.includes(section.id)
                      ? open.filter((id) => id !== section.id)
                      : [...open, section.id],
                  )
                }
                onChange={(next) => updateSection(section.id, next)}
                onDuplicate={() => duplicateSection(index)}
                onRemove={() =>
                  setSections((rows) =>
                    rows.filter((row) => row.id !== section.id),
                  )
                }
                onAddPage={() => addPage(section)}
                onMovePage={movePage}
                collapsedPages={collapsedPages}
                onTogglePage={(pageId) =>
                  setCollapsedPages((open) =>
                    open.includes(pageId) ? open.filter((id) => id !== pageId) : [...open, pageId],
                  )
                }
              />
            ))}
          </Reorder.Group>
        </div>

        <button
          type="button"
          onClick={addSection}
          className={cn(
            "mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border-strong/60 bg-surface px-4 py-3",
            "text-sm font-semibold text-text-muted transition-colors",
            "hover:border-primary hover:bg-card-tint hover:text-accent-text",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          <Plus aria-hidden="true" className="size-[15px]" />
          Add section
        </button>
      </div>

      <NoteOutline sections={sections} collapsed={collapsed} onJump={jumpTo} />
      </div>
    </form>
  );
}

/**
 * "At a glance": every section and its pages, sticky beside the editor.
 * Clicking opens that section/page and scrolls to it.
 */
function NoteOutline({ sections, collapsed, onJump }: { sections: SectionDraft[]; collapsed: string[]; onJump: (sectionId: string, pageId?: string) => void }) {
  return (
    // Capped to the viewport and scrolled on its own: a long notebook's outline
    // is taller than the screen, and a sticky box can't be scrolled past.
    <aside aria-label="At a glance" className="wl-card hidden border-border-strong lg:sticky lg:top-44 lg:flex lg:max-h-[calc(100dvh-12rem)] lg:flex-col">
      <p className="px-4 pt-4 pb-3 text-xs font-semibold uppercase tracking-[0.1em] text-text-subtle">At a glance</p>
      <ol className="wl-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
        {sections.map((section, index) => (
          <li key={section.id}>
            <button
              type="button"
              onClick={() => onJump(section.id)}
              className="flex w-full cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface-2"
            >
              <span className="grid size-5 shrink-0 place-items-center rounded bg-sidebar text-2xs font-bold text-sidebar-fg">{index + 1}</span>
              <span className={cn("min-w-0 flex-1 truncate text-sm font-semibold", section.title.trim() ? "text-text" : "text-text-subtle")}>
                {section.title.trim() || "Untitled section"}
              </span>
              {collapsed.includes(section.id) ? <span className="text-2xs text-text-subtle">folded</span> : null}
            </button>
            <ol className="ml-4 mt-1 flex flex-col border-l border-border pl-2">
              {section.pages.map((page, pageIndex) => (
                <li key={page.id}>
                  <button
                    type="button"
                    onClick={() => onJump(section.id, page.id)}
                    className={cn("flex w-full cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm transition-colors hover:bg-surface-2", page.title.trim() ? "text-text-muted hover:text-text" : "text-text-subtle")}
                  >
                    <span className="shrink-0 text-2xs tabular-nums text-text-subtle">{pageIndex + 1}.</span>
                    <span className="truncate">{page.title.trim() || "Untitled page"}</span>
                  </button>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </aside>
  );
}

export default NoteForm;

"use client";

import { useReducedMotion } from "framer-motion";
import { ChevronRight, List, Pencil, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";

import { deleteNote, toggleNoteFavorite } from "@/actions/notes";
import { cn } from "@/components/cn";
import { NoteViewer } from "@/components/notes/NoteViewer";
import { isJumping, NOTE_SCROLL_END, smoothScrollTo } from "@/components/notes/smooth-scroll";
import { Button, buttonVariants } from "@/components/ui/button";

export type ReaderPage = { id: string; title: string; content: unknown };
export type ReaderSection = { id: string; title: string; pages: ReaderPage[] };

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;
export const pageAnchor = (id: string) => `page-${id}`;
export const sectionAnchor = (id: string) => `section-${id}`;
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Where a heading counts as "the one you're reading": just below the app
 * header (64px) and the sticky reader bar (56px), with a little slack.
 */
const READING_LINE = 64 + 56 + 24;
/** Where a jumped-to heading lands: flush under the bar. */
const LANDING_OFFSET = 64 + 56 + 16;

/**
 * Reading view for one note, shaped like documentation rather than a stack of
 * cards: every section and page open, one continuous reading column, a chapter
 * list on the left with every topic listed, and a sticky bar that always names
 * the section (› page) you are in, with the note's actions. Page bodies mount
 * lazily (see NoteViewer), so a 30-page notebook stays quick even though
 * everything is "open".
 */
export function NoteReader({
  note,
  icon,
  accent,
  iconColor,
  sections,
}: {
  note: { id: string; title: string; description: string | null; favorite: boolean; updatedLabel: string };
  icon: ReactNode;
  accent: string;
  iconColor: string;
  sections: ReaderSection[];
}) {
  const reduceMotion = useReducedMotion();
  const pageTotal = sections.reduce((sum, s) => sum + s.pages.length, 0);
  const firstPage = sections.find((s) => s.pages.length)?.pages[0];
  const [activeId, setActiveId] = useState<string | null>(firstPage ? pageAnchor(firstPage.id) : null);
  const [contentsOpen, setContentsOpen] = useState(false);
  const tocRef = useRef<HTMLDivElement>(null);

  /*
    Which heading you are reading: the last one whose top has crossed the
    reading line. Measured from scroll position once per frame — an
    IntersectionObserver band only reports on enter/leave, so with long pages
    it lagged a topic behind (the bar said "Topic 5" with Topic 6 on screen).
  */
  useEffect(() => {
    const ids = sections.flatMap((s) => [sectionAnchor(s.id), ...s.pages.map((p) => pageAnchor(p.id))]);
    if (ids.length === 0) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      // Mid-jump the heading you clicked is already marked; re-rendering the
      // whole reader for every heading it flies past is what made jumps stutter.
      if (isJumping()) return;
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top - READING_LINE <= 0) current = id;
        else break;
      }
      setActiveId((previous) => (previous === current ? previous : current));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.addEventListener(NOTE_SCROLL_END, onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener(NOTE_SCROLL_END, onScroll);
      cancelAnimationFrame(frame);
    };
  }, [sections]);

  const activeSectionIndex = Math.max(
    0,
    sections.findIndex((s) => sectionAnchor(s.id) === activeId || s.pages.some((p) => pageAnchor(p.id) === activeId)),
  );
  const activeSection = sections[activeSectionIndex];
  const activePage = activeSection?.pages.find((p) => pageAnchor(p.id) === activeId);

  // Keep the highlighted topic visible inside the chapter list by scrolling
  // ONLY that list (scrollIntoView would also nudge the page mid-read).
  useEffect(() => {
    const box = tocRef.current;
    const item = box?.querySelector<HTMLElement>(`[data-toc="${activeId}"]`);
    if (!box || !item) return;
    const boxRect = box.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    const margin = 56; // clears the pinned section name above the topics
    if (itemRect.top < boxRect.top + margin || itemRect.bottom > boxRect.bottom - 8) {
      box.scrollTo({ top: box.scrollTop + itemRect.top - boxRect.top - boxRect.height / 3, behavior: reduceMotion ? "auto" : "smooth" });
    }
  }, [activeId, reduceMotion]);

  /*
    Smooth jump to a heading. Pages on the way may still be mounting (lazy
    editors) and move the target while we travel; smoothScrollTo follows it
    frame by frame instead of re-aiming with a snap at the end.
  */
  const jumpTo = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, id: string) => {
      const target = document.getElementById(id);
      if (!target) return;
      event.preventDefault();
      setContentsOpen(false);
      setActiveId(id);
      smoothScrollTo(target, { offset: LANDING_OFFSET, reduceMotion: Boolean(reduceMotion) });
      window.history.replaceState(null, "", `#${id}`);
    },
    [reduceMotion],
  );

  const chapters = (
    <nav aria-label="Contents">
      <ol className="flex flex-col gap-3">
        {sections.map((section, index) => {
          const current = index === activeSectionIndex;
          return (
            <li key={section.id}>
              {/* Pinned to the top of the list while its topics scroll under it. */}
              <a
                href={`#${sectionAnchor(section.id)}`}
                data-toc={sectionAnchor(section.id)}
                onClick={(event) => jumpTo(event, sectionAnchor(section.id))}
                aria-current={current ? "true" : undefined}
                className={cn(
                  "sticky top-0 z-10 flex min-h-10 items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-semibold transition-colors duration-150",
                  current ? "bg-sidebar text-sidebar-fg" : "bg-surface text-text-muted hover:bg-surface-2 hover:text-text",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-md text-2xs font-bold tabular-nums transition-colors duration-150",
                    current ? "bg-surface text-text" : "border border-border bg-surface text-text-muted",
                  )}
                >
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 leading-snug">{section.title}</span>
                <span className="shrink-0 text-xs font-medium text-text-subtle tabular-nums">{section.pages.length}</span>
              </a>

              {section.pages.length ? (
                <ul className="mt-1 ml-[1.4rem] flex flex-col border-l border-border pl-3">
                  {section.pages.map((page) => {
                    const active = pageAnchor(page.id) === activeId;
                    return (
                      <li key={page.id}>
                        <a
                          href={`#${pageAnchor(page.id)}`}
                          data-toc={pageAnchor(page.id)}
                          aria-current={active ? "location" : undefined}
                          onClick={(event) => jumpTo(event, pageAnchor(page.id))}
                          className={cn(
                            "-ml-[calc(0.75rem+1px)] flex min-h-9 items-center rounded-r-md border-l-2 py-1.5 pr-2 pl-3 text-sm leading-snug transition-colors duration-150",
                            active
                              ? "border-primary bg-primary-subtle font-semibold text-accent-text"
                              : "border-transparent text-text-muted hover:border-border-strong hover:text-text",
                          )}
                        >
                          {page.title}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );


  /*
    The reading column, memoised: the active heading changes on every scroll
    step, and re-rendering 200+ pages (and their editors) for that was the
    main cost of scrolling a long note.
  */
  const pages = useMemo(() => {
    let pageNumber = 0;
    return (
      <div className="max-w-[52rem]">
        {sections.map((section, sectionIndex) => (
          <section key={section.id} aria-labelledby={`${sectionAnchor(section.id)}-title`}>
            {/* Section opener */}
            <header id={sectionAnchor(section.id)} className="pt-10 pb-2 md:pt-14">
              <p className="text-2xs font-bold tracking-[0.08em] text-accent-text uppercase">
                Section {sectionIndex + 1} of {sections.length} · {plural(section.pages.length, "page")}
              </p>
              <h2 id={`${sectionAnchor(section.id)}-title`} className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-balance text-text md:text-4xl">
                {section.title}
              </h2>
              {sectionIndex === 0 && note.description ? (
                <p className="mt-3 hidden max-w-[65ch] text-base text-pretty text-text-muted lg:block">{note.description}</p>
              ) : null}
            </header>

            {section.pages.length === 0 ? (
              <p className="border-b-2 border-border-strong py-8 text-sm text-text-muted">No pages in this section.</p>
            ) : (
              section.pages.map((page, index) => {
                // Only what is plausibly on screen at load mounts its editor eagerly.
                const eager = pageNumber++ < 2;
                return (
                  <article key={page.id} id={pageAnchor(page.id)} aria-labelledby={`${pageAnchor(page.id)}-title`} className="border-b-2 border-border-strong py-8 md:py-12">
                    <h3 id={`${pageAnchor(page.id)}-title`} className="mb-5 flex items-baseline gap-3 text-2xl font-semibold tracking-[-0.02em] text-balance text-text md:text-3xl">
                      <span aria-hidden="true" className="shrink-0 font-medium text-text-subtle tabular-nums">
                        {sectionIndex + 1}.{index + 1}
                      </span>
                      <span className="min-w-0">{page.title}</span>
                    </h3>
                    <NoteViewer content={page.content} priority={eager} />
                  </article>
                );
              })
            )}
          </section>
        ))}
        <p className="py-10 text-center text-base text-text-muted">
          End of <span className="font-semibold text-text">{note.title}</span> · Updated {note.updatedLabel}
        </p>
      </div>
    );
  }, [sections, note.description, note.title, note.updatedLabel]);

  return (
    <div style={{ "--note": accent } as CSSProperties} className="grid min-w-0 gap-8 lg:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)_13rem] xl:gap-12">
      {/* Chapter list — the note's identity and every section with all its topics. */}
      <aside className="hidden lg:block">
        <div className="sticky top-[calc(4rem+1.5rem)] flex max-h-[calc(100dvh-6.5rem)] flex-col gap-4 rounded-2xl border border-border bg-surface p-3">
          <div className="flex items-start gap-3 px-1 pt-1">
            <span aria-hidden="true" style={{ color: iconColor }} className="grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-surface">
              {icon}
            </span>
            <div className="min-w-0">
              <Link href="/notes" className="text-xs font-semibold text-accent-text hover:underline">Notes</Link>
              {/* The page h1 at lg+ (the phone header below holds the h1 under lg; only one is ever displayed). */}
              <h1 className="text-md leading-snug font-semibold text-balance text-text">{note.title}</h1>
              <p className="mt-0.5 text-xs text-text-muted tabular-nums">{plural(sections.length, "section")} · {plural(pageTotal, "page")}</p>
            </div>
          </div>

          <div ref={tocRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{chapters}</div>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Where am I + actions — solid, so headings never show through as they pass under it. */}
        <div className="sticky top-[calc(4rem+1px)] z-20 -mx-4 border-b border-border bg-bg px-4 md:-mx-5 md:px-5 lg:mx-0 lg:px-0">
          <div className="flex h-14 items-center gap-3">
            <button
              type="button"
              onClick={() => setContentsOpen((open) => !open)}
              aria-expanded={contentsOpen}
              aria-controls="note-contents"
              className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border-strong bg-surface text-text lg:hidden"
              aria-label="Contents"
            >
              <List className="size-4" aria-hidden="true" />
            </button>
            {activeSection ? (
              <>
                <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-sidebar text-xs font-bold text-sidebar-fg tabular-nums">
                  {pad(activeSectionIndex + 1)}
                </span>
                {/* Re-keyed on change so the new location fades in rather than snapping. */}
                <p key={activeId ?? "none"} className="note-crumb-in flex min-w-0 flex-1 flex-col md:flex-row md:items-center md:gap-2">
                  <span className="truncate text-md font-semibold text-text">{activeSection.title}</span>
                  {activePage ? (
                    <>
                      <ChevronRight className="hidden size-4 shrink-0 text-text-subtle md:block" aria-hidden="true" />
                      <span className="truncate text-xs text-text-muted md:text-md">{activePage.title}</span>
                    </>
                  ) : null}
                </p>
              </>
            ) : (
              <span className="min-w-0 flex-1 truncate text-md font-semibold text-text">{note.title}</span>
            )}
            <div className="hidden shrink-0 lg:block"><NoteActions note={note} compact /></div>
          </div>
          {contentsOpen ? (
            <div id="note-contents" className="t-sheet mb-3 max-h-[60dvh] overflow-y-auto rounded-2xl border border-border bg-surface p-2 shadow-md lg:hidden">
              {chapters}
            </div>
          ) : null}
        </div>

        {/* Note header — phones and tablets (desktop shows it in the sidebar). */}
        <header className="border-b border-border pt-6 pb-6 lg:hidden">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" style={{ color: iconColor }} className="grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-surface">
              {icon}
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-[-0.02em] text-balance text-text">{note.title}</h1>
              <p className="text-xs text-text-muted tabular-nums">{plural(sections.length, "section")} · {plural(pageTotal, "page")} · Updated {note.updatedLabel}</p>
            </div>
          </div>
          {note.description ? <p className="mt-3 text-base text-pretty text-text-muted">{note.description}</p> : null}
          <div className="mt-4"><NoteActions note={note} /></div>
        </header>

        {sections.length === 0 ? (
          <p className="mt-10 rounded-2xl border border-dashed border-border-strong bg-card px-6 py-12 text-center text-sm text-text-muted">
            This note has no sections yet. <Link href={`/notes/${note.id}/edit`} className="font-semibold text-accent-text hover:underline">Add one</Link>
          </p>
        ) : (
          pages
        )}
      </div>

      {/* Right rail (xl, 2026-10-08): the pages of the section you're in, and how far through the note you are. */}
      {activeSection ? (
        <aside aria-label="On this page" className="hidden xl:block">
          <div className="sticky top-[calc(4rem+5rem)] flex flex-col gap-3">
            <p className="text-2xs font-bold tracking-[0.08em] text-text-subtle uppercase">On this page</p>
            <ul className="flex flex-col border-l-2 border-border">
              {activeSection.pages.map((page) => {
                const active = pageAnchor(page.id) === activeId;
                return (
                  <li key={page.id}>
                    <a
                      href={`#${pageAnchor(page.id)}`}
                      onClick={(event) => jumpTo(event, pageAnchor(page.id))}
                      className={cn("-ml-0.5 block border-l-2 py-1.5 pl-3 text-sm leading-snug transition-colors duration-150", active ? "border-primary font-semibold text-text" : "border-transparent text-text-muted hover:text-text")}
                    >
                      {page.title}
                    </a>
                  </li>
                );
              })}
            </ul>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
              <span className="block h-full rounded-full bg-primary" style={{ width: `${((activeSectionIndex + 1) / sections.length) * 100}%` }} />
            </div>
            <p className="text-xs text-text-subtle tabular-nums">Section {activeSectionIndex + 1} of {sections.length} · updated {note.updatedLabel}</p>
          </div>
        </aside>
      ) : null}
    </div>
  );
}

function NoteActions({ note, compact }: { note: { id: string; title: string; favorite: boolean }; compact?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      {/* Forms, not links: favouriting and trashing are writes. */}
      <form action={toggleNoteFavorite}>
        <input type="hidden" name="id" value={note.id} />
        <Button
          type="submit"
          size="sm"
          variant={compact ? "ghost" : "secondary"}
          iconOnly={compact}
          className={cn(compact && "text-text")}
          aria-pressed={note.favorite}
          aria-label={compact ? (note.favorite ? "Unstar note" : "Star note") : undefined}
          title={note.favorite ? "Starred" : "Star"}
        >
          <Star aria-hidden="true" className={cn(note.favorite && "fill-warning text-warning")} />
          {compact ? null : note.favorite ? "Starred" : "Star"}
        </Button>
      </form>
      <Link href={`/notes/${note.id}/edit`} className={buttonVariants({ size: "sm" })}>
        <Pencil aria-hidden="true" />
        Edit
      </Link>
      <form action={deleteNote} className={cn(!compact && "ml-auto")}>
        <input type="hidden" name="id" value={note.id} />
        <Button type="submit" size="sm" variant="ghost" iconOnly className="text-danger hover:bg-danger-subtle hover:text-danger" aria-label={`Move ${note.title} to trash`} title="Move to trash">
          <Trash2 aria-hidden="true" />
        </Button>
      </form>
    </div>
  );
}

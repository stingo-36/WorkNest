"use client";

import { format } from "date-fns";
import { FileText, Plus, Star } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { toggleNoteFavorite } from "@/actions/notes";
import { cn } from "@/components/cn";
import { NoteIcon } from "@/components/notes/NoteIcon";
import { PageHead, SearchPill, primaryPill } from "@/components/shell/page-head";
import { Button } from "@/components/ui/button";

export type LibraryNote = {
  id: string;
  title: string;
  description: string | null;
  iconName: string | null;
  iconLibrary: string | null;
  /** icon colour, already darkened for pale brand colours */
  iconColor: string;
  /** the note's accent, used as the book cover fill */
  coverColor: string;
  /** text colour on the cover: dark on pale accents, white otherwise */
  coverInk: string;
  favorite: boolean;
  sectionTitles: string[];
  pageCount: number;
  updatedLabel: string;
};

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;
const PREVIEW_SECTIONS = 3;

/**
 * Notes in the Tracker's "F" layout (2026-10-10, owner's screenshot): title +
 * date, search and New note on one row; a summary column (huge notebook count,
 * a bar per notebook in its cover colour, sections / pages / starred) beside
 * the bookshelf — one book cover per notebook, starred first (server order).
 * Search matches title, description and section names, client-side: the list
 * is small and loaded. `.tk-focus` brings the teal-and-ink palette.
 */
export function NoteLibrary({ notes }: { notes: LibraryNote[] }) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((note) =>
      [note.title, note.description ?? "", ...note.sectionTitles].some((text) => text.toLowerCase().includes(q)),
    );
  }, [notes, query]);

  const stats = [
    { label: "Sections", value: notes.reduce((sum, note) => sum + note.sectionTitles.length, 0) },
    { label: "Pages", value: notes.reduce((sum, note) => sum + note.pageCount, 0) },
    { label: "Starred", value: notes.filter((note) => note.favorite).length },
  ];

  return (
    <div className="tk-focus flex w-full min-w-0 flex-col gap-11">
      <PageHead
        title="Notes"
        meta={format(new Date(), "EEEE d MMM yyyy")}
        actions={
          <>
            <SearchPill id="notes-search" label="Search notes" value={query} placeholder="Search titles, descriptions and sections" onChange={setQuery} shortcut className="w-full md:w-96" />
            <Link href="/notes/new" className={primaryPill}>
              <Plus strokeWidth={2} aria-hidden="true" />
              New note
            </Link>
          </>
        }
      />

      <div className="flex flex-wrap items-start gap-x-12 gap-y-11 xl:gap-x-16">
        <section aria-label="Summary" className="flex min-w-0 flex-[1_1_17rem] flex-col gap-7.5 lg:sticky lg:top-6">
          <div className="flex flex-col gap-3.5">
            <p className="tk-eyebrow text-accent-text">Your notebooks</p>
            <h2 className="flex flex-col gap-5">
              <span className="tk-hero">{notes.length}</span>
              <span className="tk-hero-line">{notes.length === 1 ? "notebook" : "notebooks"}</span>
            </h2>
            <p className="text-lg text-text-muted">
              {notes.length ? "Hover a book to peek inside" : "A notebook per subject: sections inside it, pages inside a section."}
            </p>
          </div>

          {notes.length ? (
            <div aria-hidden="true" className="flex flex-wrap gap-1.5">
              {notes.slice(0, 40).map((note) => <span key={note.id} className="tk-bar" style={{ background: note.coverColor }} />)}
            </div>
          ) : null}

          <dl className="flex flex-col border-b border-[var(--c-tk-rule)]">
            {stats.map((stat) => (
              <div key={stat.label} className="flex flex-row-reverse items-baseline justify-end gap-4 border-t border-[var(--c-tk-rule)] py-3.5">
                <dt className="tk-label text-text-muted">{stat.label}</dt>
                <dd className="tk-stat min-w-25">{stat.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-label="Notebooks" className="flex min-w-0 flex-[999_1_36rem] flex-col">
          {shown.length === 0 && notes.length > 0 ? (
            <p className="py-12 text-center text-lg text-text-muted">
              Nothing matches “{query.trim()}”.{" "}
              <button type="button" onClick={() => setQuery("")} className="cursor-pointer font-semibold text-accent-text hover:underline">Clear search</button>
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 md:gap-x-6 xl:grid-cols-4">
              {shown.map((note) => <NoteBook key={note.id} note={note} />)}
              <li>
                <Link
                  href="/notes/new"
                  className="group/new flex aspect-[3/4] flex-col items-center justify-center gap-4 rounded-[0.5rem_1rem_1rem_0.5rem] border-2 border-dashed border-border-strong text-lg font-semibold text-text transition-colors duration-150 hover:border-primary"
                >
                  <span className="grid size-12 place-items-center rounded-full bg-sidebar text-sidebar-fg transition-colors duration-150 group-hover/new:bg-sidebar-3">
                    <Plus className="size-5" strokeWidth={2} aria-hidden="true" />
                  </span>
                  New notebook
                </Link>
              </li>
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function NoteBook({ note }: { note: LibraryNote }) {
  const preview = note.sectionTitles.slice(0, PREVIEW_SECTIONS);
  const more = note.sectionTitles.length - preview.length;
  return (
    <li className="group relative flex min-w-0 flex-col gap-3">
      {/*
        A 3D book (2026-10-09): on hover/focus the cover swings open on its spine,
        showing the contents page behind (stacked page edges give the depth). The whole book is the link.
      */}
      <Link href={`/notes/${note.id}`} aria-label={`Open ${note.title}`} className="book-3d relative block aspect-[3/4] rounded-[0.5rem_1rem_1rem_0.5rem] outline-none focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-2">
        {/* The first page: the notebook's contents. */}
        <div aria-hidden="true" className="book-pages absolute inset-y-1 right-0 left-1 flex flex-col gap-2 overflow-hidden rounded-[0.25rem_0.875rem_0.875rem_0.25rem] border border-border bg-surface py-5 pr-4 pl-[42%] text-text">
          <span className="text-2xs font-semibold tracking-[0.12em] text-text-subtle uppercase">Contents</span>
          <ol className="flex flex-col gap-1.5 text-sm">
            {note.sectionTitles.slice(0, 7).map((title, index) => (
              <li key={index} className="flex gap-2 border-b border-dashed border-border pb-1.5">
                <span className="font-mono text-xs text-text-subtle tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                <span className="min-w-0 truncate">{title}</span>
              </li>
            ))}
            {note.sectionTitles.length === 0 ? <li className="text-text-subtle">No sections yet</li> : null}
          </ol>
          {note.sectionTitles.length > 7 ? <span className="text-xs text-text-subtle">+{note.sectionTitles.length - 7} more sections</span> : null}
          <span className="mt-auto text-xs font-semibold text-accent-text">Open notebook →</span>
        </div>
        {/* The cover: a spine on the left, the icon on top, the title at the foot. */}
        <div
          style={{
            ["--cover" as string]: note.coverColor,
            backgroundColor: note.coverColor,
            color: note.coverInk,
            // A fine dot texture in the cover's own ink, so it works on dark and pale covers alike.
            backgroundImage: "radial-gradient(color-mix(in srgb, currentColor 16%, transparent) 1px, transparent 1.6px)",
            backgroundSize: "14px 14px",
          }}
          className="book-cover absolute inset-0 flex flex-col justify-between overflow-hidden rounded-[0.5rem_1rem_1rem_0.5rem] py-4 pr-4 pl-6 shadow-card"
        >
          <span aria-hidden="true" className="absolute inset-y-0 left-0 w-2.5 bg-black/20" />
          <span aria-hidden="true" className="absolute inset-y-0 left-2.5 w-px bg-white/25" />
          {/* The note's icon, large and faded, as the cover art. */}
          <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-[-12%] -translate-y-[58%] rotate-[-12deg] opacity-[0.16] [&_svg]:!text-inherit">
            <NoteIcon icon={note.iconLibrary && note.iconName ? { library: note.iconLibrary, name: note.iconName } : null} className="size-44" fallback={<FileText className="size-44" />} />
          </span>
          {/* A soft band behind the title keeps it readable over the art. */}
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(to_top,var(--cover),transparent)]" />
          <span aria-hidden="true" className="relative grid size-11 place-items-center rounded-xl bg-white/20 [&_svg]:!text-inherit">
            <NoteIcon icon={note.iconLibrary && note.iconName ? { library: note.iconLibrary, name: note.iconName } : null} className="size-6" fallback={<FileText className="size-6" />} />
          </span>
          <div className="relative min-w-0">
            <h2 className="line-clamp-3 text-lg leading-tight font-semibold tracking-[-0.02em] [overflow-wrap:anywhere]">{note.title}</h2>
            <p className="mt-1.5 line-clamp-1 text-xs opacity-85">
              {preview.length ? preview.join(" · ") : "No sections yet"}
              {more > 0 ? ` +${more}` : ""}
            </p>
          </div>
        </div>
      </Link>

      {/* A form, not a link: favouriting is a write. */}
      <form action={toggleNoteFavorite} className="absolute top-2 right-2 z-10">
        <input type="hidden" name="id" value={note.id} />
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          iconOnly
          style={{ color: note.coverInk }}
          className="hover:bg-white/20"
          aria-label={note.favorite ? `Unstar ${note.title}` : `Star ${note.title}`}
          aria-pressed={note.favorite}
          title={note.favorite ? "Starred" : "Star"}
        >
          {/* Inline colour: the global icon-colour map would paint the star amber, which vanishes on warm covers. */}
          <Star aria-hidden="true" style={{ color: "inherit" }} className={cn(note.favorite && "fill-current")} />
        </Button>
      </form>

      <div className="min-w-0">
        {note.description ? <p className="line-clamp-3 text-base text-text">{note.description}</p> : null}
        <p className="mt-1.5 flex justify-between gap-2 text-sm text-text-muted tabular-nums">
          <span>{plural(note.sectionTitles.length, "section")} · {plural(note.pageCount, "page")}</span>
          <span>{note.updatedLabel}</span>
        </p>
      </div>
    </li>
  );
}

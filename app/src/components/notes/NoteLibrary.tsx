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
 * Notes as a library (Ocean redesign, 2026-11-01; was a bookshelf of 3D covers):
 * one row per notebook — cover-coloured icon, title and description, sections,
 * pages, last edit, star — beside a preview of the picked notebook (≥ lg) with
 * its sections and an Open button. Below lg each row opens the notebook.
 * Search matches title, description and section names, client-side.
 */
export function NoteLibrary({ notes }: { notes: LibraryNote[] }) {
  const [query, setQuery] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((note) =>
      [note.title, note.description ?? "", ...note.sectionTitles].some((text) => text.toLowerCase().includes(q)),
    );
  }, [notes, query]);
  const picked = shown.find((note) => note.id === pickedId) ?? shown[0] ?? null;

  const sections = notes.reduce((sum, note) => sum + note.sectionTitles.length, 0);
  const pages = notes.reduce((sum, note) => sum + note.pageCount, 0);
  const starred = notes.filter((note) => note.favorite).length;

  return (
    <div className="tk-focus flex w-full min-w-0 flex-col gap-8">
      <PageHead
        title="Notes"
        meta={format(new Date(), "EEEE d MMM yyyy")}
        stats={notes.length ? [
          { value: notes.length, label: notes.length === 1 ? "notebook" : "notebooks" },
          { value: sections, label: sections === 1 ? "section" : "sections" },
          { value: pages, label: pages === 1 ? "page" : "pages" },
          { value: starred, label: "starred" },
        ] : undefined}
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

      {notes.length === 0 ? (
        <Link href="/notes/new" className="group/new flex flex-col items-center justify-center gap-3 rounded-[var(--radius-2xl)] border-2 border-dashed border-[var(--c-tk-rule)] px-6 py-14 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-sidebar text-sidebar-fg transition-colors duration-150 group-hover/new:bg-sidebar-3">
            <Plus className="size-5" strokeWidth={2} aria-hidden="true" />
          </span>
          <span className="text-lg font-semibold text-text">Start your first notebook</span>
          <span className="max-w-md text-base text-text-muted">A notebook per subject: sections inside it, pages inside a section.</span>
        </Link>
      ) : shown.length === 0 ? (
        <p className="py-12 text-center text-lg text-text-muted">
          Nothing matches “{query.trim()}”.{" "}
          <button type="button" onClick={() => setQuery("")} className="cursor-pointer font-semibold text-accent-text hover:underline">Clear search</button>
        </p>
      ) : (
        <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(18rem,1fr)]">
          <section aria-label="Notebooks" className="min-w-0">
            <div className="hidden grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_6rem_2.75rem] gap-3 border-b border-[var(--c-tk-rule)] px-3 pb-2.5 text-2xs font-semibold tracking-[0.1em] text-text-subtle uppercase md:grid">
              <span>Notebook</span><span>Sections</span><span>Pages</span><span>Edited</span><span className="sr-only">Star</span>
            </div>
            <ul className="flex flex-col">
              {shown.map((note) => (
                <NoteRow key={note.id} note={note} picked={note.id === picked?.id} onPick={() => setPickedId(note.id)} />
              ))}
            </ul>
          </section>
          {picked ? <NotePreview note={picked} /> : null}
        </div>
      )}
    </div>
  );
}

function NoteGlyph({ note, className }: { note: LibraryNote; className: string }) {
  return <NoteIcon icon={note.iconLibrary && note.iconName ? { library: note.iconLibrary, name: note.iconName } : null} className={className} fallback={<FileText className={className} />} />;
}

/** One notebook row. Below lg the title opens it; from lg a click previews it on the right. */
function NoteRow({ note, picked, onPick }: { note: LibraryNote; picked: boolean; onPick: () => void }) {
  return (
    <li className={cn("relative grid grid-cols-[minmax(0,1fr)_2.75rem] items-center gap-3 border-b border-[var(--c-tk-rule)] px-3 py-3.5 transition-colors duration-150 md:grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_6rem_2.75rem]", picked ? "lg:rounded-xl lg:bg-primary-subtle" : "hover:bg-surface/60")}>
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl [&_svg]:!text-inherit" style={{ backgroundColor: note.coverColor, color: note.coverInk }}>
          <NoteGlyph note={note} className="size-5" />
        </span>
        <div className="min-w-0">
          <Link href={`/notes/${note.id}`} className="block truncate text-lg font-semibold text-text after:absolute after:inset-0 hover:underline lg:relative lg:z-[5] lg:after:hidden">{note.title}</Link>
          <button type="button" onClick={onPick} aria-pressed={picked} className="absolute inset-0 hidden cursor-pointer lg:block" aria-label={`Preview ${note.title}`} />
          <p className="truncate text-sm text-text-muted">
            {note.description ?? (note.sectionTitles.length ? note.sectionTitles.slice(0, PREVIEW_SECTIONS).join(" · ") : "No sections yet")}
            <span className="md:hidden"> · {plural(note.pageCount, "page")}</span>
          </p>
        </div>
      </div>
      <span className="hidden text-base text-text tabular-nums md:block">{note.sectionTitles.length}</span>
      <span className="hidden text-base text-text tabular-nums md:block">{note.pageCount}</span>
      <span className="hidden text-sm text-text-muted md:block">{note.updatedLabel}</span>
      <StarForm note={note} />
    </li>
  );
}

function StarForm({ note }: { note: LibraryNote }) {
  return (
    // A form, not a link: favouriting is a write.
    <form action={toggleNoteFavorite} className="relative z-10 justify-self-end">
      <input type="hidden" name="id" value={note.id} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        iconOnly
        aria-label={note.favorite ? `Unstar ${note.title}` : `Star ${note.title}`}
        aria-pressed={note.favorite}
        title={note.favorite ? "Starred" : "Star"}
      >
        <Star aria-hidden="true" className={cn(note.favorite && "fill-current")} />
      </Button>
    </form>
  );
}

/** The picked notebook (≥ lg): cover band, description, its sections, Open. */
function NotePreview({ note }: { note: LibraryNote }) {
  return (
    <aside aria-label={`Preview: ${note.title}`} className="sticky top-[calc(var(--dock-clearance)+1.5rem)] hidden overflow-hidden rounded-[var(--radius-2xl)] border border-border bg-surface shadow-card lg:block">
      <div className="relative overflow-hidden px-6 py-6" style={{ backgroundColor: note.coverColor, color: note.coverInk }}>
        <span aria-hidden="true" className="pointer-events-none absolute -right-6 -bottom-8 rotate-[-12deg] opacity-[0.18] [&_svg]:!text-inherit">
          <NoteGlyph note={note} className="size-36" />
        </span>
        <p className="relative text-2xs font-semibold tracking-[0.12em] uppercase opacity-80">Notebook</p>
        <h2 className="relative mt-1.5 text-3xl leading-tight font-bold tracking-[-0.03em] [overflow-wrap:anywhere]" style={{ fontFamily: "var(--font-heading)" }}>{note.title}</h2>
        {note.description ? <p className="relative mt-1.5 line-clamp-3 text-base opacity-90">{note.description}</p> : null}
      </div>
      <ol className="flex max-h-80 flex-col overflow-y-auto py-2">
        {note.sectionTitles.length ? note.sectionTitles.map((title, index) => (
          <li key={index} className="flex gap-3 border-b border-border px-6 py-2.5 text-base text-text last:border-b-0">
            <span className="font-mono text-sm text-text-subtle tabular-nums">{String(index + 1).padStart(2, "0")}</span>
            <span className="min-w-0 truncate">{title}</span>
          </li>
        )) : <li className="px-6 py-3 text-base text-text-muted">No sections yet</li>}
      </ol>
      <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
        <span className="text-sm text-text-muted">{plural(note.pageCount, "page")} · {note.updatedLabel}</span>
        <Link href={`/notes/${note.id}`} className={primaryPill}>Open</Link>
      </div>
    </aside>
  );
}

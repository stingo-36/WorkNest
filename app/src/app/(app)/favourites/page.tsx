import { format } from "date-fns";
import { ArrowRight, ArrowUpRight, FileText, Star } from "lucide-react";
import Link from "next/link";

import { cn } from "@/components/cn";
import { NoteIcon } from "@/components/notes/NoteIcon";
import { PageHead, UnderlineTabs, outlinePill } from "@/components/shell/page-head";
import { isLightColor, noteAccent } from "@/lib/note-colors";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

export const metadata = { title: "Favourites" };

type Show = "all" | "important" | "notes" | "resources";
const SHOWS = new Set<Show>(["all", "important", "notes", "resources"]);

const KIND = {
  FollowUp: { label: "Follow-up", href: "/tracker?view=followups" },
  Task: { label: "To-do", href: "/tracker" },
  Note: { label: "Note", href: "/tracker?view=notes" },
} as const;

/**
 * Everything you've starred, in one place (2026-10-11, from the owner's
 * screenshot): underline tabs (All · Important · Notes · Resources, `?show=`),
 * then open two-column items under section headings. On "All", Important comes
 * first, then Notes and Resources side by side.
 */
export default async function FavouritesPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show: rawShow } = await searchParams;
  const show: Show = SHOWS.has(rawShow as Show) ? (rawShow as Show) : "all";
  const userId = await requireUserId();
  const [notes, resources, tracker] = await Promise.all([
    prisma.note.findMany({
      where: { userId, deletedAt: null, favorite: true },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, description: true, iconName: true, iconLibrary: true, updatedAt: true, _count: { select: { sections: true } } },
    }),
    prisma.resource.findMany({
      where: { userId, favorite: true },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, description: true, type: true, url: true, content: true },
    }),
    prisma.followUp.findMany({
      where: { userId, pinned: true, status: "Open" },
      orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
      select: { id: true, kind: true, subject: true, person: true, dueDate: true },
    }),
  ]);
  const total = notes.length + resources.length + tracker.length;

  const tabs = [
    { key: "all", label: "All", count: total, href: "/favourites" },
    { key: "important", label: "Important", count: tracker.length, href: "/favourites?show=important" },
    { key: "notes", label: "Notes", count: notes.length, href: "/favourites?show=notes" },
    { key: "resources", label: "Resources", count: resources.length, href: "/favourites?show=resources" },
  ];

  const importantItems = tracker.map((entry) => {
    const kind = KIND[entry.kind];
    // Due dates are calendar days stored at UTC midnight: read the day, not the instant.
    const due = entry.dueDate ? format(new Date(`${entry.dueDate.toISOString().slice(0, 10)}T00:00:00`), "EEE d MMM") : null;
    return (
      <Item
        key={entry.id}
        href={kind.href}
        disc={<span className="grid size-10.5 shrink-0 place-items-center rounded-full bg-sidebar text-wl-amber"><Star className="size-4.5 fill-current" aria-hidden="true" /></span>}
        meta={[kind.label, entry.person, due].filter(Boolean).join(" · ")}
        title={entry.subject}
      />
    );
  });

  const noteItems = notes.map((note) => {
    const accent = noteAccent(note.iconName, note.id);
    return (
      <Item
        key={note.id}
        href={`/notes/${note.id}`}
        disc={
          <span style={{ background: accent, color: isLightColor(accent) ? "var(--c-text)" : "var(--c-text-inverse)" }} className="grid size-10.5 shrink-0 place-items-center rounded-full">
            <NoteIcon icon={note.iconLibrary && note.iconName ? { library: note.iconLibrary, name: note.iconName } : null} className="size-5" fallback={<FileText className="size-5" />} />
          </span>
        }
        meta={`Notebook · ${note._count.sections} ${note._count.sections === 1 ? "section" : "sections"} · ${format(note.updatedAt, "d MMM")}`}
        title={note.title}
        description={note.description}
      />
    );
  });

  const resourceItems = resources.map((resource) => {
    const code = resource.type === "Command" || resource.type === "Snippet";
    const external = Boolean(resource.url) && !code;
    return (
      <Item
        key={resource.id}
        href={external ? resource.url! : "/resources"}
        external={external}
        disc={<span className="grid size-10.5 shrink-0 place-items-center rounded-full bg-sidebar text-base font-bold text-sidebar-fg">{initials(resource.title)}</span>}
        meta={external ? host(resource.url!) : resource.type}
        title={resource.title}
        description={code ? null : resource.description}
        code={code ? resource.content : null}
      />
    );
  });

  return (
    <div className="tk-focus flex min-w-0 flex-col gap-10">
      <PageHead title="Favourites" description="Everything you starred, in one place." />

      <UnderlineTabs label="Favourites" items={tabs} current={show} />

      {show === "all" || show === "important" ? (
        <Section
          title="Important"
          note={`${tracker.length} open in Tracker`}
          action={<Link href="/tracker" className={outlinePill}>Open Tracker<ArrowRight strokeWidth={2} aria-hidden="true" /></Link>}
          empty="Star a to-do, follow-up or note in the Tracker to pin it here."
          go={{ href: "/tracker", label: "Go to Tracker" }}
        >
          {importantItems}
        </Section>
      ) : null}

      {show === "all" ? (
        <div className="grid gap-x-20 gap-y-12 border-t border-[var(--c-tk-rule)] pt-10 md:grid-cols-2">
          <Section title="Notes" count={notes.length} empty="Star a note on the Notes page to pin it here." go={{ href: "/notes", label: "Go to Notes" }} column>
            {noteItems}
          </Section>
          <Section title="Resources" count={resources.length} empty="Star a resource on the Resources page to pin it here." go={{ href: "/resources", label: "Go to Resources" }} column>
            {resourceItems}
          </Section>
        </div>
      ) : null}

      {show === "notes" ? (
        <Section title="Notes" count={notes.length} empty="Star a note on the Notes page to pin it here." go={{ href: "/notes", label: "Go to Notes" }}>
          {noteItems}
        </Section>
      ) : null}

      {show === "resources" ? (
        <Section title="Resources" count={resources.length} empty="Star a resource on the Resources page to pin it here." go={{ href: "/resources", label: "Go to Resources" }}>
          {resourceItems}
        </Section>
      ) : null}
    </div>
  );
}

/**
 * A heading (title + count or a note, optional action on the right), then its
 * items in two columns — or one when `column` (the All view's side-by-side
 * pair). Empty: a line saying how to fill it and a link there.
 */
function Section({ title, count, note, action, empty, go, column = false, children }: {
  title: string;
  count?: number;
  note?: string;
  action?: React.ReactNode;
  empty: string;
  go: { href: string; label: string };
  column?: boolean;
  children: React.ReactNode[];
}) {
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-7">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3.5 gap-y-1">
          <h2 className="tk-section">{title}</h2>
          {count !== undefined ? <span className="text-lg font-medium text-text-muted tabular-nums">{count}</span> : null}
          {note ? <span className="text-md text-text-muted">{note}</span> : null}
        </div>
        {action}
      </header>
      {children.length === 0 ? (
        <div className="-mt-3 flex flex-col items-start gap-3">
          <p className="text-lg text-text-muted">{empty}</p>
          <Link href={go.href} className="inline-flex min-h-11 items-center gap-2 text-md font-semibold text-text hover:underline">
            {go.label}
            <ArrowRight className="size-4" strokeWidth={2} aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <ul className={cn("grid gap-x-20 gap-y-10", !column && "md:grid-cols-2")}>{children}</ul>
      )}
    </section>
  );
}

/** The title link covers the whole item (its ::after). */
const LINK = "decoration-2 underline-offset-4 after:absolute after:inset-0 group-hover:underline";

/** One starred thing: a disc, a meta line, a big title (the whole item is the link), optional text. */
function Item({ href, external = false, disc, meta, title, description, code }: {
  href: string;
  external?: boolean;
  disc: React.ReactNode;
  meta: string;
  title: string;
  description?: string | null;
  code?: string | null;
}) {
  return (
    <li className="group relative flex min-w-0 flex-col gap-3">
      <div aria-hidden="true" className="flex min-w-0 items-center gap-3">
        {disc}
        <span className="min-w-0 truncate text-md font-medium text-text-muted">{meta}</span>
      </div>
      <h3 className="tk-card-title [overflow-wrap:anywhere]">
        {external ? (
          <a href={href} target="_blank" rel="noreferrer" className={LINK}>
            {title}
            <ArrowUpRight className="ml-1 inline size-[0.85em] align-[-0.08em] text-text-muted" strokeWidth={2.2} aria-hidden="true" />
            <span className="sr-only">, {meta} (opens in a new tab)</span>
          </a>
        ) : (
          <Link href={href} className={LINK}>
            {title}
            <span className="sr-only">, {meta}</span>
          </Link>
        )}
      </h3>
      {description ? <p className="line-clamp-2 text-lg text-text-muted">{description}</p> : null}
      {code ? <code className="line-clamp-2 block rounded-xl border border-[var(--c-tk-rule)] bg-surface px-4 py-3 font-mono text-sm text-text">{code}</code> : null}
    </li>
  );
}

/** "UI Skills" → "UI", "Awesome DESIGN.md" → "AD" — same rule as the Resources cards. */
function initials(title: string) {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words[0].length <= 2) return words[0].toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function host(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

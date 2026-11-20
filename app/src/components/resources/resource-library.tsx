"use client";

import { format, isToday } from "date-fns";
import { ChevronRight, Mail, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/components/cn";
import { PageHead, SearchPill, primaryPill } from "@/components/shell/page-head";
import { mergeResourceTypes, undoMergeResourceTypes } from "@/actions/content";
import { FormError } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { CODE_TYPES, GmailUndoButton, ResourceComposer, ResourceQuickActions, ResourceRow, isNewImport, safeHost, type ResourceItem } from "@/components/resources/resource-cards";
import { TypeIcon, TypeIconsProvider, type TypeIconMap } from "@/components/resources/type-icon";
import { matchesSearch, orderTypes, resourceTypeKey, typeMeta, typeSlug, typeTone } from "@/lib/resource-types";

export type { ResourceItem } from "@/components/resources/resource-cards";

const dayLabel = (iso: string) => format(new Date(iso), "d MMM");
const PREVIEW_ITEMS = 8;

type TypeGroup = { type: string; items: ResourceItem[]; fresh: number };

/** The latest Gmail email that added something, for the preview's "N added · Undo". */
export type LatestGmailImport = { messageId: string; added: number } | null;

/** Built-in types that hold the same kind of thing; the merge note offers to fold them into Links. */
const LOOK_ALIKE = ["Website", "Link", "Reference"];
const MERGE_HIDDEN_KEY = "worknest.resources.mergeHidden";

/**
 * Resources as a library of types (2026-11-17, modelled on Notes; was a hero
 * with type chips and cards): one row per type — tone tile, name, its first
 * titles, count, last added — beside a preview of the picked type (≥ lg) with
 * its items and an Open button. Below xl a row opens the type's page.
 * 2026-11-20: search lists the matching resources themselves; preview items
 * open / copy in one tap; a note offers to merge look-alike types.
 */
export function ResourceLibrary({
  resources,
  types: typeList,
  typeIcons,
  savedTags,
  gmailType,
  gmailLatest,
  loadError,
}: {
  resources: ResourceItem[];
  /** Profile → Dropdown lists → Resource types, in the user's order. */
  types: string[];
  typeIcons: TypeIconMap;
  savedTags: string[];
  /** The type Gmail import fills, when Gmail is connected. */
  gmailType: string | null;
  gmailLatest?: LatestGmailImport;
  loadError?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  /** The Add popup: the type it starts on ("" = guess from what's pasted), or edit. */
  const [composing, setComposing] = useState<{ type: string; resource?: ResourceItem } | null>(null);

  // The type Gmail fills leads, so new imports are the first thing on the page.
  const order = useMemo(() => {
    const types = orderTypes(typeList, resources);
    if (!gmailType) return types;
    const lead = types.find((type) => resourceTypeKey(type) === resourceTypeKey(gmailType));
    return lead ? [lead, ...types.filter((type) => type !== lead)] : types;
  }, [typeList, resources, gmailType]);
  const groups = useMemo<TypeGroup[]>(() => order
    .map((type) => {
      const items = resources
        .filter((resource) => resourceTypeKey(resource.type) === resourceTypeKey(type))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { type, items, fresh: items.filter(isNewImport).length };
    })
    .filter((group) => group.items.length > 0), [order, resources]);
  // Search lists the resources themselves, newest first, across every type.
  const results = useMemo(() => (query.trim()
    ? resources.filter((resource) => matchesSearch(resource, query)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : []), [resources, query]);
  const picked = groups.find((group) => resourceTypeKey(group.type) === pickedKey) ?? groups[0] ?? null;

  const knownTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tag of resources.flatMap((resource) => resource.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    const used = [...counts.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b));
    return [...used, ...savedTags.filter((tag) => !counts.has(tag))];
  }, [resources, savedTags]);

  const usedTypes = order.filter((type) => resources.some((resource) => resourceTypeKey(resource.type) === resourceTypeKey(type)));
  const starred = resources.filter((resource) => resource.favorite).length;
  const addedToday = resources.filter((resource) => isToday(new Date(resource.createdAt))).length;
  const fromGmail = (type: string) => gmailType !== null && resourceTypeKey(gmailType) === resourceTypeKey(type);

  return (
    <TypeIconsProvider value={typeIcons}>
      <div className="tk-focus flex w-full min-w-0 flex-col gap-8">
        <PageHead
          title="Resources"
          meta={format(new Date(), "EEEE d MMM yyyy")}
          stats={resources.length ? [
            { value: resources.length, label: resources.length === 1 ? "resource" : "resources" },
            { value: usedTypes.length, label: usedTypes.length === 1 ? "type" : "types" },
            { value: starred, label: "starred" },
            ...(addedToday ? [{ value: addedToday, label: "new today" }] : []),
          ] : undefined}
          actions={
            <>
              <SearchPill id="resource-search" label="Search resources" value={query} placeholder="Search titles, links, commands and #tags" onChange={setQuery} shortcut className="w-full md:w-96" />
              <button type="button" onClick={() => setComposing({ type: "" })} className={primaryPill}>
                <Plus strokeWidth={2} aria-hidden="true" />
                Add resource
              </button>
            </>
          }
        />

        <FormError>{loadError}</FormError>

        {resources.length === 0 ? (
          <button type="button" onClick={() => setComposing({ type: "" })} className="group/new flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[var(--radius-2xl)] border-2 border-dashed border-[var(--c-tk-rule)] px-6 py-14 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-sidebar text-sidebar-fg transition-colors duration-150 group-hover/new:bg-sidebar-3">
              <Plus className="size-5" strokeWidth={2} aria-hidden="true" />
            </span>
            <span className="text-lg font-semibold text-text">Add your first resource</span>
            <span className="max-w-md text-base text-text-muted">Links, commands, docs and tools you reach for, grouped by type.</span>
          </button>
        ) : query.trim() ? (
          results.length === 0 ? (
            <p className="py-12 text-center text-lg text-text-muted">
              Nothing matches “{query.trim()}”.{" "}
              <button type="button" onClick={() => setQuery("")} className="cursor-pointer font-semibold text-accent-text hover:underline">Clear search</button>
            </p>
          ) : (
            <section aria-label="Search results" className="flex min-w-0 flex-col gap-3">
              <p role="status" className="text-sm text-text-muted">{results.length} {results.length === 1 ? "resource matches" : "resources match"} “{query.trim()}”</p>
              <ul className="rs-rows">
                {results.map((resource) => <ResourceRow key={resource.id} resource={resource} onEdit={() => setComposing({ type: resource.type, resource })} />)}
              </ul>
            </section>
          )
        ) : (
          <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(20rem,1fr)]">
            <section aria-label="Resource types" className="min-w-0">
              <div className="hidden grid-cols-[minmax(0,1fr)_4.5rem_6rem_2.75rem] gap-3 border-b border-[var(--c-tk-rule)] px-3 pb-2.5 text-2xs font-semibold tracking-[0.1em] text-text-subtle uppercase md:grid">
                <span>Type</span><span>Items</span><span>Added</span><span className="sr-only">Open</span>
              </div>
              <ul className="flex flex-col">
                {groups.map((group) => (
                  <TypeRow
                    key={group.type}
                    group={group}
                    href={`/resources/${typeSlug(group.type)}`}
                    picked={picked?.type === group.type}
                    onPick={() => setPickedKey(resourceTypeKey(group.type))}
                  />
                ))}
              </ul>
              <MergeNote groups={groups} />
            </section>
            {picked ? (
              <TypePreview
                group={picked}
                href={`/resources/${typeSlug(picked.type)}`}
                gmail={fromGmail(picked.type) ? gmailLatest ?? null : undefined}
                onAdd={() => setComposing({ type: picked.type })}
              />
            ) : null}
          </div>
        )}

        {composing ? (
          <ResourceComposer
            // "" = the link-first form guesses; fall back to Link, then the list's first type.
            initialType={composing.type || typeList.find((type) => resourceTypeKey(type) === resourceTypeKey("Link")) || typeList[0] || "Other"}
            resource={composing.resource}
            knownTags={knownTags}
            typeOptions={typeList}
            onClose={() => setComposing(null)}
            onSaved={() => { setComposing(null); router.refresh(); }}
          />
        ) : null}
      </div>
    </TypeIconsProvider>
  );
}

/** One type row. Below xl the name opens the type; from xl (room for the preview) a click previews it on the right. */
function TypeRow({ group, href, picked, onPick }: { group: TypeGroup; href: string; picked: boolean; onPick: () => void }) {
  const label = typeMeta(group.type).plural;
  return (
    <li className={cn("relative grid grid-cols-[minmax(0,1fr)_2.75rem] items-center gap-3 border-b border-[var(--c-tk-rule)] px-3 py-3.5 transition-colors duration-150 md:grid-cols-[minmax(0,1fr)_4.5rem_6rem_2.75rem]", picked ? "xl:rounded-xl xl:bg-primary-subtle" : "hover:bg-surface/60")}>
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden="true" className={cn("rt-tile size-10", typeTone(group.type))}>
          <TypeIcon type={group.type} className="size-5" />
        </span>
        <div className="min-w-0">
          <span className="flex min-w-0 items-center gap-2">
            <Link href={href} className="truncate text-lg font-semibold text-text after:absolute after:inset-0 hover:underline xl:relative xl:z-[5] xl:after:hidden">{label}</Link>
            {group.fresh ? <span className="rt-fresh">{group.fresh} new</span> : null}
          </span>
          <button type="button" onClick={onPick} aria-pressed={picked} className="absolute inset-0 hidden cursor-pointer xl:block" aria-label={`Preview ${label}`} />
          <p className="truncate text-sm text-text-muted">
            {group.items.slice(0, 3).map((item) => item.title).join(", ")}
            <span className="md:hidden"> · {group.items.length}</span>
          </p>
        </div>
      </div>
      <span className="hidden text-base text-text tabular-nums md:block">{group.items.length}</span>
      <span className="hidden text-sm text-text-muted md:block">{dayLabel(group.items[0].createdAt)}</span>
      <ChevronRight className="size-4 justify-self-end text-text-subtle" aria-hidden="true" />
    </li>
  );
}

/**
 * The picked type (≥ xl): tone band, the Gmail line when Gmail fills it, its
 * newest items — each opens or copies in one tap — then Add and Open.
 */
function TypePreview({ group, href, gmail, onAdd }: { group: TypeGroup; href: string; /** undefined = Gmail doesn't fill this type. */ gmail: LatestGmailImport | undefined; onAdd: () => void }) {
  const label = typeMeta(group.type).plural;
  const count = `${group.items.length} ${group.items.length === 1 ? "item" : "items"}`;
  const isCode = CODE_TYPES.has(resourceTypeKey(group.type));

  return (
    <aside aria-label={`Preview: ${label}`} className="sticky top-[calc(var(--dock-clearance)+1.5rem)] hidden overflow-hidden rounded-[var(--radius-2xl)] border border-border bg-surface shadow-card xl:block">
      <div className={cn("relative overflow-hidden px-6 py-6", typeTone(group.type))}>
        <span aria-hidden="true" className="pointer-events-none absolute -right-6 -bottom-8 rotate-[-12deg] opacity-[0.18]">
          <TypeIcon type={group.type} className="size-36" />
        </span>
        <p className="relative text-2xs font-semibold tracking-[0.12em] uppercase opacity-80">Resource type</p>
        <h2 className="relative mt-1.5 text-3xl leading-tight font-bold tracking-[-0.03em] [overflow-wrap:anywhere]" style={{ fontFamily: "var(--font-heading)" }}>{label}</h2>
        <p className="relative mt-1.5 text-base opacity-90">{gmail !== undefined ? "Filled from your Gmail import, plus anything you add." : count}</p>
      </div>
      {gmail ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-surface-2 px-6 py-2.5 text-sm text-text-muted">
          <Mail className="size-4 text-accent-text" aria-hidden="true" />
          <span>From Gmail · last email added {gmail.added}</span>
          <GmailUndoButton messageId={gmail.messageId} added={gmail.added} />
        </p>
      ) : null}
      <ol className="flex max-h-96 flex-col overflow-y-auto py-1">
        {group.items.slice(0, PREVIEW_ITEMS).map((item, index) => (
          <li key={item.id} className="rp-item">
            <span className="font-mono text-sm text-text-subtle tabular-nums">{String(index + 1).padStart(2, "0")}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-base text-text">
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noreferrer" className="truncate font-medium hover:underline">{item.title}<span className="sr-only"> (opens in a new tab)</span></a>
                ) : <span className="truncate font-medium">{item.title}</span>}
                {isNewImport(item) ? <span className="rs-new"><Mail className="size-3.5" aria-hidden="true" />New</span> : null}
              </span>
              <span className="block truncate font-mono text-xs text-text-muted">{isCode && item.content ? `$ ${item.content}` : item.url ? safeHost(item.url) : ""}</span>
            </span>
            <ResourceQuickActions resource={item} />
          </li>
        ))}
      </ol>
      <div className="flex items-center gap-2 border-t border-border px-6 py-4">
        <span className="min-w-0 flex-1 text-sm text-text-muted">{count} · {dayLabel(group.items[0].createdAt)}</span>
        <button type="button" onClick={onAdd} className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full border border-border-strong bg-surface px-4 text-sm font-semibold text-text transition-colors duration-150 hover:bg-surface-2">
          <Plus className="size-4" aria-hidden="true" />Add
        </button>
        <Link href={href} className={primaryPill}>Open</Link>
      </div>
    </aside>
  );
}

const noSubscribe = () => () => {};
function readMergeHidden() {
  try { return window.localStorage.getItem(MERGE_HIDDEN_KEY) === "1"; } catch { return false; }
}

/**
 * Website, Link and Reference hold the same kind of thing. When two or more are
 * in use, offer to fold them into Links (with Undo); "Keep separate" hides the
 * note on this browser.
 */
function MergeNote({ groups }: { groups: TypeGroup[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [hiddenNow, setHidden] = useState(false);
  // Read after hydration (the server can't see this browser's choice).
  const hiddenBefore = useSyncExternalStore(noSubscribe, readMergeHidden, () => false);
  const hidden = hiddenNow || hiddenBefore;
  const alike = groups.filter((group) => LOOK_ALIKE.some((name) => resourceTypeKey(name) === resourceTypeKey(group.type)));
  if (hidden || alike.length < 2) return null;
  const into = alike.find((group) => resourceTypeKey(group.type) === resourceTypeKey("Link"))?.type ?? "Link";
  const items = alike.reduce((sum, group) => sum + group.items.length, 0);
  const names = alike.map((group) => typeMeta(group.type).plural);

  function merge() {
    startTransition(async () => {
      const result = await mergeResourceTypes({ from: alike.map((group) => group.type), into });
      if (!result.ok) { toast.error(result.error.message); return; }
      const undo = result.data.undo;
      toast.success(`Merged ${result.data.moved} into ${typeMeta(into).plural}. Your Profile type list is updated too.`, {
        // Long enough to read and change your mind; the default few seconds isn't.
        duration: 15_000,
        action: { label: "Undo", onClick: () => { void undoMergeResourceTypes(undo).then((back) => { if (!back.ok) toast.error(back.error.message); router.refresh(); }); } },
      });
      router.refresh();
    });
  }

  function keep() {
    try { window.localStorage.setItem(MERGE_HIDDEN_KEY, "1"); } catch { /* the note just comes back next visit */ }
    setHidden(true);
  }

  return (
    <div role="note" className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-primary/25 bg-primary-subtle px-4 py-3">
      <p className="min-w-56 flex-1 text-sm text-text">
        <b className="font-semibold">{names.join(", ")}</b> hold {items} {items === 1 ? "link" : "links"} between them and look alike. Merge them into <b className="font-semibold">{typeMeta(into).plural}</b> so there&apos;s one place to look?
      </p>
      <button type="button" disabled={pending} onClick={merge} className={primaryPill}>Merge into {typeMeta(into).plural}</button>
      <button type="button" onClick={keep} className="inline-flex h-10 cursor-pointer items-center rounded-full border border-border-strong bg-surface px-4 text-sm font-semibold text-text hover:bg-surface-2">Keep separate</button>
    </div>
  );
}

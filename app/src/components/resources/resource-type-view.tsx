"use client";

import { formatDistanceToNow } from "date-fns";
import { ChevronLeft, Mail, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { undoGmailImport } from "@/actions/gmail";
import { cn } from "@/components/cn";
import { CODE_TYPES, CodeCard, ResourceCard, ResourceComposer, isNewImport, type ResourceItem } from "@/components/resources/resource-cards";
import { TypeIcon, TypeIconsProvider, type TypeIconMap } from "@/components/resources/type-icon";
import { toast } from "@/components/ui/toast";
import { matchesSearch, resourceTypeKey, typeMeta, typeTone } from "@/lib/resource-types";

type Filter = "all" | "new" | "starred";

export type GmailImportView = {
  label: string;
  lastSyncAt: string | null;
  /** The latest email that added something, for "N added · Undo". */
  latest: { messageId: string; added: number; importedAt: string } | null;
};

/**
 * One resource type (`/resources/<type>`, 2026-11-17): back link, a banner in
 * the type's tone with Add, the Gmail import line when this type is the one
 * Gmail fills, All / New / Starred filters, then the cards (code cards for
 * commands and snippets).
 */
export function ResourceTypeView({
  type,
  resources,
  typeList,
  typeIcons,
  savedTags,
  gmail,
  initialQuery,
}: {
  /** The canonical spelling of the type. */
  type: string;
  /** This type's resources, newest first. */
  resources: ResourceItem[];
  typeList: string[];
  typeIcons: TypeIconMap;
  savedTags: string[];
  /** Present when Gmail import fills this type. */
  gmail: GmailImportView | null;
  initialQuery: string;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState(initialQuery);
  const [composer, setComposer] = useState<{ resource?: ResourceItem } | null>(null);
  const [undoing, startUndo] = useTransition();

  const label = typeMeta(type).plural;
  const fresh = resources.filter(isNewImport);
  const starred = resources.filter((resource) => resource.favorite);
  const shown = (filter === "new" ? fresh : filter === "starred" ? starred : resources).filter((resource) => matchesSearch(resource, query));
  const isCode = CODE_TYPES.has(resourceTypeKey(type));
  const knownTags = useMemo(() => [...new Set([...resources.flatMap((resource) => resource.tags), ...savedTags])], [resources, savedTags]);

  function undo(messageId: string) {
    startUndo(async () => {
      const result = await undoGmailImport({ messageId });
      if (!result.ok) { toast.error(result.error.message); return; }
      toast.success(`Removed ${result.data.removed} from ${label}`);
      router.refresh();
    });
  }

  const filters: Array<{ id: Filter; label: string; count: number }> = [
    { id: "all", label: "All", count: resources.length },
    ...(fresh.length ? [{ id: "new" as const, label: "New", count: fresh.length }] : []),
    ...(starred.length ? [{ id: "starred" as const, label: "Starred", count: starred.length }] : []),
  ];

  return (
    <TypeIconsProvider value={typeIcons}>
      <div className="tk-focus flex w-full min-w-0 flex-col gap-6">
        <Link href="/resources" className="inline-flex min-h-11 w-fit items-center gap-1 text-md font-semibold text-accent-text hover:underline">
          <ChevronLeft className="size-4" aria-hidden="true" />
          Resources
        </Link>

        <header className={cn("rt-banner", typeTone(type))}>
          <span aria-hidden="true" className="pointer-events-none absolute -right-6 -bottom-10 rotate-[-12deg] opacity-[0.18]">
            <TypeIcon type={type} className="size-40" />
          </span>
          <div className="relative flex min-w-0 flex-col gap-1">
            <p className="text-2xs font-semibold tracking-[0.12em] uppercase opacity-80">Resource type · {resources.length} {resources.length === 1 ? "item" : "items"}</p>
            <h1 className="page-title text-inherit [overflow-wrap:anywhere]">{label}</h1>
            {gmail ? <p className="text-base opacity-90">Filled from your “{gmail.label}” Gmail label, plus anything you add.</p> : null}
          </div>
          <button type="button" onClick={() => setComposer({})} className="rt-banner-add">
            <Plus className="size-4" strokeWidth={2.2} aria-hidden="true" />
            Add to {label}
          </button>
        </header>

        {gmail ? (
          <p className="rt-import" role="status">
            <Mail className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <b>Auto-import is on.</b> New modules from “{gmail.label}” land here.{" "}
              {gmail.lastSyncAt ? `Last checked ${formatDistanceToNow(new Date(gmail.lastSyncAt), { addSuffix: true })}.` : "Not checked yet."}
              {gmail.latest ? ` Last email added ${gmail.latest.added}.` : ""}
            </span>
            {gmail.latest ? (
              <button type="button" disabled={undoing} onClick={() => undo(gmail.latest!.messageId)} className="cursor-pointer font-semibold text-accent-text underline underline-offset-4 disabled:opacity-60">Undo</button>
            ) : null}
            <Link href="/profile?section=gmail" className="font-semibold text-accent-text hover:underline">Settings</Link>
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {filters.map((item) => (
            <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} className="rt-filter">
              {item.label} <span className="tabular-nums">{item.count}</span>
            </button>
          ))}
          <label htmlFor="type-search" className="ml-auto flex h-11 w-full min-w-0 items-center gap-2 rounded-full border border-border bg-surface px-4 text-text-muted md:w-72">
            <Search className="size-4 shrink-0" aria-hidden="true" />
            <span className="sr-only">Search {label}</span>
            <input id="type-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${label}`} className="min-w-0 flex-1 bg-transparent text-base text-text outline-none placeholder:text-text-muted" />
          </label>
        </div>

        {shown.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border-strong px-4 py-8 text-center text-md text-text-muted">
            {resources.length === 0 ? `Nothing in ${label} yet.` : "Nothing matches."}
          </p>
        ) : (
          <ul className={isCode ? "rs-terms" : "rs-cards"} data-reveal-stagger>
            {shown.map((resource) => isCode
              ? <CodeCard key={resource.id} resource={resource} onEdit={() => setComposer({ resource })} />
              : <ResourceCard key={resource.id} resource={resource} onEdit={() => setComposer({ resource })} />)}
          </ul>
        )}

        {composer ? (
          <ResourceComposer
            key={composer.resource?.id ?? "new"}
            initialType={type}
            resource={composer.resource}
            knownTags={knownTags}
            typeOptions={typeList}
            onClose={() => setComposer(null)}
            onSaved={() => { setComposer(null); router.refresh(); }}
          />
        ) : null}
      </div>
    </TypeIconsProvider>
  );
}

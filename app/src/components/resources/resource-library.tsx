"use client";

import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Clipboard,
  LibraryBig,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createResource, deleteResource, toggleResourceFavorite, updateResource } from "@/actions/content";
import { cn } from "@/components/cn";
import { Menu, menuItemClass } from "@/components/shell/menu";
import { primaryPill } from "@/components/shell/page-head";
import { Button } from "@/components/ui/button";
import { Field, FormError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Modal } from "@/components/ui/modal";
import { TagInput } from "@/components/ui/tag-input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { TypeIcon, TypeIconsProvider, type TypeIconMap } from "@/components/resources/type-icon";
import { TagChip, tagChipClass, tagChipStyle } from "@/components/ui/tag-chip";
import { MarkdownContent, MarkdownEditor } from "@/components/work-log/markdown-editor";
import { resourceTypeKey, typeMeta } from "@/lib/resource-types";

type ResourceItem = {
  id: string;
  title: string;
  description: string;
  /** Free text from the user's resource-type list (Profile). */
  type: string;
  url: string | null;
  content: string;
  tags: string[];
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * One accent for every type — the palette's teal — so the page reads as part of
 * the app (it used to give each type its own rainbow hex). Types are told
 * apart by icon and name; navy marks what's selected.
 */
const TYPE_ACCENT = "var(--c-primary)";

// Keyed by `resourceTypeKey`, so a custom "Commands" behaves like the built-in "Command".
const URL_TYPES = new Set(["Website", "App", "Link", "Tool", "Documentation", "Learning"].map(resourceTypeKey));
/** Types whose `content` is the thing itself (copied, shown monospace). Everything else has one Description box. */
const CODE_TYPES = new Set(["Command", "Snippet"].map(resourceTypeKey));

/** The "All" tab's key — not a string a user could name a type. */
const ALL = "\u0000all";
const tabLabel = (type: string) => (type === ALL ? "All" : typeMeta(type).plural);

type SortKey = "added" | "updated" | "title";
const SORTS: Record<SortKey, { label: string; compare: (a: ResourceItem, b: ResourceItem) => number }> = {
  added: { label: "Recently added", compare: (a, b) => b.createdAt.localeCompare(a.createdAt) },
  updated: { label: "Recently updated", compare: (a, b) => b.updatedAt.localeCompare(a.updatedAt) },
  title: { label: "A–Z", compare: (a, b) => a.title.localeCompare(b.title) },
};

/** The mockup's search: an underline field with a ⌘K hint (⌘/Ctrl+K focuses it). */
function UnderlineSearch({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        ref.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  return (
    <label htmlFor={id} className="flex h-11 min-w-0 flex-1 items-center gap-3 border-b-2 border-text px-1 text-text-muted transition-colors duration-150 focus-within:border-primary md:w-80 md:flex-none">
      <Search className="size-4.5 shrink-0" strokeWidth={2} aria-hidden="true" />
      <span className="sr-only">Search resources</span>
      <input
        ref={ref}
        id={id}
        type="search"
        value={value}
        placeholder="Search, or #tag"
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 bg-transparent text-md text-text outline-none placeholder:text-text-muted"
      />
      <kbd aria-hidden="true" className="shrink-0 font-sans text-xs text-text-muted max-md:hidden">⌘K</kbd>
    </label>
  );
}

export function ResourceLibrary({
  resources,
  types: typeList,
  typeIcons,
  savedTags,
  loadError,
}: {
  resources: ResourceItem[];
  /** Profile → Dropdown lists → Resource types, in the user's order. */
  types: string[];
  /** Profile → Resource types: the icon picked for each type ("library:Name"). */
  typeIcons: TypeIconMap;
  /** Profile → Tags → Resources: tags saved ahead of use. */
  savedTags: string[];
  loadError?: string;
}) {
  const router = useRouter();
  // The popup form: adding a new resource of `type`, or editing `resource`.
  const [composer, setComposer] = useState<{ type: string; resource?: ResourceItem } | null>(null);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("added");

  // Sidebar of types; the panel shows one type. Search narrows every type's count.
  const query = search.trim().toLowerCase();
  // Reading order = the user's list, then any type still used but since removed from it.
  // Types that read the same ("Website" → "Websites" vs a custom "Websites") share
  // one tab, named by whichever comes first — the list's spelling wins.
  const GROUP_ORDER = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const type of [...typeList, ...resources.map((resource) => resource.type)]) {
      if (!byKey.has(resourceTypeKey(type))) byKey.set(resourceTypeKey(type), type);
    }
    return [...byKey.values()];
  }, [typeList, resources]);
  // A resource's tab: the canonical spelling of its type.
  const groupOf = (type: string) => GROUP_ORDER.find((group) => resourceTypeKey(group) === resourceTypeKey(type)) ?? type;
  const byType = useMemo(() => {
    // Every word must appear somewhere (title, text, URL, type or a tag). "#" is
    // ignored and spaces/dashes count as the same, so "#vibe coding" finds the
    // `vibe-coding` tag and "design github" narrows to resources with both.
    const norm = (value: string) => value.toLowerCase().replace(/#/g, "").replace(/[-_\s]+/g, " ");
    const words = norm(query).split(" ").filter(Boolean);
    const matches = (resource: ResourceItem) => {
      if (words.length === 0) return true;
      const haystack = norm([resource.title, resource.description, resource.content, resource.url ?? "", resource.type, ...resource.tags].join(" \u0000 "));
      return words.every((word) => haystack.includes(word));
    };
    return new Map([
      [ALL, resources.filter(matches)],
      ...GROUP_ORDER.map((type) => [type, resources.filter((resource) => resourceTypeKey(resource.type) === resourceTypeKey(type) && matches(resource))] as const),
    ]);
  }, [resources, query, GROUP_ORDER]);
  const types = GROUP_ORDER.filter((type) => resources.some((resource) => resourceTypeKey(resource.type) === resourceTypeKey(type)));
  // "All" leads the tabs and is the default; a tag click jumps back to it.
  const selected = picked && types.includes(picked) ? picked : types.length ? ALL : null;
  // While searching, fall back to the first type with hits if the selected one has none.
  const firstWithHits = [ALL, ...types].find((type) => (byType.get(type) ?? []).length > 0) ?? null;
  const active = query && (!selected || !(byType.get(selected) ?? []).length) ? firstWithHits ?? selected : selected;
  // The React Compiler memoises this; a manual useMemo here trips its lint.
  const items = [...(active ? byType.get(active) ?? [] : [])].sort(SORTS[sort].compare);
  // Every tag already used, most used first — the tag field's suggestions.
  const knownTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tag of resources.flatMap((resource) => resource.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    const used = [...counts.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b));
    return [...used, ...savedTags.filter((tag) => !counts.has(tag))];
  }, [resources, savedTags]);
  // The sidebar's tag facets: tags in use, most used first.
  const usedTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tag of resources.flatMap((resource) => resource.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 24);
  }, [resources]);

  return (
    <TypeIconsProvider value={typeIcons}>
    <div className="tk-focus motion-page-reveal flex min-w-0 flex-col gap-8">
      {/* Owner's mockup (2026-10-14): title + line on the left, an underline search and
          Add on the right, a rule; then a Type / Tags column beside one list of rows. */}
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5 border-b border-border pb-6">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="page-title">Resources</h1>
          <p className="text-md text-text-muted">Links, commands, apps, tools and references you reach for.</p>
        </div>
        <div className="flex w-full min-w-0 flex-wrap items-center gap-x-4 gap-y-3 md:w-auto">
          <UnderlineSearch id="resource-search" value={search} onChange={setSearch} />
          <button type="button" onClick={() => setComposer({ type: active && active !== ALL ? active : typeList[0] ?? "Other" })} className={primaryPill}>
            <Plus strokeWidth={2} aria-hidden="true" />
            Add resource
          </button>
        </div>
      </header>

      <FormError>{loadError}</FormError>

      {types.length === 0 ? (
        <div className="flex flex-col items-start gap-3 py-10">
          <LibraryBig className="size-6 text-accent-text" aria-hidden="true" />
          <h2 className="tk-section">No resources yet</h2>
          <p className="text-lg text-text-muted">Add the links, commands and references you reach for with Add resource.</p>
        </div>
      ) : (
        <div className="grid min-w-0 gap-x-14 gap-y-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
          {/* Type + tag column; a sideways strip above the list on smaller screens. */}
          <aside className="flex min-w-0 flex-col gap-7">
            <nav aria-label="Resource types" className="flex min-w-0 flex-col gap-2">
              <h2 className="tk-label text-text-muted">Type</h2>
              {/* A dark panel behind the whole list (owner, 2026-10-15), the current type lifted on it. */}
              <ul className="flex gap-1 overflow-x-auto rounded-xl bg-sidebar p-1.5 [scrollbar-width:none] lg:flex-col lg:overflow-visible">
                {[ALL, ...types].map((type) => {
                  const on = active === type;
                  const count = (byType.get(type) ?? []).length;
                  return (
                    <li key={type} className="shrink-0">
                      <button
                        type="button"
                        aria-current={on ? "page" : undefined}
                        onClick={() => setPicked(type)}
                        className={cn(
                          "flex min-h-11 w-full cursor-pointer items-center justify-between gap-6 rounded-lg px-3.5 text-md whitespace-nowrap transition-colors duration-150",
                          on ? "bg-sidebar-fg font-semibold text-sidebar" : "text-sidebar-fg hover:bg-sidebar-3",
                          Boolean(query) && !count && "opacity-50",
                        )}
                      >
                        {tabLabel(type)}
                        <span className={cn("text-sm font-medium tabular-nums", on ? "text-sidebar" : "text-sidebar-fg/75")}>{count}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>

            {/* Tag facets: one click shows All filtered by #tag; again clears. */}
            {usedTags.length ? (
              <div role="group" aria-labelledby="resource-tags-label" className="flex flex-col gap-2">
                <h2 id="resource-tags-label" className="tk-label text-text-muted">Tags</h2>
                <div className="flex flex-wrap gap-x-3.5 gap-y-0.5">
                  {usedTags.map(([tag, count]) => {
                    const on = query === `#${tag}`;
                    return (
                      <button
                        key={tag}
                        type="button"
                        aria-pressed={on}
                        onClick={() => { setSearch(on ? "" : `#${tag}`); if (!on) setPicked(ALL); }}
                        style={tagChipStyle(tag)}
                        // 36px tap target around a slim capsule; the selected tag gets a solid ring.
                        className={cn(tagChipClass, "min-h-9 cursor-pointer decoration-2 underline-offset-4 hover:underline", on && "underline")}
                      >
                        #{tag} <span className="font-medium text-text-muted tabular-nums">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </aside>

          {active ? (
            <section aria-label={active === ALL ? "All resources" : `${tabLabel(active)} resources`} className="flex min-w-0 flex-col">
              <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b-2 border-text pb-2">
                <h2 className="tk-eyebrow text-text">
                  {active === ALL ? "All resources" : tabLabel(active)} · <span className="tabular-nums">{items.length}</span>{query ? " match" : ""}
                </h2>
                <Menu
                  label="Sort resources"
                  trigger={(props) => (
                    <button type="button" {...props} className="flex min-h-11 cursor-pointer items-center gap-1 text-sm font-medium whitespace-nowrap text-text">
                      {SORTS[sort].label}
                      <ChevronDown className="size-3.5" strokeWidth={2.2} aria-hidden="true" />
                    </button>
                  )}
                >
                  {(Object.keys(SORTS) as SortKey[]).map((key) => (
                    <button key={key} type="button" role="menuitem" onClick={() => setSort(key)} className={cn(menuItemClass, sort === key && "text-text")}>
                      <span className="flex-1 text-left">{SORTS[key].label}</span>
                      {sort === key ? <Check className="size-4" aria-hidden="true" /> : null}
                    </button>
                  ))}
                </Menu>
              </header>
              {items.length === 0 ? (
                <p className="border-b border-border py-8 text-lg text-text-muted">Nothing matches that search.</p>
              ) : (
                <ul data-reveal-stagger>
                  {items.map((resource) => <ResourceRow key={resource.id} resource={resource} onEdit={() => setComposer({ type: groupOf(resource.type), resource })} />)}
                </ul>
              )}
            </section>
          ) : null}
        </div>
      )}

      {composer ? (
        <ResourceComposer
          key={composer.resource?.id ?? "new"}
          initialType={composer.type}
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

/** Add a resource, or edit one when `resource` is given — in a popup. */
function ResourceComposer({ initialType, resource, knownTags, typeOptions, onClose, onSaved }: { initialType: string; resource?: ResourceItem; knownTags: string[]; typeOptions: string[]; onClose: () => void; onSaved: () => void }) {
  // `initialType` is already the canonical spelling when editing, so saving merges a stray one.
  const [type, setType] = useState<string>(initialType);
  const [title, setTitle] = useState(resource?.title ?? "");
  // Non-code types used to have a second "Notes or details" box; its text is
  // folded into Description here so editing an old resource loses nothing.
  const [description, setDescription] = useState(() => {
    const base = resource?.description ?? "";
    if (!resource?.content || CODE_TYPES.has(resourceTypeKey(resource.type))) return base;
    return [base, resource.content].filter(Boolean).join("\n\n");
  });
  const [url, setUrl] = useState(resource?.url ?? "");
  const [content, setContent] = useState(resource && CODE_TYPES.has(resourceTypeKey(resource.type)) ? resource.content : "");
  const [tags, setTags] = useState<string[]>(resource?.tags ?? []);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const expectsUrl = URL_TYPES.has(resourceTypeKey(type));

  function save() {
    setError(undefined);
    startTransition(async () => {
      const isCode = CODE_TYPES.has(resourceTypeKey(type));
      const values = { type, title, description, url: url || null, content: isCode ? content : "", tags };
      const result = resource
        ? await updateResource({ resourceId: resource.id, ...values })
        : await createResource(values);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success(resource ? "Resource updated" : "Resource added");
      onSaved();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={resource ? "Edit resource" : "Add to your library"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button onClick={save} loading={pending}><Check aria-hidden="true" />{resource ? "Save changes" : "Save resource"}</Button>
        </>
      }
    >
      <div className="grid min-w-0 gap-4">
        <FormError>{error}</FormError>
        <div className="grid gap-4 md:grid-cols-[12rem_minmax(0,1fr)]">
          <Field label="Resource type" htmlFor="resource-type" required>
            <TypePicker id="resource-type" value={type} options={typeOptions} onChange={setType} />
          </Field>
          <Field label={type === "App" ? "App name" : "Title"} htmlFor="resource-title" required>
            <Input id="resource-title" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder={type === "Command" ? "Deploy the web app" : type === "App" ? "Figma" : "Resource name"} />
          </Field>
        </div>

        <Field label={expectsUrl ? "URL" : "Related URL (optional)"} htmlFor="resource-url">
          <Input id="resource-url" type="url" inputMode="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com" />
        </Field>

        {CODE_TYPES.has(resourceTypeKey(type)) ? (
          <>
            <Field label={type === "Command" ? "Command" : "Code or snippet"} htmlFor="resource-content">
              <Textarea id="resource-content" value={content} onChange={(event) => setContent(event.target.value)} rows={type === "Command" ? 3 : 5} className="font-mono" />
            </Field>
            <Field label="Description" htmlFor="resource-description">
              <Input id="resource-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What does it do?" />
            </Field>
          </>
        ) : (
          <Field label="Description" htmlFor="resource-description">
            <MarkdownEditor id="resource-description" ariaLabel="Description" value={description} onChange={setDescription} placeholder="What is this useful for? Any details worth remembering — links, images and files welcome." minHeight="min-h-28" />
          </Field>
        )}

        <Field label="Tags" htmlFor="resource-tags" hint="Pick a saved tag, or type a new one and press Enter or comma.">
          <TagInput id="resource-tags" value={tags} onChange={setTags} suggestions={knownTags} />
        </Field>
      </div>
    </Modal>
  );
}

/**
 * Resource type as a searchable dropdown — type "doc" to jump to
 * Documentation. MUI Autocomplete limited to the user's type list (no free text);
 * each option carries its type icon and colour.
 */
function TypePicker({ id, value, options, onChange }: { id: string; value: string; options: string[]; onChange: (next: string) => void }) {
  return (
    <Autocomplete<string, false, true, false>
      id={id}
      disableClearable
      autoHighlight
      openOnFocus
      value={value}
      // A type removed from the list stays selectable on a resource that has it.
      options={options.includes(value) ? options : [...options, value]}
      getOptionLabel={(option) => typeMeta(option).label}
      onChange={(_event, next) => onChange(next)}
      noOptionsText="No type matches"
      renderOption={({ key, ...props }, option) => {
        return (
          <li key={key} {...props} style={{ "--type": TYPE_ACCENT } as React.CSSProperties}>
            {/* Bare icon, no tile: colour comes from the app icon map; 20px at a lighter stroke reads crisper than 16px boxed. */}
            <span className="mr-3 inline-flex shrink-0 text-accent-text"><TypeIcon type={option} className="size-5" strokeWidth={1.75} /></span>
            {typeMeta(option).label}
          </li>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps.input,
              startAdornment: <span className="ml-1 inline-flex shrink-0 text-accent-text"><TypeIcon type={value} className="size-4" /></span>,
            },
          }}
        />
      )}
    />
  );
}

/** Shared delete handler for both card kinds. */
function useRemove(resource: ResourceItem) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [asking, setAsking] = useState(false);
  function confirmRemove() {
    setAsking(false);
    startTransition(async () => {
      const result = await deleteResource({ resourceId: resource.id });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Resource deleted");
      router.refresh();
    });
  }
  const dialog = (
    <ConfirmationDialog
      open={asking}
      title={`Delete “${resource.title}”?`}
      description="It's removed from your library and favourites. This can't be undone."
      confirmLabel="Delete resource"
      destructive
      onConfirm={confirmRemove}
      onCancel={() => setAsking(false)}
    />
  );
  return { remove: () => setAsking(true), pending, dialog };
}

function FavoriteButton({ resource, className }: { resource: ResourceItem; className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      iconOnly
      disabled={pending}
      aria-pressed={resource.favorite}
      aria-label={resource.favorite ? `Remove ${resource.title} from favourites` : `Add ${resource.title} to favourites`}
      title={resource.favorite ? "Remove from favourites" : "Add to favourites"}
      onClick={() => startTransition(async () => {
        const result = await toggleResourceFavorite({ resourceId: resource.id, favorite: !resource.favorite });
        if (!result.ok) { toast.error(result.error.message); return; }
        router.refresh();
      })}
      className={cn("relative z-10", resource.favorite ? "text-warning" : "text-text-subtle hover:text-text", className)}
    >
      <Star aria-hidden="true" className={cn(resource.favorite && "fill-current")} />
    </Button>
  );
}

function EditButton({ resource, onClick, className }: { resource: ResourceItem; onClick: () => void; className?: string }) {
  return (
    <Button variant="ghost" size="sm" iconOnly onClick={onClick} aria-label={`Edit ${resource.title}`} title="Edit" className={cn("relative z-10 text-text-subtle hover:text-text", className)}>
      <Pencil aria-hidden="true" />
    </Button>
  );
}

function DeleteButton({ resource, onClick, pending, className }: { resource: ResourceItem; onClick: () => void; pending: boolean; className?: string }) {
  return (
    <Button variant="ghost" size="sm" iconOnly loading={pending} onClick={onClick} aria-label={`Delete ${resource.title}`} title="Delete" className={cn("relative z-10 text-text-subtle hover:text-danger", className)}>
      <Trash2 aria-hidden="true" />
    </Button>
  );
}

/** Three tones for the initials tiles, picked from the title so a resource keeps its colour. */
const TILE_TONES = ["bg-sidebar text-sidebar-fg", "bg-primary text-primary-fg", "bg-warning text-primary-fg"];
function tileTone(title: string) {
  let hash = 0;
  for (const char of title) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TILE_TONES[hash % TILE_TONES.length];
}

/**
 * One row: initials tile; title (opens the URL, ↗) + site in mono; description;
 * tags in mono; edit/delete on hover (md+) and the star. Commands and snippets
 * add their code line with Copy.
 */
function ResourceRow({ resource, onEdit }: { resource: ResourceItem; onEdit: () => void }) {
  const { remove, pending, dialog } = useRemove(resource);
  const host = resource.url ? safeHost(resource.url) : undefined;
  const isCode = CODE_TYPES.has(resourceTypeKey(resource.type));
  const code = resource.content || resource.url || "";
  const reveal = "md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100";
  return (
    <li className="group relative flex min-w-0 items-start gap-4 border-b border-border py-5">
      <span aria-hidden="true" className={cn("grid size-10 shrink-0 place-items-center rounded-lg text-sm font-bold", tileTone(resource.title))}>{initials(resource.title)}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h3 className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          {resource.url && !isCode ? (
            <a href={resource.url} target="_blank" rel="noreferrer" className="text-lg font-bold tracking-[-0.015em] text-text [overflow-wrap:anywhere] decoration-2 underline-offset-4 after:absolute after:inset-0 hover:underline">
              {resource.title}
              <ArrowUpRight className="ml-1 inline size-[0.9em] align-[-0.1em]" strokeWidth={2.2} aria-hidden="true" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            <span className="text-lg font-bold tracking-[-0.015em] text-text [overflow-wrap:anywhere]">{resource.title}</span>
          )}
          <span className="font-mono text-sm text-text-muted">{host && !isCode ? host : typeMeta(resource.type).label.toLowerCase()}</span>
        </h3>
        {/* Formatted (links, images, files); relative z-10 keeps its links clickable above the
            row-wide title link; capped so one long description can't take over the list. */}
        {resource.description ? <MarkdownContent value={resource.description} className="relative z-10 max-h-64 overflow-hidden text-md text-text" /> : null}
        {isCode && code ? (
          <div className="relative z-10 mt-1 flex min-w-0 items-start gap-2 rounded-lg border border-[var(--c-tk-rule)] bg-surface py-2 pr-2 pl-3.5">
            <pre className="min-w-0 flex-1 py-0.5 font-mono text-sm leading-relaxed break-words whitespace-pre-wrap text-text">{code}</pre>
            <CopyButton value={code} />
          </div>
        ) : null}
        {resource.tags.length ? (
          <p className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5">
            {resource.tags.map((tag) => <TagChip key={tag} tag={tag} />)}
          </p>
        ) : null}
      </div>
      <span className="-mt-1 -mr-2 flex shrink-0 items-center">
        <EditButton resource={resource} onClick={onEdit} className={cn("size-9", reveal)} />
        <DeleteButton resource={resource} onClick={remove} pending={pending} className={cn("size-9", reveal)} />
        <FavoriteButton resource={resource} className="size-9" />
      </span>
      {dialog}
    </li>
  );
}

/** "UI Skills" → "UI", "Awesome DESIGN.md" → "AD", "Figma" → "FI". */
function initials(title: string) {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words[0].length <= 2) return words[0].toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  return (
    <button type="button" onClick={copy} aria-label="Copy to clipboard" className="inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-surface px-2 text-xs font-semibold text-text-muted transition-colors duration-150 hover:border-border-strong hover:text-text md:h-7">
      {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Clipboard className="size-3.5" aria-hidden="true" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function safeHost(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

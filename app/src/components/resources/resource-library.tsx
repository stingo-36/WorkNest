"use client";

import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Clipboard,
  LibraryBig,
  Pencil,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createResource, deleteResource, toggleResourceFavorite, updateResource } from "@/actions/content";
import { cn } from "@/components/cn";
import { Menu, menuItemClass } from "@/components/shell/menu";
import { PageHead, SearchPill, UnderlineTabs, outlinePill, primaryPill } from "@/components/shell/page-head";
import { Button } from "@/components/ui/button";
import { Field, FormError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Modal } from "@/components/ui/modal";
import { TagInput } from "@/components/ui/tag-input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { TypeIcon, TypeIconsProvider, type TypeIconMap } from "@/components/resources/type-icon";

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

/** Built-in types keep their plural. Icons: see `type-icon.tsx` (picked in Profile, else guessed from the name). */
const BUILT_IN_META: Record<string, { label: string; plural: string }> = {
  Website: { label: "Website", plural: "Websites" },
  App: { label: "App", plural: "Apps" },
  Link: { label: "Link", plural: "Links" },
  Tool: { label: "Tool", plural: "Tools" },
  Command: { label: "Command", plural: "Commands" },
  Documentation: { label: "Documentation", plural: "Documentation" },
  Snippet: { label: "Snippet", plural: "Snippets" },
  Reference: { label: "Reference", plural: "References" },
  Learning: { label: "Learning", plural: "Learning" },
  Other: { label: "Other", plural: "Other" },
};

function typeMeta(type: string) {
  return BUILT_IN_META[type] ?? { label: type, plural: type };
}

/**
 * One accent for every type — the palette's teal — so the page reads as part of
 * the app (it used to give each type its own rainbow hex). Types are told
 * apart by icon and name; navy marks what's selected.
 */
const TYPE_ACCENT = "var(--c-primary)";

const URL_TYPES = new Set<string>(["Website", "App", "Link", "Tool", "Documentation", "Learning"]);
/** Types whose `content` is the thing itself (copied, shown monospace). Everything else has one Description box. */
const CODE_TYPES = new Set<string>(["Command", "Snippet"]);

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

  // Sidebar of types; the panel shows one type. Search narrows every type's count.
  const query = search.trim().toLowerCase();
  // Reading order = the user's list, then any type still used but since removed from it.
  const GROUP_ORDER = useMemo(
    () => [...typeList, ...new Set(resources.map((resource) => resource.type).filter((type) => !typeList.includes(type)))],
    [typeList, resources],
  );
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
    return new Map(GROUP_ORDER.map((type) => [type, resources.filter((resource) => resource.type === type && matches(resource))]));
  }, [resources, query, GROUP_ORDER]);
  const types = GROUP_ORDER.filter((type) => resources.some((resource) => resource.type === type));
  const selected = picked && types.includes(picked) ? picked : types[0] ?? null;
  // While searching, fall back to the first type with hits if the selected one has none.
  const firstWithHits = types.find((type) => (byType.get(type) ?? []).length > 0) ?? null;
  const active = query && (!selected || !(byType.get(selected) ?? []).length) ? firstWithHits ?? selected : selected;
  const items = active ? byType.get(active) ?? [] : [];
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
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 16);
  }, [resources]);

  return (
    <TypeIconsProvider value={typeIcons}>
    <div className="tk-focus motion-page-reveal flex min-w-0 flex-col gap-10">
      {/* Layout from the owner's screenshot (2026-10-10): display title, search + Add on
          the right; underline type tabs with an "All types" menu; tag row; one type below. */}
      <PageHead
        title="Resources"
        description="The links, commands, apps, tools and references you reach for."
        actions={
          <>
            <SearchPill id="resource-search" label="Search resources" value={search} placeholder="Search resources and tags" onChange={setSearch} className="w-full md:w-80" />
            <button type="button" onClick={() => setComposer({ type: active ?? typeList[0] ?? "Other" })} className={primaryPill}>
              <Plus strokeWidth={2} aria-hidden="true" />
              Add resource
            </button>
          </>
        }
      />

      <FormError>{loadError}</FormError>

      {types.length === 0 ? (
        <div className="flex flex-col items-start gap-3 border-t-2 border-text py-10">
          <LibraryBig className="size-6 text-accent-text" aria-hidden="true" />
          <h2 className="tk-section">No resources yet</h2>
          <p className="text-lg text-text-muted">Add the links, commands and references you reach for with Add resource.</p>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-12">
          <div className="flex min-w-0 flex-col gap-5">
            {/* Type tabs: an underline strip that scrolls sideways when there are many,
                plus "All types" to jump to any of them. */}
            <UnderlineTabs
              label="Resource types"
              current={active}
              onSelect={setPicked}
              items={types.map((type) => ({ key: type, label: typeMeta(type).plural, count: (byType.get(type) ?? []).length, dim: Boolean(query) && !(byType.get(type) ?? []).length }))}
              end={
                <Menu
                  label="All types"
                  className="mb-1.5 shrink-0"
                  trigger={(props) => (
                    <button type="button" {...props} className="flex h-11 cursor-pointer items-center gap-1.5 text-lg font-semibold whitespace-nowrap text-text">
                      All types
                      <ChevronDown className="size-4.5" strokeWidth={2} aria-hidden="true" />
                    </button>
                  )}
                >
                  {types.map((type) => (
                    <button key={type} type="button" role="menuitem" onClick={() => setPicked(type)} className={cn(menuItemClass, active === type && "text-text")}>
                      <TypeIcon type={type} />
                      <span className="flex-1 text-left">{typeMeta(type).plural}</span>
                      <span className="text-xs tabular-nums">{(byType.get(type) ?? []).length}</span>
                    </button>
                  ))}
                </Menu>
              }
            />

            {/* Tag facets: one click searches #tag; the search box shows it. */}
            {usedTags.length ? (
              <div role="group" aria-label="Tags" className="flex flex-wrap gap-x-6 gap-y-2">
                {usedTags.map(([tag, count]) => {
                  const on = query === `#${tag}`;
                  return (
                    <button
                      key={tag}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setSearch(on ? "" : `#${tag}`)}
                      className={cn("cursor-pointer text-md font-semibold transition-colors duration-150 hover:text-text", on ? "text-text underline decoration-2 underline-offset-4" : "text-text-muted")}
                    >
                      #{tag} <span className="font-medium tabular-nums">{count}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          {/* The selected type. */}
          {active ? (
            <section aria-labelledby="resources-panel-title" className="flex min-w-0 flex-col gap-9">
              <header className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
                  <h2 id="resources-panel-title" className="tk-section">{typeMeta(active).plural}</h2>
                  <p className="text-lg text-text-muted">{items.length} {items.length === 1 ? "resource" : "resources"}{query ? " match" : ""}</p>
                </div>
                <button type="button" onClick={() => setComposer({ type: active })} className={outlinePill}>
                  <Plus strokeWidth={2} aria-hidden="true" />
                  Add {typeMeta(active).label.toLowerCase()}
                </button>
              </header>
              {items.length === 0 ? (
                <p className="border-t border-border py-8 text-lg text-text-muted">Nothing matches that search.</p>
              ) : CODE_TYPES.has(active) ? (
                <ul data-reveal-stagger className="flex flex-col gap-8">
                  {items.map((resource) => <CodeLine key={resource.id} resource={resource} onEdit={() => setComposer({ type: resource.type, resource })} />)}
                </ul>
              ) : (
                <ul className="grid gap-x-20 gap-y-12 md:grid-cols-2">
                  {items.map((resource) => <ResourceCard key={resource.id} resource={resource} onEdit={() => setComposer({ type: resource.type, resource })} />)}
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
  const [type, setType] = useState<string>(resource?.type ?? initialType);
  const [title, setTitle] = useState(resource?.title ?? "");
  // Non-code types used to have a second "Notes or details" box; its text is
  // folded into Description here so editing an old resource loses nothing.
  const [description, setDescription] = useState(() => {
    const base = resource?.description ?? "";
    if (!resource?.content || CODE_TYPES.has(resource.type)) return base;
    return [base, resource.content].filter(Boolean).join("\n\n");
  });
  const [url, setUrl] = useState(resource?.url ?? "");
  const [content, setContent] = useState(resource && CODE_TYPES.has(resource.type) ? resource.content : "");
  const [tags, setTags] = useState<string[]>(resource?.tags ?? []);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const expectsUrl = URL_TYPES.has(type);

  function save() {
    setError(undefined);
    startTransition(async () => {
      const isCode = CODE_TYPES.has(type);
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

        {CODE_TYPES.has(type) ? (
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
            <Textarea id="resource-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="What is this useful for? Any details worth remembering." />
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

/**
 * A resource as an open card (no box): initials disc + site, star and
 * hover-revealed edit/delete; big title (opens the URL, ↗); description; tags.
 */
function ResourceCard({ resource, onEdit }: { resource: ResourceItem; onEdit: () => void }) {
  const { remove, pending, dialog } = useRemove(resource);
  const host = resource.url ? safeHost(resource.url) : undefined;
  const reveal = "md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100";
  return (
    <li className="group relative flex min-w-0 flex-col gap-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden="true" className="grid size-10.5 shrink-0 place-items-center rounded-full bg-sidebar text-base font-bold text-sidebar-fg">{initials(resource.title)}</span>
        <span className="min-w-0 flex-1 truncate text-base font-medium text-text-muted">{host ?? typeMeta(resource.type).label}</span>
        <span className="-mr-2 flex shrink-0 items-center">
          <EditButton resource={resource} onClick={onEdit} className={cn("size-9", reveal)} />
          <DeleteButton resource={resource} onClick={remove} pending={pending} className={cn("size-9", reveal)} />
          <FavoriteButton resource={resource} className="size-9" />
        </span>
      </div>
      <h3 className="tk-card-title [overflow-wrap:anywhere]">
        {resource.url ? (
          <a href={resource.url} target="_blank" rel="noreferrer" className="decoration-2 underline-offset-4 after:absolute after:inset-0 hover:underline">
            {resource.title}
            <ArrowUpRight className="ml-1 inline size-[0.85em] align-[-0.08em] text-text-muted" strokeWidth={2.2} aria-hidden="true" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : (
          resource.title
        )}
      </h3>
      {resource.description ? <p className="line-clamp-3 text-lg leading-relaxed whitespace-pre-line text-text-muted">{resource.description}</p> : null}
      {resource.tags.length ? (
        <p className="flex flex-wrap gap-x-2.5 gap-y-1 text-sm font-medium text-text-muted">
          {resource.tags.map((tag) => <span key={tag}>#{tag}</span>)}
        </p>
      ) : null}
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

/** Commands and snippets: name, then the code line with Copy. */
function CodeLine({ resource, onEdit }: { resource: ResourceItem; onEdit: () => void }) {
  const { remove, pending, dialog } = useRemove(resource);
  const value = resource.content || resource.url || "";
  return (
    <li className="group min-w-0">
      <div className="mb-2.5 flex items-center gap-2">
        <h3 className="truncate text-2xl font-bold tracking-[-0.02em] text-text">{resource.title}</h3>
        {resource.description ? <p className="hidden truncate text-lg text-text-muted md:block">— {resource.description}</p> : null}
        <span className="ml-auto flex items-center">
          <FavoriteButton resource={resource} className="size-9 md:size-7" />
          <EditButton resource={resource} onClick={onEdit} className="size-9 md:size-7" />
          <DeleteButton resource={resource} onClick={remove} pending={pending} className="size-9 md:size-7" />
        </span>
      </div>
      <div className="flex min-w-0 items-start gap-2 rounded-xl border border-[var(--c-tk-rule)] bg-surface py-2.5 pl-4 pr-2.5">
        <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words py-0.5 font-mono text-sm leading-relaxed text-text">{value}</pre>
        <CopyButton value={value} />
      </div>
      {dialog}
    </li>
  );
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

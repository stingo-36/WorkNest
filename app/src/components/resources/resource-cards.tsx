"use client";

import { ArrowUpRight, Check, Clipboard, Mail, Pencil, Star, Trash2 } from "lucide-react";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { isToday } from "date-fns";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createResource, deleteResource, toggleResourceFavorite, updateResource } from "@/actions/content";
import { cn } from "@/components/cn";
import { Button } from "@/components/ui/button";
import { Field, FormError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Modal } from "@/components/ui/modal";
import { TagInput } from "@/components/ui/tag-input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { TypeIcon } from "@/components/resources/type-icon";
import { MarkdownContent, MarkdownEditor } from "@/components/work-log/markdown-editor";
import { guessResourceType, guessTitleFromUrl, isWebLink, resourceTypeKey, typeMeta, typeTone } from "@/lib/resource-types";

/**
 * The pieces both Resources screens share (split out of resource-library.tsx on
 * 2026-11-17): the resource shape, the link and code cards, and the add/edit popup.
 */

export type ResourceItem = {
  id: string;
  title: string;
  description: string;
  /** Free text from the user's resource-type list (Profile). */
  type: string;
  url: string | null;
  content: string;
  tags: string[];
  favorite: boolean;
  /** "gmail" when Gmail import added it. */
  source: string | null;
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
export const URL_TYPES = new Set(["Website", "App", "Link", "Tool", "Documentation", "Learning", "Drupal"].map(resourceTypeKey));
/** Types whose `content` is the thing itself (copied, shown monospace). Everything else has one Description box. */
export const CODE_TYPES = new Set(["Command", "Snippet"].map(resourceTypeKey));

/** Add a resource (starting from a pasted link or command), or edit one when `resource` is given — in a popup. */
export function ResourceComposer({ initialType, resource, knownTags, typeOptions, onClose, onSaved }: { initialType: string; resource?: ResourceItem; knownTags: string[]; typeOptions: string[]; onClose: () => void; onSaved: () => void }) {
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
  // Adding starts from what you paste (2026-11-20): a link or a command. The
  // title and type are guessed until you change them yourself.
  const linkFirst = !resource;
  const [source, setSource] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [typeTouched, setTypeTouched] = useState(false);
  const sourceIsLink = isWebLink(source);
  const sourceIsCode = source.trim() !== "" && !sourceIsLink;
  // The native <dialog> moves focus to its Close button on open; put it where typing starts.
  useEffect(() => {
    const timer = window.setTimeout(() => document.getElementById(linkFirst ? "resource-source" : "resource-title")?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [linkFirst]);

  function changeSource(next: string) {
    setSource(next);
    setError(undefined);
    const link = isWebLink(next);
    if (!titleTouched) setTitle(link ? guessTitleFromUrl(next) : "");
    if (!typeTouched) {
      const guess = guessResourceType(next, typeOptions);
      if (guess) setType(guess);
    }
  }

  function save() {
    setError(undefined);
    if (linkFirst && !source.trim()) { setError("Paste a link or a command first."); return; }
    if (linkFirst && !title.trim()) { setError(sourceIsLink ? "Give it a title." : "Say what the command does, so you can find it later."); return; }
    startTransition(async () => {
      const isCode = CODE_TYPES.has(resourceTypeKey(type));
      const values = linkFirst
        ? { type, title, description, url: sourceIsLink ? source.trim() : null, content: sourceIsLink ? "" : source.trim(), tags }
        : { type, title, description, url: url || null, content: isCode ? content : "", tags };
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
      {linkFirst ? (
      <div className="grid min-w-0 gap-4">
        <FormError>{error}</FormError>
        <Field label="Paste a link or a command" htmlFor="resource-source" required>
          <Textarea
            id="resource-source"
            autoFocus
            rows={sourceIsCode && source.includes("\n") ? 4 : 1}
            value={source}
            onChange={(event) => changeSource(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && sourceIsLink) { event.preventDefault(); document.getElementById("resource-title")?.focus(); } }}
            placeholder="https://… or kubectl get pods"
            className={cn("min-h-12 resize-y", sourceIsCode && "font-mono")}
          />
        </Field>
        {source.trim() ? (
          <>
            <p className="-mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-accent-text">
              {sourceIsLink ? <ArrowUpRight className="size-4" aria-hidden="true" /> : <Clipboard className="size-4" aria-hidden="true" />}
              {sourceIsLink ? "A link: it gets an Open button." : "A command or code: it gets a Copy button."}
            </p>
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem]">
              <Field label="Title" htmlFor="resource-title" required hint={sourceIsLink && !titleTouched ? "Filled in from the link." : undefined}>
                <Input id="resource-title" value={title} onChange={(event) => { setTitle(event.target.value); setTitleTouched(true); }} placeholder={sourceIsLink ? "Name" : "What does it do?"} />
              </Field>
              <Field label="Type" htmlFor="resource-type" required hint={!typeTouched ? "Picked from what you pasted." : undefined}>
                <TypePicker id="resource-type" value={type} options={typeOptions} onChange={(next) => { setType(next); setTypeTouched(true); }} />
              </Field>
            </div>
            <Field label="Description" htmlFor="resource-description" hint="Optional.">
              <MarkdownEditor id="resource-description" compact ariaLabel="Description" value={description} onChange={setDescription} placeholder="What is it for? When do you use it?" minHeight="min-h-14" />
            </Field>
            <Field label="Tags" htmlFor="resource-tags" hint="Optional. Pick a saved tag, or type a new one and press Enter or comma.">
              <TagInput id="resource-tags" value={tags} onChange={setTags} suggestions={knownTags} />
            </Field>
          </>
        ) : null}
      </div>
      ) : (
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
      )}
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

/** Five Ocean tones for the initials tiles, picked from the title so a resource keeps its colour. */
const TILE_TONES = ["rs-tone-0", "rs-tone-1", "rs-tone-2", "rs-tone-3", "rs-tone-4"];
export function tileTone(title: string) {
  let hash = 0;
  for (const char of title) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TILE_TONES[hash % TILE_TONES.length];
}

/**
 * A link / doc / app card: initials tile, title (opens the URL, ↗) + site in mono,
 * the star; description; tags; edit/delete on hover (md+).
 */
export function ResourceCard({ resource, onEdit }: { resource: ResourceItem; onEdit: () => void }) {
  const { remove, pending, dialog } = useRemove(resource);
  const host = resource.url ? safeHost(resource.url) : undefined;
  const reveal = "md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100";
  return (
    <li className={cn("rs-card group", isNewImport(resource) && "rs-card-new")}>
      <div className="flex min-w-0 items-start gap-3">
        <span aria-hidden="true" className={cn("rs-fav size-10 text-sm", tileTone(resource.title))}>{initials(resource.title)}</span>
        <h3 className="flex min-w-0 flex-1 flex-col">
          {resource.url ? (
            <a href={resource.url} target="_blank" rel="noreferrer" className="truncate text-md font-semibold text-text decoration-2 underline-offset-4 after:absolute after:inset-0 hover:underline">
              {resource.title}
              <ArrowUpRight className="ml-1 inline size-[0.9em] align-[-0.1em]" strokeWidth={2.2} aria-hidden="true" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            <span className="truncate text-md font-semibold text-text">{resource.title}</span>
          )}
          <span className="truncate font-mono text-xs text-text-muted">{host ?? typeMeta(resource.type).label.toLowerCase()}</span>
        </h3>
        <FavoriteButton resource={resource} className="-mt-1 -mr-1.5 size-9" />
      </div>
      {/* Formatted (links, images, files); relative z-10 keeps its links clickable above the
          card-wide title link; capped so one long description can't take over the grid. */}
      {resource.description ? <MarkdownContent value={resource.description} className="relative z-10 line-clamp-3 text-sm text-text-muted" /> : null}
      <div className="mt-auto flex min-w-0 items-end gap-2">
        {resource.tags.length ? (
          <p className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {resource.tags.map((tag) => <span key={tag} className="rs-chip">#{tag}</span>)}
          </p>
        ) : <span className="flex-1" />}
        {isNewImport(resource) ? <span className="rs-new"><Mail className="size-3.5" aria-hidden="true" />New · from Gmail</span> : null}
        <span className="-mr-1.5 -mb-1 flex shrink-0 items-center">
          <EditButton resource={resource} onClick={onEdit} className={cn("size-9", reveal)} />
          <DeleteButton resource={resource} onClick={remove} pending={pending} className={cn("size-9", reveal)} />
        </span>
      </div>
      {dialog}
    </li>
  );
}

/** A command / snippet on a dark card: title, kind, Copy, the code, description, tags, actions. */
export function CodeCard({ resource, onEdit }: { resource: ResourceItem; onEdit: () => void }) {
  const { remove, pending, dialog } = useRemove(resource);
  const code = resource.content || resource.url || "";
  const isCommand = resourceTypeKey(resource.type) === resourceTypeKey("Command");
  return (
    <li className="rs-term group">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h3 className="min-w-0 text-md font-semibold [overflow-wrap:anywhere] text-white">{resource.title}</h3>
        <span className="rs-kind">{typeMeta(resource.type).label}</span>
        <span className="ml-auto flex items-center gap-1">
          {code ? <CopyButton value={code} /> : null}
        </span>
      </div>
      {code ? (
        <pre className="rs-code">{isCommand ? <span className="rs-prompt" aria-hidden="true">$ </span> : null}{code}</pre>
      ) : null}
      {resource.description ? <MarkdownContent value={resource.description} className="rs-term-desc relative z-10 text-sm" /> : null}
      <div className="mt-auto flex min-w-0 items-end gap-2">
        {resource.tags.length ? (
          <p className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {resource.tags.map((tag) => <span key={tag} className="rs-chip rs-chip-dark">#{tag}</span>)}
          </p>
        ) : <span className="flex-1" />}
        <span className="rs-term-actions -mr-1.5 -mb-1 flex shrink-0 items-center">
          <EditButton resource={resource} onClick={onEdit} className="size-9" />
          <DeleteButton resource={resource} onClick={remove} pending={pending} className="size-9" />
          <FavoriteButton resource={resource} className="size-9" />
        </span>
      </div>
      {dialog}
    </li>
  );
}

/** What a resource is for, in one tap: Copy for commands / snippets, Open for links. */
export function ResourceQuickActions({ resource, className }: { resource: ResourceItem; className?: string }) {
  const code = CODE_TYPES.has(resourceTypeKey(resource.type)) ? resource.content : "";
  return (
    <span className={cn("flex shrink-0 items-center gap-0.5", className)}>
      {code ? (
        <CopyButton value={code} light label={`Copy ${resource.title}`} />
      ) : resource.url ? (
        <a href={resource.url} target="_blank" rel="noreferrer" className="rs-act inline-flex h-11 shrink-0 items-center gap-1.5 text-xs font-semibold md:h-8" aria-label={`Open ${resource.title} (new tab)`}>
          <ArrowUpRight className="size-3.5" strokeWidth={2.2} aria-hidden="true" />Open
        </a>
      ) : null}
      <FavoriteButton resource={resource} className="size-9 md:size-8" />
    </span>
  );
}

/**
 * One resource as a list row (search results, 2026-11-20): tile, title (opens the
 * link), its type, the site or the code, one line of description, tags, then
 * Copy / Open, star, edit and delete.
 */
export function ResourceRow({ resource, onEdit }: { resource: ResourceItem; onEdit: () => void }) {
  const { remove, pending, dialog } = useRemove(resource);
  const code = CODE_TYPES.has(resourceTypeKey(resource.type)) ? resource.content : "";
  return (
    <li className="rs-row">
      {code ? (
        <span aria-hidden="true" className={cn("rt-tile size-9", typeTone(resource.type))}><TypeIcon type={resource.type} className="size-4" /></span>
      ) : (
        <span aria-hidden="true" className={cn("rs-fav size-9 text-xs", tileTone(resource.title))}>{initials(resource.title)}</span>
      )}
      <div className="min-w-0">
        <p className="flex min-w-0 items-center gap-2">
          {resource.url ? (
            <a href={resource.url} target="_blank" rel="noreferrer" className="truncate text-base font-semibold text-text hover:underline">
              {resource.title}
              <ArrowUpRight className="ml-1 inline size-[0.9em] align-[-0.1em]" strokeWidth={2.2} aria-hidden="true" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            <span className="truncate text-base font-semibold text-text">{resource.title}</span>
          )}
          <span className={cn("rt-chip shrink-0", typeTone(resource.type))}>{typeMeta(resource.type).label}</span>
        </p>
        {code ? <pre className="rs-code rs-code-row">{resourceTypeKey(resource.type) === resourceTypeKey("Command") ? <span className="rs-prompt" aria-hidden="true">$ </span> : null}{code}</pre>
          : resource.url ? <p className="truncate font-mono text-xs text-text-muted">{safeHost(resource.url)}</p> : null}
        {resource.description ? <p className="mt-1 line-clamp-1 text-sm text-text-muted">{plainText(resource.description)}</p> : null}
        {resource.tags.length ? <p className="mt-1.5 flex flex-wrap gap-1.5">{resource.tags.map((tag) => <span key={tag} className="rs-chip">#{tag}</span>)}</p> : null}
      </div>
      <span className="rs-row-actions flex items-center">
        <ResourceQuickActions resource={resource} />
        <EditButton resource={resource} onClick={onEdit} className="size-9 md:size-8" />
        <DeleteButton resource={resource} onClick={remove} pending={pending} className="size-9 md:size-8" />
      </span>
      {dialog}
    </li>
  );
}

/** Markdown description as one plain line (links and images reduced to their text). */
function plainText(markdown: string) {
  return markdown.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`#>]/g, "").replace(/\s+/g, " ").trim();
}

/** "UI Skills" → "UI", "Awesome DESIGN.md" → "AD", "Figma" → "FI". */
export function initials(title: string) {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words[0].length <= 2) return words[0].toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function CopyButton({ value, light = false, label = "Copy to clipboard" }: { value: string; light?: boolean; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      toast.error("Couldn't copy — select the text and copy it instead");
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  return (
    <button type="button" onClick={copy} aria-label={label} className={cn(light ? "rs-act" : "rs-copy rounded-lg px-2.5 md:h-8", "inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 text-xs font-semibold transition-colors duration-150", light && copied && "is-done")}>
      {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Clipboard className="size-3.5" aria-hidden="true" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function safeHost(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

/** Added by Gmail import today — marked "New" until midnight. */
export function isNewImport(resource: ResourceItem) {
  return resource.source === "gmail" && isToday(new Date(resource.createdAt));
}

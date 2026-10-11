"use client";

import { Reorder, useDragControls } from "framer-motion";
import { Check, GripVertical, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { addProject, addTag, deleteAllTags, deleteTag, setResourceTypeIcon, removeProject, renameTag, resetOrderedList, setOrderedList } from "@/actions/user-lists";
import { cn } from "@/components/cn";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Input } from "@/components/ui/input";
import { TagIcon } from "@/components/ui/tag-icon";
import { NoteIconPicker } from "@/components/notes/NoteIconPicker";
import { iconRefKey, parseIconRef, TypeIcon, TypeIconsProvider } from "@/components/resources/type-icon";
import { toast } from "@/components/ui/toast";
import type { NoteIconRef } from "@/lib/note-icons";

/** Row controls (× ✎ 🗑): full strength — dimmed controls read as disabled. */
const ROW_CONTROL = "size-8 text-text";

type Result<T> = { ok: true; data: T } | { ok: false; error: { message: string } };

/** Run a list action, toast failures, refresh the page data on success. */
function useListAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function run<T>(action: () => Promise<Result<T>>, onDone: (data: T) => void, success?: string) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) { toast.error(result.error.message); return; }
      onDone(result.data);
      if (success) toast.success(success);
      router.refresh();
    });
  }
  return { run, pending };
}

/** The "add one" row shared by every editor. */
function AddRow({ id, label, placeholder, pending, onAdd, leading }: { id: string; label: string; placeholder: string; pending: boolean; onAdd: (value: string) => void; /** e.g. the icon picker for a new resource type */ leading?: React.ReactNode }) {
  const [value, setValue] = useState("");
  function add() {
    const next = value.trim();
    // The button stays live (a greyed CTA reads as broken); empty → point at the field.
    if (!next) { document.getElementById(id)?.focus(); return; }
    onAdd(next);
    setValue("");
  }
  return (
    <div className="flex items-center gap-2">
      {leading}
      <label htmlFor={id} className="sr-only">{label}</label>
      <Input
        id={id}
        value={value}
        maxLength={60}
        placeholder={placeholder}
        className="min-w-0 flex-1"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }}
      />
      <Button variant="secondary" onClick={add} disabled={pending}>
        <Plus aria-hidden="true" />
        Add
      </Button>
    </div>
  );
}

/**
 * A titled card. The navy header band is the page's dark anchor — it says
 * "this is the section you opened" — with the white body below for the work.
 */
export function ListCard({ title, description, action, children }: { title: string; description: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    // No overflow-hidden: popovers in a row (the resource-type icon picker) must be able to escape the card.
    <section aria-label={title} data-reveal className="wl-card min-w-0">
      <div className="flex items-start gap-3 rounded-t-[inherit] bg-sidebar px-5 py-4 text-sidebar-fg md:px-6">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold tracking-[-0.015em] text-balance">{title}</h2>
          <p className="mt-0.5 text-sm text-pretty text-sidebar-muted">{description}</p>
        </div>
        {action}
      </div>
      <div className="flex flex-col gap-4 p-5 md:p-6">{children}</div>
    </section>
  );
}

// --- ordered option lists (channels, resource types, default meetings) ----------

export type OrderedKind = "FollowUpChannel" | "ResourceType" | "DefaultMeeting";

/**
 * Add, remove and drag to reorder a dropdown's options. Every change saves at
 * once. Removing an option never touches records that already use it.
 *
 * Reordering: drag the ⋮⋮ handle (mouse or touch), or focus it and press ↑ / ↓.
 */
export function OrderedListEditor({
  kind,
  title,
  description,
  initial,
  customized,
  addPlaceholder,
  icons: initialIcons,
}: {
  kind: OrderedKind;
  title: string;
  description: string;
  initial: string[];
  /** False while the built-in defaults are in use (offers no reset). */
  customized: boolean;
  addPlaceholder: string;
  /** Resource types only: each row gets an icon picker (type → "library:Name"). */
  icons?: Record<string, string>;
}) {
  const [values, setValues] = useState(initial);
  const [icons, setIcons] = useState(initialIcons ?? {});
  // Icon chosen for the type being added; applied once it is in the list.
  const [newIcon, setNewIcon] = useState<NoteIconRef | null>(null);
  const [isCustom, setIsCustom] = useState(customized);
  // What the server last confirmed — a drag only saves if the order really changed.
  const saved = useRef(initial);
  const { run, pending } = useListAction();

  function save(next: string[], message: string) {
    const previous = saved.current;
    setValues(next); // optimistic; restored on failure below
    run(
      async () => {
        const result = await setOrderedList({ kind, values: next });
        if (!result.ok) setValues(previous);
        return result;
      },
      (confirmed) => { saved.current = confirmed; setValues(confirmed); setIsCustom(true); },
      message,
    );
  }

  function saveOrderIfChanged(order: string[]) {
    if (order.join("\u0000") !== saved.current.join("\u0000")) save(order, "Order saved");
  }

  function moveByKey(index: number, by: -1 | 1) {
    const target = index + by;
    if (target < 0 || target >= values.length) return;
    const next = [...values];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    save(next, "Order saved");
  }

  return (
    <ListCard
      title={title}
      description={description}
      action={
        isCustom ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-sidebar-fg hover:bg-sidebar-2 hover:text-sidebar-fg"
            disabled={pending}
            title="Back to the built-in list"
            onClick={() => run(() => resetOrderedList({ kind }), (defaults) => { saved.current = defaults; setValues(defaults); setIsCustom(false); }, "Reset to defaults")}
          >
            <RotateCcw aria-hidden="true" />
            Reset
          </Button>
        ) : null
      }
    >
      {values.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-strong px-3 py-3 text-sm text-text-muted">Empty — add the first option below.</p>
      ) : (
        <Reorder.Group
          as="ol"
          axis="y"
          values={values}
          onReorder={setValues}
          aria-label={`${title} — drag to reorder`}
          className={cn("flex flex-col gap-1.5", pending && "opacity-80")}
        >
          {values.map((value, index) => (
            <OrderedRow
              key={value}
              value={value}
              index={index}
              total={values.length}
              pending={pending}
              onDragEnd={() => saveOrderIfChanged(values)}
              onMove={(by) => moveByKey(index, by)}
              onRemove={() => save(values.filter((item) => item !== value), `Removed “${value}”`)}
              icon={
                initialIcons ? (
                  <TypeIconsProvider value={icons}>
                    <TypeIconButton
                      type={value}
                      value={parseIconRef(icons[value])}
                      disabled={pending}
                      onChange={(icon) => run(() => setResourceTypeIcon({ type: value, icon: icon ? iconRefKey(icon) : null }), setIcons, icon ? `Icon updated for “${value}”` : `“${value}” back to its default icon`)}
                    />
                  </TypeIconsProvider>
                ) : null
              }
            />
          ))}
        </Reorder.Group>
      )}
      <AddRow
        id={`add-${kind}`}
        label={`Add to ${title}`}
        placeholder={addPlaceholder}
        pending={pending}
        onAdd={(value) => {
          if (values.some((item) => item.toLowerCase() === value.toLowerCase())) { toast.error(`“${value}” is already in the list`); return; }
          save([...values, value], `Added “${value}”`);
          if (initialIcons && newIcon) {
            const icon = iconRefKey(newIcon);
            setNewIcon(null);
            run(() => setResourceTypeIcon({ type: value, icon }), setIcons);
          }
        }}
        leading={
          initialIcons ? (
            <NoteIconPicker
              value={newIcon}
              onChange={setNewIcon}
              label="Icon for the new type"
              align="start"
              disabled={pending}
              triggerClassName="size-11 shrink-0 text-accent-text"
            />
          ) : null
        }
      />
    </ListCard>
  );
}

/** One draggable option: grip handle · (icon) · name · remove. Position is announced on the handle, not shown. */
function OrderedRow({
  value,
  index,
  total,
  pending,
  onDragEnd,
  onMove,
  onRemove,
  icon,
}: {
  value: string;
  index: number;
  total: number;
  pending: boolean;
  onDragEnd: () => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
  /** Optional icon control shown before the name (resource types). */
  icon?: React.ReactNode;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={value}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      // Lifted look while dragging; the list never scrolls sideways.
      whileDrag={{ scale: 1.02, boxShadow: "var(--sh-md)" }}
      className="flex items-center gap-2 rounded-lg border border-border-strong bg-surface py-1 pr-1 pl-1"
    >
      <button
        type="button"
        aria-label={`Reorder ${value}: drag, or press up and down arrow keys. Position ${index + 1} of ${total}.`}
        title="Drag to reorder"
        disabled={pending}
        onPointerDown={(event) => controls.start(event)}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") { event.preventDefault(); onMove(-1); }
          if (event.key === "ArrowDown") { event.preventDefault(); onMove(1); }
        }}
        className="grid size-11 shrink-0 cursor-grab touch-none place-items-center rounded-md text-text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-text active:cursor-grabbing disabled:cursor-wait focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:size-8"
      >
        <GripVertical className="size-4" aria-hidden="true" />
      </button>
      {icon}
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text" title={value}>{value}</span>
      <Button size="xs" variant="ghost" iconOnly className={cn(ROW_CONTROL, "hover:text-danger")} disabled={pending} aria-label={`Remove ${value}`} title="Remove" onClick={onRemove}>
        <X aria-hidden="true" />
      </Button>
    </Reorder.Item>
  );
}

// --- projects ---------------------------------------------------------------------

export type ProjectOption = { name: string; tickets: number; saved: boolean };

/** Project suggestions: names on tickets plus ones added here. Removing only stops suggesting it. */
export function ProjectListEditor({ initial }: { initial: ProjectOption[] }) {
  const [projects, setProjects] = useState(initial);
  const { run, pending } = useListAction();

  return (
    <ListCard title="Projects / sites" description="Suggested when you set a ticket's project. Removing one keeps it on existing tickets.">
      {projects.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-strong px-3 py-3 text-sm text-text-muted">No projects yet — add one below.</p>
      ) : (
        <ul className={cn("flex max-h-72 flex-col divide-y divide-border overflow-y-auto rounded-lg border border-border", pending && "opacity-70")}>
          {projects.map((project) => (
            <li key={project.name} className="group/row flex items-center gap-2 py-1.5 pr-1.5 pl-3">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-text" title={project.name}>{project.name}</span>
              <span className="shrink-0 text-xs text-text-subtle tabular-nums">
                {project.tickets ? `${project.tickets} ${project.tickets === 1 ? "ticket" : "tickets"}` : "not used yet"}
              </span>
              <Button size="xs" variant="ghost" iconOnly className={cn(ROW_CONTROL, "hover:text-danger")} disabled={pending} aria-label={`Remove ${project.name}`} onClick={() => run(() => removeProject({ name: project.name }), setProjects, `Removed “${project.name}”`)}>
                <X aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <AddRow id="add-project" label="Add a project" placeholder="e.g. ASU Online" pending={pending} onAdd={(name) => run(() => addProject({ name }), setProjects, `Added “${name}”`)} />
    </ListCard>
  );
}

// --- tags -----------------------------------------------------------------------

export type TagUsage = { tag: string; count: number };

/**
 * One tag vocabulary (notes or resources). Rename and delete apply to every
 * item carrying the tag; "add" saves a tag as a suggestion before it's used.
 */
export function TagListEditor({ kind, noun, initial }: { kind: "NoteTag" | "ResourceTag"; noun: { one: string; many: string }; initial: TagUsage[] }) {
  const [tags, setTags] = useState(initial);
  const [editing, setEditing] = useState<{ tag: string; value: string } | null>(null);
  const [confirming, setConfirming] = useState<TagUsage | null>(null);
  const [confirmingAll, setConfirmingAll] = useState(false);
  const { run, pending } = useListAction();
  const usedOn = tags.filter((item) => item.count > 0).length;

  function rename() {
    if (!editing) return;
    const to = editing.value.trim();
    if (!to || to === editing.tag) { setEditing(null); return; }
    const from = editing.tag;
    run(() => renameTag({ kind, from, to }), (next) => { setTags(next); setEditing(null); }, `Renamed #${from}`);
  }

  return (
    <div className="flex flex-col gap-4">
      {tags.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-strong px-3 py-6 text-center text-sm text-text-muted">No tags yet. Add one below, or tag a {noun.one} and it shows up here.</p>
      ) : (
        <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-text-muted tabular-nums">{tags.length} {tags.length === 1 ? "tag" : "tags"}</p>
          <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-subtle hover:text-danger" disabled={pending} onClick={() => setConfirmingAll(true)}>
            <Trash2 aria-hidden="true" />
            Delete all
          </Button>
        </div>
        <ul data-reveal-stagger className={cn("flex flex-col divide-y divide-border rounded-lg border border-border", pending && "opacity-70")}>
          {tags.map((item) => (
            <li key={item.tag} className="group/row flex min-h-12 items-center gap-2 py-1.5 pr-1.5 pl-3">
              {editing?.tag === item.tag ? (
                <>
                  <label htmlFor={`rename-${kind}-${item.tag}`} className="sr-only">New name for #{item.tag}</label>
                  <Input
                    id={`rename-${kind}-${item.tag}`}
                    autoFocus
                    value={editing.value}
                    maxLength={40}
                    className="min-w-0 flex-1"
                    // Old name pre-selected, so typing replaces it.
                    onFocus={(event) => event.target.select()}
                    onChange={(event) => setEditing({ tag: item.tag, value: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") { event.preventDefault(); rename(); }
                      if (event.key === "Escape") { event.preventDefault(); setEditing(null); }
                    }}
                  />
                  <Button size="sm" onClick={rename} loading={pending} aria-label="Save new name"><Check aria-hidden="true" /></Button>
                  <Button size="sm" variant="ghost" iconOnly onClick={() => setEditing(null)} aria-label="Cancel rename"><X aria-hidden="true" /></Button>
                </>
              ) : (
                <>
                  <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-sm font-semibold text-text">
                    <TagIcon tag={item.tag} className="size-3.5" />
                    <span className="truncate" title={item.tag}>{item.tag}</span>
                  </span>
                  <span className="ml-auto shrink-0 text-xs text-text-subtle tabular-nums">
                    {item.count ? `${item.count} ${item.count === 1 ? noun.one : noun.many}` : "not used yet"}
                  </span>
                  <Button size="xs" variant="ghost" iconOnly className={ROW_CONTROL} disabled={pending} aria-label={`Rename #${item.tag}`} title="Rename" onClick={() => setEditing({ tag: item.tag, value: item.tag })}>
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button size="xs" variant="ghost" iconOnly className={cn(ROW_CONTROL, "hover:text-danger")} disabled={pending} aria-label={`Delete #${item.tag}`} title="Delete" onClick={() => setConfirming(item)}>
                    <Trash2 aria-hidden="true" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
        </div>
      )}
      <AddRow id={`add-${kind}`} label={`Add a ${noun.one} tag`} placeholder="e.g. drupal" pending={pending} onAdd={(tag) => run(() => addTag({ kind, tag }), setTags, `Added #${tag.toLowerCase()}`)} />

      <ConfirmationDialog
        open={confirming !== null}
        title={`Delete #${confirming?.tag ?? ""}?`}
        description={
          confirming?.count
            ? `It will be removed from ${confirming.count} ${confirming.count === 1 ? noun.one : noun.many}. The ${noun.many} themselves stay.`
            : "It's not used anywhere yet."
        }
        confirmLabel="Delete tag"
        destructive
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          const tag = confirming?.tag;
          setConfirming(null);
          if (tag) run(() => deleteTag({ kind, tag }), setTags, `Deleted #${tag}`);
        }}
      />

      <ConfirmationDialog
        open={confirmingAll}
        title={`Delete all ${tags.length} ${tags.length === 1 ? "tag" : "tags"}?`}
        description={
          usedOn
            ? `Every tag is removed from every ${noun.one} that has one (${usedOn} of these tags are in use). The ${noun.many} themselves stay. This can't be undone.`
            : "None of them are used yet. This can't be undone."
        }
        confirmLabel="Delete all tags"
        destructive
        onCancel={() => setConfirmingAll(false)}
        onConfirm={() => {
          setConfirmingAll(false);
          run(() => deleteAllTags({ kind }), setTags, "All tags deleted");
        }}
      />
    </div>
  );
}

/** The icon control on a resource-type row: shows the current icon (picked or guessed); click to choose another. */
function TypeIconButton({ type, value, disabled, onChange }: { type: string; value: NoteIconRef | null; disabled: boolean; onChange: (icon: NoteIconRef | null) => void }) {
  return (
    <NoteIconPicker
      value={value}
      onChange={onChange}
      label={`Icon for ${type}`}
      align="start"
      disabled={disabled}
      triggerClassName="size-11 rounded-md border-transparent text-accent-text hover:border-border-strong md:size-8"
      placeholder={<TypeIcon type={type} className="size-[18px]" />}
    />
  );
}

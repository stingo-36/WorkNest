"use client";

import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { Award, CheckCircle2, CircleDashed, ExternalLink, FileText, Loader2, Paperclip, Pencil, Plus, Trash2, UploadCloud, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { createAchievement, deleteAchievement, deleteAchievementFile, updateAchievement } from "@/actions/achievements";
import { cn } from "@/components/cn";
import { PageHead, primaryPill } from "@/components/shell/page-head";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FormError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { MarkdownContent, MarkdownEditor } from "@/components/work-log/markdown-editor";
import { toast } from "@/components/ui/toast";
import { formatBytes } from "@/components/work-log/attachment-utils";

export type AchievementFileItem = { id: string; name: string; size: number };
export type AchievementItem = {
  id: string;
  title: string;
  type: string;
  status: "InProgress" | "Completed";
  assignedBy: string | null;
  /** "YYYY-MM-DD" or "" */
  startDate: string;
  endDate: string;
  description: string;
  files: AchievementFileItem[];
};

type Draft = Omit<AchievementItem, "id" | "files" | "assignedBy"> & { assignedBy: string };

const TYPES = ["Certification", "Course", "Award", "Hackathon", "Promotion", "Other"];
const MAX_BYTES = 10 * 1024 * 1024;
const EMPTY: Draft = { title: "", type: "Certification", status: "Completed", assignedBy: "", startDate: "", endDate: "", description: "" };

const fileHref = (id: string) => `/api/achievement-files/${id}`;
const fmtDay = (key: string) => format(parseISO(key), "d MMM yyyy");
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Inclusive day count, the way a course "from the 20th to the 8th" is counted. */
function durationDays(start: string, end: string) {
  if (!start || !end) return null;
  const days = differenceInCalendarDays(parseISO(end), parseISO(start)) + 1;
  return days > 0 ? days : null;
}

/** Timeline buckets: in progress first, then by the year it finished (or started). */
function groupByYear(items: AchievementItem[]) {
  const groups = new Map<string, AchievementItem[]>();
  for (const item of items) {
    const key = item.status === "InProgress" ? "In progress" : (item.endDate || item.startDate).slice(0, 4) || "Undated";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()];
}

/**
 * /achievements — certifications, courses and awards as a timeline, each with
 * its certificate. Details save through server actions; files upload to a
 * route handler afterwards (actions cap bodies at 1 MB).
 */
export function AchievementsBoard({ initial }: { initial: AchievementItem[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<AchievementItem | "new" | null>(null);
  const [deleting, setDeleting] = useState<AchievementItem | null>(null);

  const completed = initial.filter((item) => item.status === "Completed").length;
  const days = initial.reduce((total, item) => total + (durationDays(item.startDate, item.endDate) ?? 0), 0);

  async function confirmDelete() {
    if (!deleting) return;
    const result = await deleteAchievement({ achievementId: deleting.id });
    if (!result.ok) { toast.error(result.error.message); return; }
    toast.success("Achievement deleted");
    setDeleting(null);
    router.refresh();
  }

  return (
    <div className="tk-focus flex w-full min-w-0 flex-col gap-10">
      <PageHead
        title="Achievements"
        description="Certifications, courses and awards — with the certificate to prove it."
        stats={initial.length ? [
          { value: completed, label: "completed" },
          { value: initial.length - completed, label: "in progress" },
          { value: days, label: "days of effort" },
        ] : undefined}
        actions={initial.length > 0 ? <button type="button" className={primaryPill} onClick={() => setEditing("new")}><Plus strokeWidth={2} aria-hidden="true" />Add achievement</button> : null}
      />

      {initial.length === 0 ? (
        <EmptyState
          icon={Award}
          title="No achievements yet"
          description="Add a certification or course you've finished, and attach the certificate."
          action={<Button onClick={() => setEditing("new")}><Plus aria-hidden="true" />Add achievement</Button>}
        />
      ) : (
        <div className="flex flex-col gap-10">
          {groupByYear(initial).map(([year, items], groupIndex, groups) => {
            // Alternate sides across the whole page, not per year.
            const offset = groups.slice(0, groupIndex).reduce((sum, [, list]) => sum + list.length, 0);
            return (
              <section key={year} aria-labelledby={`achievements-${year}`} className="flex flex-col gap-4">
                <h2 id={`achievements-${year}`} className="flex items-baseline gap-3 lg:justify-center">
                  <span className="rounded-full bg-sidebar px-4 py-1 text-base font-semibold text-sidebar-fg tabular-nums">{year}</span>
                  <span className="text-sm font-medium text-text-muted">{plural(items.length, "achievement")}</span>
                </h2>
                {/* The rail: on the left from md, in the centre with cards alternating sides from lg. Phones get full-width cards. */}
                <ol className="relative flex flex-col gap-4 md:gap-5 md:before:absolute md:before:top-2 md:before:bottom-2 md:before:left-6 md:before:w-0.5 md:before:bg-border lg:before:left-1/2 lg:before:-translate-x-1/2" data-reveal-stagger>
                  {items.map((item, index) => (
                    <AchievementEntry key={item.id} item={item} side={(offset + index) % 2 === 0 ? "left" : "right"} onEdit={() => setEditing(item)} onDelete={() => setDeleting(item)} />
                  ))}
                </ol>
              </section>
            );
          })}
        </div>
      )}

      {editing ? <AchievementDialog item={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}

      <ConfirmationDialog
        open={deleting !== null}
        title="Delete this achievement?"
        description={deleting ? `“${deleting.title}”${deleting.files.length ? ` and ${plural(deleting.files.length, "file")}` : ""} will be removed. This can't be undone.` : undefined}
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function AchievementEntry({ item, side, onEdit, onDelete }: { item: AchievementItem; side: "left" | "right"; onEdit: () => void; onDelete: () => void }) {
  const done = item.status === "Completed";
  const days = durationDays(item.startDate, item.endDate);
  const facts = [
    item.startDate ? { label: "Started", value: fmtDay(item.startDate) } : null,
    item.endDate ? { label: done ? "Finished" : "Due", value: fmtDay(item.endDate) } : null,
    days ? { label: "Duration", value: plural(days, "day") } : null,
    item.assignedBy ? { label: "Assigned by", value: item.assignedBy } : null,
  ].filter((fact): fact is { label: string; value: string } => fact !== null);

  return (
    <li className="relative grid md:grid-cols-[3rem_minmax(0,1fr)] md:gap-5 lg:grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)] lg:gap-6">
      <span
        aria-hidden="true"
        className={cn(
          "relative z-10 mt-4 hidden size-12 place-items-center rounded-full border-2 bg-surface md:grid lg:col-start-2 lg:row-start-1",
          done ? "border-warning text-warning" : "border-dashed border-border-strong text-text-muted",
        )}
      >
        <Award className="size-6" />
      </span>

      <article className={cn("group min-w-0 overflow-hidden rounded-2xl border border-border bg-surface shadow-xs transition-[border-color,box-shadow] duration-150 hover:border-border-strong hover:shadow-sm lg:row-start-1", side === "left" ? "lg:col-start-1" : "lg:col-start-3")}>
        <div className="flex items-start gap-3 px-5 pt-4 pb-3 md:px-6">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs font-bold tracking-[0.08em] uppercase">
              <span className="text-accent-text">{item.type}</span>
              <span className="text-border-strong" aria-hidden="true">/</span>
              <span className={cn("inline-flex items-center gap-1", done ? "text-success" : "text-warning")}>
                {done ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : <CircleDashed className="size-3.5" aria-hidden="true" />}
                {done ? "Completed" : "In progress"}
              </span>
            </p>
            <h3 className="mt-1.5 text-lg font-semibold tracking-[-0.01em] text-balance text-text md:text-xl">{item.title}</h3>
            {item.description ? <MarkdownContent value={item.description} className="mt-1.5 max-w-[65ch] text-md text-text-muted" /> : null}
          </div>
          {/* Always visible on touch; on desktop they surface with hover/focus. */}
          <div className="-mr-2 flex shrink-0 items-center gap-0.5 lg:opacity-0 lg:transition-opacity lg:duration-150 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
            <Button variant="ghost" size="sm" iconOnly className="text-text" aria-label={`Edit ${item.title}`} title="Edit" onClick={onEdit}><Pencil aria-hidden="true" /></Button>
            <Button variant="ghost" size="sm" iconOnly className="text-text" aria-label={`Delete ${item.title}`} title="Delete" onClick={onDelete}><Trash2 aria-hidden="true" /></Button>
          </div>
        </div>

        {facts.length > 0 ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border px-5 py-3 md:flex md:flex-wrap md:gap-x-10 md:px-6">
            {facts.map((fact) => (
              <div key={fact.label} className="min-w-0">
                <dt className="text-2xs font-bold tracking-[0.08em] text-text-muted uppercase">{fact.label}</dt>
                <dd className="mt-0.5 truncate text-sm font-semibold text-text tabular-nums">{fact.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {item.files.length > 0 ? (
          <ul className="flex flex-col divide-y divide-border border-t border-border bg-surface">
            {item.files.map((file) => (
              <li key={file.id}>
                <a href={fileHref(file.id)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-2 md:px-6">
                  <FileText className="size-4 shrink-0 text-danger" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-text">{file.name}</span>
                    <span className="block text-xs text-text-muted">{formatBytes(file.size)}</span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-accent-text">
                    <span className="hidden md:inline">View certificate</span>
                    <span className="md:hidden">View</span>
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </article>
    </li>
  );
}

function AchievementDialog({ item, onClose }: { item: AchievementItem | null; onClose: () => void }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(item ? { ...item, assignedBy: item.assignedBy ?? "" } : EMPTY);
  const [files, setFiles] = useState<AchievementFileItem[]>(item?.files ?? []);
  const [staged, setStaged] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [saving, startSaving] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const days = durationDays(draft.startDate, draft.endDate);
  const types = TYPES.includes(draft.type) ? TYPES : [draft.type, ...TYPES];

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  };

  function stage(list: FileList | null) {
    const picked = Array.from(list ?? []);
    const tooBig = picked.find((file) => file.size > MAX_BYTES);
    if (tooBig) toast.error(`“${tooBig.name}” is larger than 10 MB`);
    setStaged((current) => [...current, ...picked.filter((file) => file.size <= MAX_BYTES)].slice(0, 10));
    if (fileRef.current) fileRef.current.value = "";
  }

  async function removeSaved(file: AchievementFileItem) {
    setRemovingId(file.id);
    const result = await deleteAchievementFile({ fileId: file.id });
    setRemovingId(null);
    if (!result.ok) { toast.error(result.error.message); return; }
    setFiles((current) => current.filter((entry) => entry.id !== file.id));
    router.refresh();
  }

  function save() {
    setFormError(undefined);
    startSaving(async () => {
      const data = { ...draft, assignedBy: draft.assignedBy, startDate: draft.startDate || null, endDate: draft.endDate || null };
      const result = item ? await updateAchievement({ achievementId: item.id, data }) : await createAchievement(data);
      if (!result.ok) {
        setErrors(result.error.fields ?? {});
        if (!result.error.fields) setFormError(result.error.message);
        return;
      }

      if (staged.length > 0) {
        const form = new FormData();
        staged.forEach((file) => form.append("files", file));
        try {
          const response = await fetch(`/api/achievements/${result.data.id}/files`, { method: "POST", body: form });
          if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            toast.error(`Saved, but the upload failed: ${body.error ?? "try again"}`);
          }
        } catch {
          toast.error("Saved, but the upload failed — check your connection");
        }
      }

      toast.success(item ? "Achievement updated" : "Achievement added");
      router.refresh();
      onClose();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      eyebrow="Achievements"
      title={item ? "Edit achievement" : "Add achievement"}
      footer={
        <>
          <Button variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={save}>{item ? "Save changes" : "Add achievement"}</Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); save(); }}>
        <FormError>{formError}</FormError>
        <Field label="Title" htmlFor="achievement-title" required error={errors.title}>
          <Input id="achievement-title" value={draft.title} maxLength={160} placeholder="e.g. AWS Cloud Practitioner Certification" aria-invalid={errors.title ? true : undefined} onChange={(event) => set("title", event.target.value)} autoFocus />
        </Field>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Type" htmlFor="achievement-type">
            <Select id="achievement-type" value={draft.type} onChange={(event) => set("type", event.target.value)}>
              {types.map((type) => <option key={type} value={type}>{type}</option>)}
            </Select>
          </Field>
          <Field label="Status" htmlFor="achievement-status">
            <Select id="achievement-status" value={draft.status} onChange={(event) => set("status", event.target.value as Draft["status"])}>
              <option value="Completed">Completed</option>
              <option value="InProgress">In progress</option>
            </Select>
          </Field>
          <Field label="Start date" htmlFor="achievement-start" error={errors.startDate}>
            <Input id="achievement-start" type="date" value={draft.startDate} onChange={(event) => set("startDate", event.target.value)} />
          </Field>
          <Field label="End date" htmlFor="achievement-end" error={errors.endDate} hint={days ? `Duration: ${days} ${days === 1 ? "day" : "days"}` : undefined}>
            <Input id="achievement-end" type="date" value={draft.endDate} aria-invalid={errors.endDate ? true : undefined} onChange={(event) => set("endDate", event.target.value)} />
          </Field>
        </div>

        <Field label="Assigned by" htmlFor="achievement-assigned" hint="Optional — e.g. your manager, if it was a goal.">
          <Input id="achievement-assigned" value={draft.assignedBy} maxLength={80} onChange={(event) => set("assignedBy", event.target.value)} />
        </Field>

        <Field label="Description" htmlFor="achievement-description" error={errors.description}>
          <MarkdownEditor id="achievement-description" ariaLabel="Description" value={draft.description} onChange={(value) => set("description", value.slice(0, 5000))} placeholder="What it covered — links, images and files welcome." minHeight="min-h-24" />
        </Field>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-text">Files</span>
          {files.length > 0 || staged.length > 0 ? (
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
              {files.map((file) => (
                <FileRow key={file.id} name={file.name} meta={formatBytes(file.size)} href={fileHref(file.id)} busy={removingId === file.id} onRemove={() => void removeSaved(file)} />
              ))}
              {staged.map((file, index) => (
                <FileRow key={`${file.name}-${index}`} name={file.name} meta={`${formatBytes(file.size)} · uploads when you save`} onRemove={() => setStaged((current) => current.filter((_, i) => i !== index))} />
              ))}
            </ul>
          ) : null}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={cn("flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-strong/50 bg-surface px-4 py-4 text-sm font-semibold text-text transition-colors duration-150 hover:border-primary")}
          >
            <UploadCloud className="size-4 text-accent-text" aria-hidden="true" />
            Attach certificate
            <span className="font-normal text-text-muted">· PDF or image, up to 10 MB</span>
          </button>
          <input ref={fileRef} type="file" multiple accept=".pdf,image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(event) => stage(event.target.files)} />
        </div>
      </form>
    </Modal>
  );
}

function FileRow({ name, meta, href, busy, onRemove }: { name: string; meta: string; href?: string; busy?: boolean; onRemove: () => void }) {
  return (
    <li className="flex items-center gap-2.5 px-3 py-2">
      <Paperclip className="size-4 shrink-0 text-accent-text" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-semibold text-text hover:text-accent-text">{name}</a>
        ) : (
          <span className="block truncate text-sm font-semibold text-text">{name}</span>
        )}
        <span className="block truncate text-xs text-text-muted">{meta}</span>
      </div>
      <Button variant="ghost" size="sm" iconOnly className="text-text" aria-label={`Remove ${name}`} title={`Remove ${name}`} disabled={busy} onClick={onRemove}>
        {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <X aria-hidden="true" />}
      </Button>
    </li>
  );
}

"use client";

import { ExternalLink, FileText, Link2, Loader2, Trash2, UploadCloud } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

import { addWorkLogLink, deleteWorkLogAttachment } from "@/actions/worklog";
import { cn } from "@/components/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { attachmentHref, formatBytes } from "@/components/work-log/attachment-utils";
import type { EditorAttachment } from "@/components/work-log/types";

const MAX_BYTES = 10 * 1024 * 1024;

/** Upload files (drag-and-drop or browse) and add links to a work log. */
export function AttachmentsSection({ workLogId, initial, onCountChange }: { workLogId: string; initial: EditorAttachment[]; onCountChange?: (count: number) => void }) {
  const [items, setItems] = useState(initial);
  useEffect(() => onCountChange?.(items.length), [items.length, onCountChange]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [linkError, setLinkError] = useState("");
  const [addingLink, startAddLink] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(list: FileList | File[]) {
    const files = Array.from(list);
    if (files.length === 0) return;
    const tooBig = files.find((file) => file.size > MAX_BYTES);
    if (tooBig) { toast.error(`“${tooBig.name}” is larger than 10 MB`); return; }
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    setUploading(true);
    try {
      const response = await fetch(`/api/work-logs/${workLogId}/attachments`, { method: "POST", body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { toast.error(body.error ?? "Upload failed"); return; }
      const created = (body.attachments as EditorAttachment[]).map((item) => ({ ...item, createdAt: new Date(item.createdAt) }));
      setItems((current) => [...current, ...created]);
      toast.success(created.length === 1 ? "File uploaded" : `${created.length} files uploaded`);
    } catch {
      toast.error("Upload failed — check your connection");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function addLink() {
    setLinkError("");
    startAddLink(async () => {
      const result = await addWorkLogLink({ workLogId, url: url.trim(), label: label.trim() || undefined });
      if (!result.ok) { setLinkError(result.error.message); return; }
      setItems((current) => [...current, { ...result.data, createdAt: new Date(result.data.createdAt) }]);
      setUrl("");
      setLabel("");
      toast.success("Link added");
    });
  }

  async function remove(item: EditorAttachment) {
    setRemovingId(item.id);
    const result = await deleteWorkLogAttachment({ attachmentId: item.id });
    setRemovingId(null);
    if (!result.ok) { toast.error(result.error.message); return; }
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    toast.success(item.kind === "Link" ? "Link removed" : "File removed");
  }

  return (
    <section aria-labelledby="attachments-heading" className="wl-card flex flex-col gap-3 p-4 md:p-5">
      <h2 id="attachments-heading" className="flex items-center gap-2 text-base font-semibold text-text">
        Attachments &amp; links
        {items.length > 0 ? <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-accent-text tabular-nums">{items.length}</span> : null}
      </h2>

      {/* The whole drop zone is the browse button too. */}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); void upload(event.dataTransfer.files); }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors duration-150 disabled:cursor-wait",
          dragging ? "border-primary bg-primary-subtle" : "border-border-strong/50 bg-surface hover:border-primary",
        )}
      >
        {uploading ? <Loader2 className="size-5 animate-spin text-accent-text" aria-hidden="true" /> : <UploadCloud className="size-5 text-accent-text" aria-hidden="true" />}
        <span className="text-sm font-semibold text-text">{uploading ? "Uploading…" : "Drop files or browse"}</span>
        <span className="text-xs text-text-muted">Screenshots, docs, PDFs · up to 10 MB</span>
      </button>
      <input ref={fileRef} type="file" multiple className="sr-only" id="attachment-files" tabIndex={-1} aria-hidden="true" onChange={(event) => event.target.files && void upload(event.target.files)} />

      <label htmlFor="attachment-url" className="sr-only">Link URL</label>
      <Input id="attachment-url" type="url" inputMode="url" value={url} placeholder="Paste a link — PR, Jira, course" aria-invalid={linkError ? true : undefined} onChange={(event) => { setUrl(event.target.value); setLinkError(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addLink(); } }} />
      <div className="flex items-center gap-2">
        <label htmlFor="attachment-label" className="sr-only">Link label (optional)</label>
        <Input id="attachment-label" value={label} maxLength={160} placeholder="Label (optional)" className="min-w-0 flex-1" onChange={(event) => setLabel(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addLink(); } }} />
        <Button className="shrink-0" loading={addingLink} disabled={!url.trim()} onClick={addLink}>Add</Button>
      </div>
      {linkError ? <p className="text-xs font-medium text-danger" role="alert">{linkError}</p> : null}

      {items.length > 0 ? (
        <ul className="-mx-1 mt-1 flex flex-col divide-y divide-border border-t border-border pt-1">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2.5 px-1 py-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface text-accent-text" aria-hidden="true">
                {item.kind === "Link" ? <Link2 className="size-4" /> : <FileText className="size-4" />}
              </span>
              <a href={attachmentHref(item)} target="_blank" rel="noopener noreferrer" className="group min-w-0 flex-1">
                <span className="flex items-center gap-1 text-sm font-semibold text-text group-hover:text-accent-text">
                  <span className="truncate">{item.name}</span>
                  <ExternalLink className="size-3 shrink-0 opacity-60" aria-hidden="true" />
                </span>
                <span className="block truncate text-xs text-text-muted">{item.kind === "Link" ? item.url : formatBytes(item.size)}</span>
              </a>
              <Button variant="ghost" size="sm" iconOnly aria-label={`Remove ${item.name}`} title={`Remove ${item.name}`} disabled={removingId === item.id} onClick={() => void remove(item)}>
                {removingId === item.id ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

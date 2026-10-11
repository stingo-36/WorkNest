import type { EditorAttachment } from "@/components/work-log/types";

/** Plain helpers (no "use client") so server components can call them too. */
export function formatBytes(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Where an attachment opens: the stored file, or the external link. */
export function attachmentHref(item: Pick<EditorAttachment, "id" | "kind" | "url">) {
  return item.kind === "Link" ? item.url ?? "#" : `/api/attachments/${item.id}`;
}

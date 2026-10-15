"use client";

import type { Editor, JSONContent } from "@tiptap/core";
import { mergeAttributes, Node } from "@tiptap/core";

import { MAX_TRACKER_FILE_BYTES, TRACKER_FILE_PATH } from "@/lib/rich-text";

/**
 * Images and file uploads for every TipTap editor in the app (Tracker updates,
 * Work Log / Ticket Markdown fields, Resource and Achievement descriptions).
 * Files go to `/api/tracker-files` (Postgres, ≤4 MB, owner-only); images render
 * only from there.
 */

/** Images only from our own uploads — pasted web images (tracking pixels, hotlinks) are dropped. */
export const TrackerImage = Node.create({
  name: "image",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { src: { default: null }, alt: { default: null } };
  },
  parseHTML() {
    return [{
      tag: "img[src]",
      getAttrs: (element) => {
        const src = (element as HTMLElement).getAttribute("src") ?? "";
        return src.startsWith(TRACKER_FILE_PATH) ? { src, alt: (element as HTMLElement).getAttribute("alt") } : false;
      },
    }];
  },
  renderHTML({ HTMLAttributes }) {
    const src = String(HTMLAttributes.src ?? "");
    return ["img", mergeAttributes(HTMLAttributes, { src: src.startsWith(TRACKER_FILE_PATH) ? src : "", loading: "lazy" })];
  },
});

export type Uploaded = { id: string; name: string; mimeType: string; url: string };

export async function uploadFiles(files: File[]): Promise<Uploaded[]> {
  const tooBig = files.find((file) => file.size > MAX_TRACKER_FILE_BYTES);
  if (tooBig) throw new Error(`“${tooBig.name}” is larger than 4 MB`);
  const form = new FormData();
  for (const file of files.slice(0, 5)) form.append("files", file);
  const response = await fetch("/api/tracker-files", { method: "POST", body: form });
  const body = (await response.json().catch(() => ({}))) as { files?: Uploaded[]; error?: string };
  if (!response.ok || !body.files) throw new Error(body.error ?? "Upload failed");
  return body.files;
}

const INLINE_IMAGE = /^image\/(png|jpe?g|gif|webp)$/;

export function insertUploads(editor: Editor, uploaded: Uploaded[]) {
  const content: JSONContent[] = uploaded.map((file) =>
    INLINE_IMAGE.test(file.mimeType)
      ? { type: "image", attrs: { src: file.url, alt: file.name } }
      : { type: "paragraph", content: [{ type: "text", text: `📎 ${file.name}`, marks: [{ type: "link", attrs: { href: file.url } }] }] },
  );
  editor.chain().focus().insertContent(content).run();
}


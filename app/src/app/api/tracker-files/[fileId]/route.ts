import { getTrackerFile } from "@/lib/follow-ups";
import { getCurrentUser } from "@/lib/session";

/**
 * Serve one Tracker upload. Only the owner can read it. Same safety rules as
 * work-log attachments: only types that can't run script are shown inline
 * (images except SVG, PDF, plain text); everything else downloads, with nosniff.
 */
const INLINE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf", "text/plain"]);

export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Not signed in", { status: 401 });

  const { fileId } = await params;
  const file = await getTrackerFile(user.id, fileId);
  if (!file) return new Response("Not found", { status: 404 });

  const inline = INLINE_TYPES.has(file.mimeType);
  const safeName = file.name.replace(/["\\\r\n]/g, "_");
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": inline ? file.mimeType : "application/octet-stream",
      "Content-Length": String(file.data.byteLength),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

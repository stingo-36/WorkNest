import { addTrackerFiles } from "@/lib/follow-ups";
import { MAX_TRACKER_FILE_BYTES } from "@/lib/rich-text";
import { getCurrentUser } from "@/lib/session";

/**
 * Upload images/files while writing a Tracker update (multipart, field "files").
 * A route handler rather than a server action: actions cap bodies at 1 MB.
 * Stored in Postgres, ≤4 MB each (Vercel functions take ~4.5 MB per request),
 * ≤5 per request. They join an entry when the update that uses them is saved.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected a file upload" }, { status: 400 });
  }

  const files = form.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);
  if (files.length === 0) return Response.json({ error: "Choose at least one file" }, { status: 400 });
  if (files.length > 5) return Response.json({ error: "Upload at most 5 files at a time" }, { status: 400 });
  const tooBig = files.find((file) => file.size > MAX_TRACKER_FILE_BYTES);
  if (tooBig) return Response.json({ error: `“${tooBig.name}” is larger than 4 MB` }, { status: 413 });

  const created = await addTrackerFiles(
    user.id,
    await Promise.all(
      files.map(async (file) => ({
        name: file.name.slice(0, 255) || "file",
        mimeType: file.type || "application/octet-stream",
        bytes: new Uint8Array(await file.arrayBuffer()),
      })),
    ),
  );
  return Response.json({ files: created.map((file) => ({ ...file, url: `/api/tracker-files/${file.id}` })) });
}

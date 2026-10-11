import { revalidatePath } from "next/cache";

import { addAchievementFiles, MAX_ACHIEVEMENT_FILE_BYTES } from "@/lib/achievements";
import { getCurrentUser } from "@/lib/session";

/**
 * Upload certificates to an achievement (multipart form, field name "files").
 * A route handler rather than a server action: actions cap bodies at 1 MB.
 * Files are stored in Postgres (≤10 MB each, ≤10 per request).
 */
export async function POST(request: Request, { params }: { params: Promise<{ achievementId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const { achievementId } = await params;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected a file upload" }, { status: 400 });
  }

  const files = form.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);
  if (files.length === 0) return Response.json({ error: "Choose at least one file" }, { status: 400 });
  if (files.length > 10) return Response.json({ error: "Upload at most 10 files at a time" }, { status: 400 });
  const tooBig = files.find((file) => file.size > MAX_ACHIEVEMENT_FILE_BYTES);
  if (tooBig) return Response.json({ error: `“${tooBig.name}” is larger than 10 MB` }, { status: 413 });

  const prepared = await Promise.all(
    files.map(async (file) => ({
      name: file.name.slice(0, 255) || "file",
      mimeType: file.type || "application/octet-stream",
      bytes: new Uint8Array(await file.arrayBuffer()),
    })),
  );

  const created = await addAchievementFiles(user.id, achievementId, prepared);
  if (!created) return Response.json({ error: "Achievement not found" }, { status: 404 });

  revalidatePath("/achievements");
  return Response.json({ files: created });
}

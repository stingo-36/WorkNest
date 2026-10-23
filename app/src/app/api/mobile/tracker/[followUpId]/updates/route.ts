import { revalidatePath } from "next/cache";

import { addFollowUpUpdate } from "@/lib/follow-ups";
import { getMobileEntry, mobileJson, preflight, verifyMobileToken } from "@/lib/mobile-api";
import { zodFields } from "@/lib/result";
import { addFollowUpUpdateSchema } from "@/lib/validation";

/**
 * Add to an entry's history from the phone: "I followed up" / "they replied" on
 * a follow-up, or a note on a to-do or note. Same rules as the Tracker's own form.
 */
export async function POST(request: Request, { params }: { params: Promise<{ followUpId: string }> }) {
  const userId = await verifyMobileToken(request);
  if (!userId) return mobileJson({ error: "unauthorized" }, 401);

  const body = await request.json().catch(() => ({}));
  const parsed = addFollowUpUpdateSchema.safeParse({ ...body, followUpId: (await params).followUpId });
  if (!parsed.success) {
    const fields = zodFields(parsed.error);
    return mobileJson({ error: Object.values(fields)[0] ?? "Check the details and try again", fields }, 400);
  }

  const { followUpId, ...update } = parsed.data;
  if (!(await addFollowUpUpdate(userId, followUpId, update))) return mobileJson({ error: "Not found" }, 404);

  revalidatePath("/tracker");
  return mobileJson({ entry: await getMobileEntry(userId, followUpId) }, 201);
}

export function OPTIONS() {
  return preflight();
}

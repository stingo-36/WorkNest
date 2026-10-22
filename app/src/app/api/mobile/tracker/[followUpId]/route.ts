import { revalidatePath } from "next/cache";

import { FollowUpStatus } from "@/generated/prisma/enums";
import { editPersonalTodo, setFollowUpStatus } from "@/lib/follow-ups";
import { listMobileTracker, mobileJson, preflight, verifyMobileToken } from "@/lib/mobile-api";
import { idSchema, mobileTrackerPatchSchema } from "@/lib/validation";

/** Tick/untick an entry, or rewrite a personal sticky note, from the phone. */
export async function PATCH(request: Request, { params }: { params: Promise<{ followUpId: string }> }) {
  const userId = await verifyMobileToken(request);
  if (!userId) return mobileJson({ error: "unauthorized" }, 401);

  const id = idSchema.safeParse((await params).followUpId);
  const parsed = mobileTrackerPatchSchema.safeParse(await request.json().catch(() => ({})));
  if (!id.success || !parsed.success) return mobileJson({ error: "Send a status or a subject" }, 400);

  const changed = parsed.data.status
    ? await setFollowUpStatus(userId, id.data, parsed.data.status as FollowUpStatus)
    : await editPersonalTodo(userId, id.data, parsed.data.subject!);
  if (!changed) return mobileJson({ error: "Not found" }, 404);

  revalidatePath("/tracker");
  return mobileJson({ entries: await listMobileTracker(userId) });
}

export function OPTIONS() {
  return preflight();
}

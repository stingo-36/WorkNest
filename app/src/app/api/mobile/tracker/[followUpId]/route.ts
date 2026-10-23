import { revalidatePath } from "next/cache";

import { FollowUpStatus } from "@/generated/prisma/enums";
import { editPersonalTodo, rescheduleFollowUp, setFollowUpPinned, setFollowUpStatus } from "@/lib/follow-ups";
import { getMobileEntry, listMobileTracker, mobileJson, preflight, verifyMobileToken } from "@/lib/mobile-api";
import { followUpDueDateSchema, idSchema, mobileTrackerPatchSchema } from "@/lib/validation";

/** One entry with its whole history, for the phone's detail page. */
export async function GET(request: Request, { params }: { params: Promise<{ followUpId: string }> }) {
  const userId = await verifyMobileToken(request);
  if (!userId) return mobileJson({ error: "unauthorized" }, 401);
  const id = idSchema.safeParse((await params).followUpId);
  const entry = id.success ? await getMobileEntry(userId, id.data) : null;
  return entry ? mobileJson({ entry }) : mobileJson({ error: "Not found" }, 404);
}

/** One change from the phone: tick/untick, a sticky note's text, star/unstar, or the due date. */
export async function PATCH(request: Request, { params }: { params: Promise<{ followUpId: string }> }) {
  const userId = await verifyMobileToken(request);
  if (!userId) return mobileJson({ error: "unauthorized" }, 401);

  const id = idSchema.safeParse((await params).followUpId);
  const parsed = mobileTrackerPatchSchema.safeParse(await request.json().catch(() => ({})));
  if (!id.success || !parsed.success) return mobileJson({ error: "Send one change: a status, a subject, pinned or a due date" }, 400);

  const change = parsed.data;
  const changed =
    change.status !== undefined ? await setFollowUpStatus(userId, id.data, change.status as FollowUpStatus)
    : change.subject !== undefined ? await editPersonalTodo(userId, id.data, change.subject)
    : change.pinned !== undefined ? await setFollowUpPinned(userId, id.data, change.pinned)
    : await rescheduleFollowUp(userId, id.data, followUpDueDateSchema.parse(change.dueDate));
  if (!changed) return mobileJson({ error: "Not found" }, 404);

  revalidatePath("/tracker");
  return mobileJson({ entries: await listMobileTracker(userId) });
}

export function OPTIONS() {
  return preflight();
}

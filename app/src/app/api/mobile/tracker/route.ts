import { revalidatePath } from "next/cache";

import { createFollowUp, setFollowUpPinned } from "@/lib/follow-ups";
import { listMobileOptions, listMobileTracker, mobileJson, preflight, verifyMobileToken } from "@/lib/mobile-api";
import { zodFields } from "@/lib/result";
import { createFollowUpSchema } from "@/lib/validation";

/** The phone's Tracker: open to-dos (work and personal), follow-ups and notes, plus what its add forms offer. */
export async function GET(request: Request) {
  const userId = await verifyMobileToken(request);
  if (!userId) return mobileJson({ error: "unauthorized" }, 401);
  try {
    const [entries, options] = await Promise.all([listMobileTracker(userId), listMobileOptions(userId)]);
    return mobileJson({ entries, options });
  } catch {
    return mobileJson({ error: "Couldn't load your Tracker. Try again shortly." }, 503);
  }
}

/** Add an entry from the phone. Same fields and rules as the Tracker's own add forms, plus an optional star. */
export async function POST(request: Request) {
  const userId = await verifyMobileToken(request);
  if (!userId) return mobileJson({ error: "unauthorized" }, 401);

  const body = await request.json().catch(() => ({}));
  const parsed = createFollowUpSchema.safeParse(body);
  if (!parsed.success) {
    const fields = zodFields(parsed.error);
    return mobileJson({ error: Object.values(fields)[0] ?? "Check the details and try again", fields }, 400);
  }

  const created = await createFollowUp(userId, parsed.data);
  // The Tracker's add forms star an entry as a second step; the phone sends `pinned` with the entry.
  if (body?.pinned === true) await setFollowUpPinned(userId, created.id, true);
  revalidatePath("/tracker");
  return mobileJson({ id: created.id, entries: await listMobileTracker(userId) }, 201);
}

export function OPTIONS() {
  return preflight();
}

import { revalidatePath } from "next/cache";

import { createFollowUp } from "@/lib/follow-ups";
import { listMobileTracker, mobileJson, preflight, verifyMobileToken } from "@/lib/mobile-api";
import { zodFields } from "@/lib/result";
import { createFollowUpSchema } from "@/lib/validation";

/** The phone's Tracker: open to-dos (work and personal), follow-ups and notes. */
export async function GET(request: Request) {
  const userId = await verifyMobileToken(request);
  if (!userId) return mobileJson({ error: "unauthorized" }, 401);
  try {
    return mobileJson({ entries: await listMobileTracker(userId) });
  } catch {
    return mobileJson({ error: "Couldn't load your Tracker. Try again shortly." }, 503);
  }
}

/** Add an entry from the phone. Same rules as the Tracker's own add box. */
export async function POST(request: Request) {
  const userId = await verifyMobileToken(request);
  if (!userId) return mobileJson({ error: "unauthorized" }, 401);

  const parsed = createFollowUpSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    const fields = zodFields(parsed.error);
    return mobileJson({ error: Object.values(fields)[0] ?? "Check the details and try again", fields }, 400);
  }

  const created = await createFollowUp(userId, parsed.data);
  revalidatePath("/tracker");
  return mobileJson({ id: created.id, entries: await listMobileTracker(userId) }, 201);
}

export function OPTIONS() {
  return preflight();
}

import { revalidatePath } from "next/cache";

import { createResource } from "@/lib/content";
import { listMobileResources, mobileJson, preflight, verifyMobileToken } from "@/lib/mobile-api";
import { zodFields } from "@/lib/result";
import { createResourceSchema } from "@/lib/validation";

/** The phone's Resources tab: the library, newest first, and the user's resource types. */
export async function GET(request: Request) {
  const userId = await verifyMobileToken(request);
  if (!userId) return mobileJson({ error: "unauthorized" }, 401);
  try {
    return mobileJson(await listMobileResources(userId));
  } catch {
    return mobileJson({ error: "Couldn't load your resources. Try again shortly." }, 503);
  }
}

/** Save a resource from the phone (e.g. one built from a shared reel). Same rules as the Resources page. */
export async function POST(request: Request) {
  const userId = await verifyMobileToken(request);
  if (!userId) return mobileJson({ error: "unauthorized" }, 401);

  const parsed = createResourceSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    const fields = zodFields(parsed.error);
    return mobileJson({ error: Object.values(fields)[0] ?? "Check the details and try again", fields }, 400);
  }

  const created = await createResource(userId, parsed.data);
  revalidatePath("/resources");
  return mobileJson({ id: created.id, ...(await listMobileResources(userId)) }, 201);
}

export function OPTIONS() {
  return preflight();
}

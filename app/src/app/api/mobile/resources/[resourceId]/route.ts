import { revalidatePath } from "next/cache";

import { listMobileResources, mobileJson, preflight, verifyMobileToken } from "@/lib/mobile-api";
import { prisma } from "@/lib/prisma";
import { toggleResourceFavoriteSchema } from "@/lib/validation";

/** Star / unstar a resource from the phone; starred ones show on the Favourites page. */
export async function PATCH(request: Request, { params }: { params: Promise<{ resourceId: string }> }) {
  const userId = await verifyMobileToken(request);
  if (!userId) return mobileJson({ error: "unauthorized" }, 401);

  const body = await request.json().catch(() => ({}));
  const parsed = toggleResourceFavoriteSchema.safeParse({ resourceId: (await params).resourceId, favorite: body?.favorite });
  if (!parsed.success) return mobileJson({ error: "Send favorite: true or false" }, 400);

  const result = await prisma.resource.updateMany({ where: { id: parsed.data.resourceId, userId }, data: { favorite: parsed.data.favorite } });
  if (result.count === 0) return mobileJson({ error: "Not found" }, 404);

  revalidatePath("/resources");
  revalidatePath("/favourites");
  return mobileJson(await listMobileResources(userId));
}

export function OPTIONS() {
  return preflight();
}

import "server-only";

import { hashPassword, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, type ActionResult } from "@/lib/result";

/**
 * Change the signed-in user's password after verifying the current one.
 * Incrementing authVersion signs every existing JWT out on its next request,
 * including the browser that submitted this change.
 */
export async function changeUserPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<ActionResult<{ changed: true }>> {
  const account = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });

  if (!account?.passwordHash) {
    return fail("CONFLICT", "Password sign-in is not configured for this account");
  }
  if (!(await verifyPassword(currentPassword, account.passwordHash))) {
    return fail("UNAUTHORIZED", "The current password is incorrect", {
      currentPassword: "The current password is incorrect",
    });
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(newPassword),
      authVersion: { increment: 1 },
    },
  });
  return ok({ changed: true });
}

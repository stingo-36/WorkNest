"use server";

import { revalidatePath } from "next/cache";

import {
  deleteAccount,
  deleteAccountRecords,
  requireAdmin,
  resetAccountPassword,
} from "@/lib/admin";
import { parseOrFail } from "@/lib/result";
import {
  adminAccountConfirmationSchema,
  adminResetPasswordSchema,
} from "@/lib/validation";

export async function adminResetPassword(input: unknown) {
  const admin = await requireAdmin();
  const parsed = parseOrFail(adminResetPasswordSchema, input);
  if (!parsed.ok) return parsed;
  const result = await resetAccountPassword(admin.id, parsed.data.userId, parsed.data.newPassword);
  if (result.ok) revalidatePath("/admin");
  return result;
}

export async function adminDeleteRecords(input: unknown) {
  await requireAdmin();
  const parsed = parseOrFail(adminAccountConfirmationSchema, input);
  if (!parsed.ok) return parsed;
  const result = await deleteAccountRecords(parsed.data.userId, parsed.data.confirmationEmail);
  if (result.ok) revalidatePath("/admin");
  return result;
}

export async function adminDeleteAccount(input: unknown) {
  const admin = await requireAdmin();
  const parsed = parseOrFail(adminAccountConfirmationSchema, input);
  if (!parsed.ok) return parsed;
  const result = await deleteAccount(admin.id, parsed.data.userId, parsed.data.confirmationEmail);
  if (result.ok) revalidatePath("/admin");
  return result;
}

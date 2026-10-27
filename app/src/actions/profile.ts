"use server";

import { revalidatePath } from "next/cache";

import { checkGroqKey, checkOpenRouterKey, clearGroqKey, clearOpenRouterKey, getAiSettings, saveGroqKey, saveOpenRouterKey, saveOpenRouterModel } from "@/lib/ai-settings";
import { changeUserPassword } from "@/lib/account-security";
import { prisma } from "@/lib/prisma";
import { fail, ok, parseOrFail } from "@/lib/result";
import { requireUserId } from "@/lib/session";
import { changePasswordSchema, saveGroqKeySchema, saveOpenRouterKeySchema, saveOpenRouterModelSchema, updateProfileSchema } from "@/lib/validation";

/** Profile settings: name, sprint calendar, and whether tickets are used. */
export async function updateProfile(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(updateProfileSchema, input);
  if (!parsed.ok) return parsed;

  const { name, sprintStartDate, sprintLengthDays, ticketsEnabled } = parsed.data;
  await prisma.user.update({
    where: { id: userId },
    data: {
      name: name || null,
      sprintStartDate: sprintStartDate ? new Date(`${sprintStartDate}T00:00:00.000Z`) : null,
      sprintLengthDays,
      ticketsEnabled,
    },
  });

  // Nav, sprint calendars and ticket sections all read these settings.
  revalidatePath("/", "layout");
  return ok({ saved: true });
}

/** Change the signed-in user's password and invalidate all of their sessions. */
export async function changePassword(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(changePasswordSchema, input);
  if (!parsed.ok) return parsed;
  return changeUserPassword(
    userId,
    parsed.data.currentPassword,
    parsed.data.newPassword,
  );
}

/** Store the user's OpenRouter key (encrypted) after OpenRouter confirms it. Input: { apiKey } */
export async function saveAiKey(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(saveOpenRouterKeySchema, input);
  if (!parsed.ok) return parsed;
  if ((await checkOpenRouterKey(parsed.data.apiKey)) === "invalid") {
    return fail("VALIDATION_ERROR", "OpenRouter rejected that key", { apiKey: "OpenRouter rejected that key" });
  }
  await saveOpenRouterKey(userId, parsed.data.apiKey);
  revalidatePath("/profile");
  return ok(await getAiSettings(userId));
}

export async function removeAiKey() {
  const userId = await requireUserId();
  await clearOpenRouterKey(userId);
  revalidatePath("/profile");
  return ok(await getAiSettings(userId));
}

/** Store the user's Groq key (the backup AI, encrypted) after Groq confirms it. Input: { apiKey } */
export async function saveAiGroqKey(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(saveGroqKeySchema, input);
  if (!parsed.ok) return parsed;
  if ((await checkGroqKey(parsed.data.apiKey)) === "invalid") {
    return fail("VALIDATION_ERROR", "Groq rejected that key", { apiKey: "Groq rejected that key" });
  }
  await saveGroqKey(userId, parsed.data.apiKey);
  revalidatePath("/profile");
  return ok(await getAiSettings(userId));
}

export async function removeAiGroqKey() {
  const userId = await requireUserId();
  await clearGroqKey(userId);
  revalidatePath("/profile");
  return ok(await getAiSettings(userId));
}

/** Input: { model } — comma-separated ids, "" for the default. */
export async function saveAiModel(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(saveOpenRouterModelSchema, input);
  if (!parsed.ok) return parsed;
  await saveOpenRouterModel(userId, parsed.data.model);
  revalidatePath("/profile");
  return ok(await getAiSettings(userId));
}

"use server";

import { revalidatePath } from "next/cache";

import * as achievements from "@/lib/achievements";
import { notFound, ok, parseOrFail } from "@/lib/result";
import { requireUserId } from "@/lib/session";
import { achievementFileIdSchema, achievementIdSchema, achievementSchema, updateAchievementSchema } from "@/lib/validation";

/** /achievements. Files upload through /api/achievements/[id]/files. */

export async function createAchievement(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(achievementSchema, input);
  if (!parsed.ok) return parsed;

  const achievement = await achievements.createAchievement(userId, parsed.data);
  revalidatePath("/achievements");
  return ok(achievement);
}

export async function updateAchievement(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(updateAchievementSchema, input);
  if (!parsed.ok) return parsed;

  const achievement = await achievements.updateAchievement(userId, parsed.data.achievementId, parsed.data.data);
  if (!achievement) return notFound("Achievement not found");

  revalidatePath("/achievements");
  return ok(achievement);
}

export async function deleteAchievement(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(achievementIdSchema, input);
  if (!parsed.ok) return parsed;

  const removed = await achievements.deleteAchievement(userId, parsed.data.achievementId);
  if (!removed) return notFound("Achievement not found");

  revalidatePath("/achievements");
  return ok({ removed: true });
}

export async function deleteAchievementFile(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(achievementFileIdSchema, input);
  if (!parsed.ok) return parsed;

  const removed = await achievements.deleteAchievementFile(userId, parsed.data.fileId);
  if (!removed) return notFound("File not found");

  revalidatePath("/achievements");
  return ok({ removed: true });
}

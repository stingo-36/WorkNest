import "server-only";

import { prisma } from "@/lib/prisma";
import type { AchievementStatus } from "@/generated/prisma/enums";

/**
 * Achievements — certifications, courses, awards — with their certificate
 * files. Same isolation rule as everywhere: userId in every WHERE, and
 * single-row writes via updateMany/deleteMany on `{ id, userId }`.
 */

export type AchievementInput = {
  title: string;
  type: string;
  status: AchievementStatus;
  assignedBy?: string | null;
  startDate: Date | null;
  endDate: Date | null;
  description: string;
};

/** Never selects `data` — only the download route reads the bytes. */
export const ACHIEVEMENT_FILE_SELECT = { id: true, name: true, mimeType: true, size: true, createdAt: true } as const;

const ACHIEVEMENT_SELECT = {
  id: true,
  title: true,
  type: true,
  status: true,
  assignedBy: true,
  startDate: true,
  endDate: true,
  description: true,
  files: { select: ACHIEVEMENT_FILE_SELECT, orderBy: { createdAt: "asc" } },
} as const;

/** Max bytes per certificate file (stored in Postgres, same cap as work-log uploads). */
export const MAX_ACHIEVEMENT_FILE_BYTES = 10 * 1024 * 1024;

/** Newest first: in-progress ones on top, then by when they finished. */
export async function listAchievements(userId: string) {
  return prisma.achievement.findMany({
    where: { userId },
    select: ACHIEVEMENT_SELECT,
    orderBy: [{ status: "asc" }, { endDate: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
  });
}

export async function createAchievement(userId: string, data: AchievementInput) {
  return prisma.achievement.create({ data: { ...data, userId }, select: ACHIEVEMENT_SELECT });
}

export async function updateAchievement(userId: string, achievementId: string, data: AchievementInput) {
  const result = await prisma.achievement.updateMany({ where: { id: achievementId, userId }, data });
  if (result.count === 0) return null;
  return prisma.achievement.findFirst({ where: { id: achievementId, userId }, select: ACHIEVEMENT_SELECT });
}

export async function deleteAchievement(userId: string, achievementId: string) {
  const result = await prisma.achievement.deleteMany({ where: { id: achievementId, userId } });
  return result.count > 0;
}

export async function addAchievementFiles(
  userId: string,
  achievementId: string,
  files: Array<{ name: string; mimeType: string; bytes: Uint8Array<ArrayBuffer> }>,
) {
  const owned = await prisma.achievement.findFirst({ where: { id: achievementId, userId }, select: { id: true } });
  if (!owned) return null;
  return prisma.$transaction(
    files.map((file) =>
      prisma.achievementFile.create({
        data: { achievementId, userId, name: file.name, mimeType: file.mimeType, size: file.bytes.byteLength, data: file.bytes },
        select: ACHIEVEMENT_FILE_SELECT,
      }),
    ),
  );
}

export async function getAchievementFile(userId: string, fileId: string) {
  return prisma.achievementFile.findFirst({
    where: { id: fileId, userId },
    select: { name: true, mimeType: true, size: true, data: true },
  });
}

export async function deleteAchievementFile(userId: string, fileId: string) {
  const result = await prisma.achievementFile.deleteMany({ where: { id: fileId, userId } });
  return result.count > 0;
}

import "server-only";
import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { DEFAULT_SPRINT, type SprintConfig } from "@/lib/sprint";

export type UserSettings = {
  name: string | null;
  isAdmin: boolean;
  sprint: SprintConfig;
  /** The stored sprint start as "YYYY-MM-DD", or null when using the default. */
  sprintStartKey: string | null;
  ticketsEnabled: boolean;
};

/**
 * The signed-in user's profile settings. Memoised per request — the layout,
 * the nav and the page all read it.
 */
export const getUserSettings = cache(async (userId: string): Promise<UserSettings> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      role: true,
      sprintStartDate: true,
      sprintLengthDays: true,
      ticketsEnabled: true,
    },
  });
  const key = user?.sprintStartDate ? user.sprintStartDate.toISOString().slice(0, 10) : null;
  return {
    name: user?.name ?? null,
    isAdmin: user?.role === "Admin",
    // Stored as a UTC-midnight @db.Date; the sprint maths works in LOCAL days.
    sprint: {
      anchor: key ? new Date(`${key}T00:00:00`) : DEFAULT_SPRINT.anchor,
      days: user?.sprintLengthDays ?? DEFAULT_SPRINT.days,
    },
    sprintStartKey: key,
    ticketsEnabled: user?.ticketsEnabled ?? true,
  };
});

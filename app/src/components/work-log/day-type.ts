/**
 * Client-safe day-type constants. Mirrors the `DayType` enum and the server's
 * DEFAULT_TITLE in lib/worklogs.ts (that module is server-only, so it can't be
 * imported into client components).
 */
export type DayType = "Work" | "Holiday" | "Leave";

export const DAY_LABEL: Record<DayType, string> = {
  Work: "Work day",
  Holiday: "Holiday",
  Leave: "Leave",
};

/** What an empty title becomes (the server's default when none is given). */
export const DEFAULT_TITLE: Record<DayType, string> = {
  Work: "Daily Work Log",
  Holiday: "Holiday",
  Leave: "Leave",
};

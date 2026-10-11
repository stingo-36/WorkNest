import { addDays, differenceInCalendarDays, startOfDay } from "date-fns";

/**
 * The sprint calendar — ONE definition, imported by everything that talks about
 * sprints. The dashboard and the Work Logs page each had their own copy of this
 * arithmetic and immediately disagreed by a day ("1 Sep – 14 Sep" vs
 * "2 Sep – 15 Sep"), because one worked in local days and the other in UTC.
 * Do not re-derive it anywhere; import `getSprint`.
 */

/** App default: sprints are counted from this day. Local midnight, not UTC. */
export const SPRINT_CYCLE_ANCHOR = new Date(2026, 8, 2);
export const SPRINT_CYCLE_DAYS = 14;

/** A user's sprint calendar (set on the Profile page). */
export type SprintConfig = { anchor: Date; days: number };
export const DEFAULT_SPRINT: SprintConfig = { anchor: SPRINT_CYCLE_ANCHOR, days: SPRINT_CYCLE_DAYS };

export type Sprint = { start: Date; end: Date; offset: number };

/** The sprint window containing `date`, in local calendar days. */
export function getSprint(date: Date, config: SprintConfig = DEFAULT_SPRINT): Sprint {
  const day = startOfDay(date);
  const offset = Math.floor(differenceInCalendarDays(day, config.anchor) / config.days);
  const start = addDays(config.anchor, offset * config.days);
  return { start, end: addDays(start, config.days - 1), offset };
}

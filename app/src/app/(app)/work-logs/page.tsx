import { addDays, format, isWeekend, startOfDay } from "date-fns";

import { listTrackerForRange } from "@/actions/follow-ups";
import { getWorkLog, listWorkLogs } from "@/actions/worklog";
import { getSprint } from "@/lib/sprint";
import { trackerOnDay } from "@/lib/day-tracker";
import { requireUserId } from "@/lib/session";
import { getUserSettings } from "@/lib/user-settings";
import { DEFAULT_TITLE } from "@/components/work-log/day-type";
import { DeckSearch, type DeckSearchDay } from "@/components/work-log/deck-search";
import { SprintDeck, type DeckDayState, type DeckItem, type DeckLog, type DeckTracker } from "@/components/work-log/sprint-deck";

export const metadata = { title: "Work Logs" };

/** Auto-generated titles ("Daily Work Log", …) aren't shown. */
const AUTO_TITLES = new Set<string>(Object.values(DEFAULT_TITLE));

/**
 * Work Logs (deck redesign, 2026-10-09): the current sprint as a row of day
 * columns; the selected day opens into its summary and that day's Tracker
 * to-dos, follow-ups and notes. `?day=YYYY-MM-DD` picks the open day (the deck
 * keeps it in sync). Earlier sprints aren't shown here (owner's call).
 * The sprint calendar lives in `lib/sprint.ts` — do not re-derive it here.
 */
export default async function WorkLogsPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const [{ day: dayParam }, result, settings] = await Promise.all([searchParams, listWorkLogs({ take: 50 }), requireUserId().then(getUserSettings)]);
  const config = settings.sprint;
  const logs = result.ok ? result.data.items : [];
  // One `today` for the whole render, so "today" cannot land on two days at midnight.
  const today = startOfDay(new Date());
  const todayKey = format(today, "yyyy-MM-dd");
  const sprint = getSprint(today, config);
  const allDays = Array.from({ length: config.days }, (_, index) => addDays(sprint.start, index));
  const weekdays = allDays.filter((day) => !isWeekend(day));

  const byDay = new Map(logs.map((log) => [format(log.date, "yyyy-MM-dd"), log]));
  const sprintLogs = weekdays.map((day) => byDay.get(format(day, "yyyy-MM-dd"))).filter((log) => log !== undefined);

  // Full detail for every logged day, so the deck can open any of them without a round trip.
  const details = new Map<string, DeckLog>(
    await Promise.all(
      sprintLogs.map(async (entry): Promise<[string, DeckLog]> => {
        const key = format(entry.date, "yyyy-MM-dd");
        const detail = await getWorkLog(entry.id);
        const log = detail.ok ? detail.data : null;
        return [key, {
          id: entry.id,
          title: AUTO_TITLES.has(entry.title) ? null : entry.title,
          dayType: entry.dayType,
          summary: log?.summaryModel && log.summary ? log.summary : null,
          tickets: (log?.ticketUpdates ?? []).map((update) => ({ id: update.id, key: update.ticket.ticketId, title: update.ticket.title, status: update.status, description: update.description })),
        }];
      }),
    ),
  );

  // The Tracker across the sprint, sorted into days below.
  const trackerResult = await listTrackerForRange({ from: sprint.start, to: addDays(sprint.end, 1) });
  const entries = trackerResult.ok ? trackerResult.data : [];
  const dayOf = (date: Date) => format(date, "yyyy-MM-dd");
  const trackerFor = (key: string): DeckTracker => trackerOnDay(entries, key, dayOf);

  const stateOf = (key: string, day: Date): DeckDayState => {
    if (day > today && key !== todayKey) return "future";
    const log = byDay.get(key);
    if (key === todayKey) return "today";
    if (log) return log.dayType === "Work" ? "logged" : "off";
    return "missing";
  };

  // Weekdays as columns, with one "weekend" spacer wherever Sat/Sun fall mid-sprint.
  const items: DeckItem[] = [];
  allDays.forEach((day, index) => {
    const key = format(day, "yyyy-MM-dd");
    if (isWeekend(day)) {
      const prev = allDays[index - 1];
      const hasWeekdayAfter = allDays.slice(index).some((next) => !isWeekend(next));
      if (prev && !isWeekend(prev) && hasWeekdayAfter) items.push({ kind: "weekend", key: `weekend-${key}` });
      return;
    }
    const entry = byDay.get(key);
    items.push({
      kind: "day",
      key,
      weekday: format(day, "EEE"),
      weekdayLong: format(day, "EEEE"),
      month: format(day, "MMMM"),
      dayNumber: format(day, "d"),
      state: stateOf(key, day),
      isToday: key === todayKey,
      isLast: day.getTime() === weekdays.at(-1)?.getTime(),
      ticketCount: entry?._count.ticketUpdates ?? 0,
      meetingCount: entry?._count.meetings ?? 0,
      log: details.get(key) ?? null,
      tracker: trackerFor(key),
    });
  });

  // Open day: the URL's (when it's an openable day of this sprint), else today,
  // else the latest past weekday.
  const openable = items.filter((item): item is Extract<DeckItem, { kind: "day" }> => item.kind === "day" && item.state !== "future");
  const fromUrl = dayParam ? openable.find((item) => item.key === dayParam) : undefined;
  const initialDay = fromUrl?.key ?? openable.at(-1)?.key ?? null;

  const elapsed = weekdays.filter((day) => day <= today).length;
  // What the header search can find: openable days, their titles and tickets.
  const searchDays: DeckSearchDay[] = openable.map((item) => ({
    key: item.key,
    label: format(new Date(`${item.key}T00:00:00`), "EEE d MMM"),
    title: item.log ? (item.log.title ?? (item.log.dayType === "Work" ? "Work day" : item.log.dayType)) : null,
    tickets: item.log?.tickets.map((ticket) => ({ key: ticket.key, title: ticket.title })) ?? [],
  }));

  return (
    // From lg the page fits the screen: the deck takes what the header leaves.
    <div className="wl-deck flex flex-col gap-6 xl:gap-7">
      <header className="wl-head relative z-20 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div className="min-w-0">
          <p className="pr-16 text-sm font-semibold tracking-[0.12em] text-text-muted uppercase md:pr-0">
            Sprint · {format(sprint.start, "d MMM")} – {format(sprint.end, "d MMM yyyy")} · Day {elapsed} of {weekdays.length}
          </p>
          <h1 className="wl-title mt-2 text-text">Work Logs</h1>
        </div>
        <div className="flex w-full flex-col items-start gap-2.5 pb-1 lg:w-auto lg:items-end">
          <DeckSearch days={searchDays} />
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-text-muted" aria-label="Legend">
            <li className="inline-flex items-center gap-1.5"><i className="wl-dot" aria-hidden="true" />Logged</li>
            <li className="inline-flex items-center gap-1.5"><i className="wl-legend-missing" aria-hidden="true" />No log</li>
            <li className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-sidebar" aria-hidden="true" />Today</li>
          </ul>
        </div>
      </header>

      <SprintDeck items={items} initialDay={initialDay} />
    </div>
  );
}

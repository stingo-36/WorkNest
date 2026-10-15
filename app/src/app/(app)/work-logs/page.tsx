import Link from "next/link";
import { addDays, format, isWeekend, startOfDay } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

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
 * keeps it in sync). `?day=` also picks the sprint: a day in an earlier sprint
 * shows that sprint, and the ‹ › arrows step between sprints (owner, 2026-10-15).
 * The sprint calendar lives in `lib/sprint.ts` — do not re-derive it here.
 */
export default async function WorkLogsPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const [{ day: dayParam }, settings] = await Promise.all([searchParams, requireUserId().then(getUserSettings)]);
  const config = settings.sprint;
  // One `today` for the whole render, so "today" cannot land on two days at midnight.
  const today = startOfDay(new Date());
  const todayKey = format(today, "yyyy-MM-dd");
  const current = getSprint(today, config);
  // The sprint holding `?day=`; future sprints fall back to the current one.
  const requested = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? new Date(`${dayParam}T00:00:00`) : null;
  const picked = requested && !Number.isNaN(requested.getTime()) ? getSprint(requested, config) : current;
  const sprint = picked.offset > current.offset ? current : picked;
  const isCurrent = sprint.offset === current.offset;
  // Each arrow lands on the other sprint's last day (the deck falls back to its latest openable day).
  const prevHref = `/work-logs?day=${format(addDays(sprint.start, -1), "yyyy-MM-dd")}`;
  const nextHref = sprint.offset + 1 === current.offset ? "/work-logs" : `/work-logs?day=${format(addDays(sprint.end, config.days), "yyyy-MM-dd")}`;

  const result = await listWorkLogs({ from: format(sprint.start, "yyyy-MM-dd"), to: format(sprint.end, "yyyy-MM-dd"), take: config.days });
  const logs = result.ok ? result.data.items : [];
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
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pr-16 md:pr-0">
            <nav className="flex items-center gap-1.5" aria-label="Sprints">
              <SprintArrow href={prevHref} direction="previous" />
              <SprintArrow href={isCurrent ? null : nextHref} direction="next" />
            </nav>
            <p className="text-sm font-semibold tracking-[0.12em] text-text-muted uppercase">
              Sprint · {format(sprint.start, "d MMM")} – {format(sprint.end, "d MMM yyyy")} · {isCurrent ? `Day ${elapsed} of ${weekdays.length}` : "Past sprint"}
            </p>
            {isCurrent ? null : (
              <Link href="/work-logs" className="inline-flex min-h-9 items-center text-sm font-semibold text-accent-text underline-offset-4 hover:underline">Back to current sprint</Link>
            )}
          </div>
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

      {/* Keyed by sprint so stepping between sprints resets the open day. */}
      <SprintDeck key={format(sprint.start, "yyyy-MM-dd")} items={items} initialDay={initialDay} />
    </div>
  );
}

/** ‹ / › to the neighbouring sprint; a dimmed circle when there is none (no future sprints). */
function SprintArrow({ href, direction }: { href: string | null; direction: "previous" | "next" }) {
  const Icon = direction === "previous" ? ChevronLeft : ChevronRight;
  const box = "grid size-9 shrink-0 place-items-center rounded-full border bg-surface transition-colors duration-150";
  if (!href) {
    return <span className={`${box} border-border text-text-subtle opacity-50`} aria-hidden="true"><Icon className="size-4" /></span>;
  }
  return (
    <Link href={href} aria-label={`${direction === "previous" ? "Previous" : "Next"} sprint`} title={`${direction === "previous" ? "Previous" : "Next"} sprint`} className={`${box} border-border-strong text-text hover:border-text-subtle hover:bg-surface-2`}>
      <Icon className="size-4" aria-hidden="true" />
    </Link>
  );
}

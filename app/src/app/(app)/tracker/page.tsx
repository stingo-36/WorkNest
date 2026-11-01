import { addDays, format, isWeekend } from "date-fns";

import { listFollowUpPeople, listFollowUps } from "@/actions/follow-ups";
import { TrackerBoard, type TrackerView } from "@/components/tracker/tracker-board";
import { requireUserId } from "@/lib/session";
import { getSprint } from "@/lib/sprint";
import { getUserSettings } from "@/lib/user-settings";
import { getOrderedList, getSavedTags } from "@/lib/user-lists";

export const metadata = { title: "Tracker" };

const VIEWS = new Set<TrackerView>(["todo", "followups", "notes"]);

/**
 * Three lists on one page: to-dos (what you owe), follow-ups (what you told
 * someone, waiting on their reply), and notes (what you keep adding to). They
 * share a table and a spine — see `EntryKind` in the schema. `?view=` picks
 * the tab.
 *
 * Dates cross the server/client boundary as ISO strings; the board re-hydrates.
 */
export default async function TrackerPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const userId = await requireUserId();
  const [entries, people, channels, savedNoteTags, settings] = await Promise.all([
    listFollowUps(),
    listFollowUpPeople(),
    getOrderedList(userId, "FollowUpChannel"),
    getSavedTags(userId, "NoteTag"),
    getUserSettings(userId),
  ]);

  // The header's "Sprint day 3 of 10": weekdays only, from the sprint calendar.
  const now = new Date();
  const sprint = getSprint(now, settings.sprint);
  const weekdays = Array.from({ length: settings.sprint.days }, (_, index) => addDays(sprint.start, index)).filter((day) => !isWeekend(day));

  return (
    <TrackerBoard
      entries={
        entries.ok
          ? entries.data.map((entry) => ({
              ...entry,
              dueDate: entry.dueDate
                ? entry.dueDate.toISOString().slice(0, 10)
                : null,
              completedAt: entry.completedAt?.toISOString() ?? null,
              createdAt: entry.createdAt.toISOString(),
              updatedAt: entry.updatedAt.toISOString(),
              updates: entry.updates.map((update) => ({
                ...update,
                occurredAt: update.occurredAt.toISOString(),
                createdAt: update.createdAt.toISOString(),
              })),
            }))
          : []
      }
      people={people.ok ? people.data : []}
      channels={channels}
      savedNoteTags={savedNoteTags}
      initialView={VIEWS.has(view as TrackerView) ? (view as TrackerView) : "todo"}
      // The server's day, used for the first paint; the client corrects to the
      // browser's own clock on hydration (same trick as the top bar's date).
      serverToday={new Date().toISOString().slice(0, 10)}
      loadError={entries.ok ? undefined : entries.error.message}
      greetingName={settings.name?.trim().split(/\s+/)[0] ?? null}
      sprint={{
        start: format(sprint.start, "yyyy-MM-dd"),
        day: Math.max(1, weekdays.filter((day) => day <= now).length),
        total: weekdays.length,
      }}
    />
  );
}

import { listFollowUpPeople, listFollowUps } from "@/actions/follow-ups";
import { TrackerBoard, type TrackerView } from "@/components/tracker/tracker-board";
import { requireUserId } from "@/lib/session";
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
  const [entries, people, channels, savedNoteTags] = await Promise.all([
    listFollowUps(),
    listFollowUpPeople(),
    getOrderedList(userId, "FollowUpChannel"),
    getSavedTags(userId, "NoteTag"),
  ]);

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
    />
  );
}

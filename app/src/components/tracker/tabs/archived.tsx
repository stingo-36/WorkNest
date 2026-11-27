"use client";

import { setFollowUpArchived, setFollowUpStatus } from "@/actions/follow-ups";
import { ActionPill, Bucket, DeleteEntry, Empty, Row, type TrackerEntry, ago, byArchived, entryLabel, matches } from "@/components/tracker/kit";

/** Every archived entry, newest first, grouped by kind. Restore puts it back on its list. */
export function ArchiveList({ entries, today, needle, onOpen }: { entries: TrackerEntry[]; today: string; needle: string; onOpen: (entry: TrackerEntry) => void }) {
  const shown = entries.filter((entry) => matches(entry, needle)).sort(byArchived);
  if (shown.length === 0) return <Empty>{needle ? "Nothing matches." : "Nothing archived. Archive a to-do or follow-up from its window to put it here."}</Empty>;
  const groups = (["Task", "FollowUp", "Note"] as const)
    .map((kind) => ({ kind, items: shown.filter((entry) => entry.kind === kind) }))
    .filter((group) => group.items.length);
  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => (
        <Bucket key={group.kind} label={`${group.kind === "Task" ? "To-dos" : group.kind === "FollowUp" ? "Follow-ups" : "Notes"} · ${group.items.length}`}>
          {group.items.map((entry) => (
            <Row
              key={entry.id}
              eyebrow={entryLabel(entry)}
              title={entry.subject}
              onOpen={() => onOpen(entry)}
              meta={
                <span className="text-base font-medium text-text-muted" suppressHydrationWarning>
                  {entry.person ? `${entry.person} · ` : ""}{entry.status === "Done" && entry.kind !== "Note" ? "Done · " : ""}Archived {ago(entry.archivedAt ?? entry.completedAt ?? entry.updatedAt, today)}
                </span>
              }
              actions={
                <>
                  <DeleteEntry entry={entry} />
                  <ActionPill
                    label="Restore"
                    action={() => (entry.archivedAt ? setFollowUpArchived({ followUpId: entry.id, archived: false }) : setFollowUpStatus({ followUpId: entry.id, status: "Open" }))}
                    success="Restored"
                  />
                </>
              }
            />
          ))}
        </Bucket>
      ))}
    </div>
  );
}

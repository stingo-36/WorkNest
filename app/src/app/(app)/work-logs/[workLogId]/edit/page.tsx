import { notFound } from "next/navigation";

import { differenceInCalendarDays, format } from "date-fns";

import { listTodosForDay } from "@/actions/follow-ups";
import { getAdjacentWorkLogs, getWorkLog } from "@/actions/worklog";
import { requireUserId } from "@/lib/session";
import { getUserSettings } from "@/lib/user-settings";
import { WorkLogEditor } from "@/components/work-log/work-log-editor";
import type { EditorWorkLog } from "@/components/work-log/types";

export const metadata = { title: "Edit Work Log" };

export default async function EditWorkLogPage({ params }: { params: Promise<{ workLogId: string }> }) {
  const { workLogId } = await params;
  const [result, adjacentResult, settings] = await Promise.all([getWorkLog(workLogId), getAdjacentWorkLogs(workLogId), requireUserId().then(getUserSettings)]);
  if (!result.ok) notFound();
  const data = result.data;
  const workLog: EditorWorkLog = {
    id: data.id,
    title: data.title,
    dayType: data.dayType,
    learningNotes: data.learningNotes,
    attachments: data.attachments.map((item) => ({ ...item, createdAt: new Date(item.createdAt) })),
    date: new Date(data.date),
    updatedAt: new Date(data.updatedAt),
    meetings: data.meetings.map((meeting) => ({ id: meeting.id, name: meeting.name, notes: meeting.notes, order: meeting.order, isDefault: meeting.isDefault })),
    tickets: data.ticketUpdates.map((update) => ({
      id: update.ticket.id,
      ticketKey: update.ticket.ticketId,
      title: update.ticket.title,
      projectName: update.ticket.projectName,
      status: update.ticket.status,
      updatedAt: new Date(update.ticket.updatedAt),
      draft: { description: update.description, status: update.status },
      history: null,
    })),
  };

  // Labels are built here (server) so they can't drift during hydration.
  const daysAgo = differenceInCalendarDays(new Date(), workLog.date);
  const relative = daysAgo === 0 ? "Today" : daysAgo === 1 ? "Yesterday" : daysAgo > 1 ? `${daysAgo} days ago` : "Upcoming";
  const toNav = (log: { id: string; date: Date } | null | undefined) => (log ? { id: log.id, label: format(log.date, "EEEE d MMMM") } : null);
  const adjacent = adjacentResult.ok ? { previous: toNav(adjacentResult.data.previous), next: toNav(adjacentResult.data.next) } : { previous: null, next: null };

  // WorkLog.date is UTC midnight, so its ISO prefix is the calendar day.
  const dayIso = workLog.date.toISOString().slice(0, 10);
  const todosResult = await listTodosForDay({ date: dayIso });
  const todos = todosResult.ok
    ? todosResult.data.map((todo) => ({
        ...todo,
        dueDate: todo.dueDate ? todo.dueDate.toISOString().slice(0, 10) : null,
        completedAt: todo.completedAt?.toISOString() ?? null,
      }))
    : [];

  return <WorkLogEditor workLog={workLog} relative={relative} adjacent={adjacent} ticketsEnabled={settings.ticketsEnabled} dayTodos={{ date: dayIso, todos }} />;
}

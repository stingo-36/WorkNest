import { redirect } from "next/navigation";

import { listTickets } from "@/actions/tickets";
import { TicketBoard } from "@/components/tickets/ticket-board";
import { requireUserId } from "@/lib/session";
import { getUserSettings } from "@/lib/user-settings";
import { listDaysOff } from "@/lib/worklogs";

export const metadata = { title: "Tickets" };

export default async function TicketsPage() {
  // Tickets switched off in Profile: the section doesn't exist for this user.
  const { ticketsEnabled } = await getUserSettings(await requireUserId());
  if (!ticketsEnabled) redirect("/work-logs");

  const [result, daysOff] = await Promise.all([
    listTickets({ take: 200 }),
    requireUserId().then(listDaysOff),
  ]);

  return (
    <TicketBoard
      daysOff={daysOff}
      initialTickets={
        result.ok
          ? result.data.items.map((ticket) => ({
              id: ticket.id,
              ticketId: ticket.ticketId,
              title: ticket.title,
              projectName: ticket.projectName,
              status: ticket.status,
              updatedAt: ticket.updatedAt.toISOString(),
              createdAt: ticket.createdAt.toISOString(),
              workLogCount: ticket.workLogCount,
              latestUpdate: ticket.latestUpdate
                ? {
                    description: ticket.latestUpdate.description,
                    createdAt: ticket.latestUpdate.createdAt.toISOString(),
                    workLog: ticket.latestUpdate.workLog
                      ? {
                          id: ticket.latestUpdate.workLog.id,
                          title: ticket.latestUpdate.workLog.title,
                          date: ticket.latestUpdate.workLog.date.toISOString(),
                        }
                      : null,
                  }
                : null,
            }))
          : []
      }
      loadError={result.ok ? undefined : result.error.message}
    />
  );
}

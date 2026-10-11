-- Direct ticket-page updates are append-only and deliberately separate from
-- TicketWorkUpdate, whose rows belong to dated work logs.
CREATE TABLE "TicketHistoryEntry" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketHistoryEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TicketHistoryEntry_userId_idx" ON "TicketHistoryEntry"("userId");
CREATE INDEX "TicketHistoryEntry_ticketId_idx" ON "TicketHistoryEntry"("ticketId");
CREATE INDEX "TicketHistoryEntry_ticketId_createdAt_idx" ON "TicketHistoryEntry"("ticketId", "createdAt");
CREATE INDEX "TicketHistoryEntry_userId_createdAt_idx" ON "TicketHistoryEntry"("userId", "createdAt");

ALTER TABLE "TicketHistoryEntry" ADD CONSTRAINT "TicketHistoryEntry_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketHistoryEntry" ADD CONSTRAINT "TicketHistoryEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

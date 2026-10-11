-- Project / site moves from WorkLog to Ticket.

-- 1. New column on Ticket.
ALTER TABLE "Ticket" ADD COLUMN "projectName" TEXT;

-- 2. Carry existing values over: each ticket takes the project of the most
--    recent work log it was logged in that had one.
UPDATE "Ticket" AS t
SET "projectName" = src."projectName"
FROM (
  SELECT DISTINCT ON (u."ticketId") u."ticketId", w."projectName"
  FROM "TicketWorkUpdate" AS u
  JOIN "WorkLog" AS w ON w."id" = u."workLogId"
  WHERE w."projectName" IS NOT NULL AND btrim(w."projectName") <> ''
  ORDER BY u."ticketId", w."date" DESC, u."updatedAt" DESC
) AS src
WHERE t."id" = src."ticketId" AND t."projectName" IS NULL;

-- 3. Work logs no longer carry a project.
ALTER TABLE "WorkLog" DROP COLUMN "projectName";

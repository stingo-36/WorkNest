-- Add the five-stage workflow without rewriting historical data or dropping
-- legacy enum values. The application normalizes old values at its boundary.
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'SentToQA';
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'ReadyForProduction';
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'Released';
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'Done';

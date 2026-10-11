"use server";

import { revalidatePath } from "next/cache";

import { requireUserId } from "@/lib/session";
import { listProjectSuggestions } from "@/lib/user-lists";
import { notFound, ok, parseOrFail } from "@/lib/result";
import {
  addTicketWorkUpdate,
  appendTicketHistoryEntry as appendTicketHistoryEntryRow,
  deleteTicket as deleteTicketRow,
  deleteTicketHistoryEntry as deleteTicketHistoryEntryRow,
  detachTicketFromWorkLog as detachTicketRow,
  findTicketByKeyWithHistory,
  getTicketWithHistory,
  listActiveTickets as listActiveTicketsQuery,
  listTickets as listTicketsQuery,
  updateTicket as updateTicketRow,
  upsertTicketForWorkLog as upsertTicketRow,
} from "@/lib/tickets";
import {
  appendTicketHistoryEntrySchema,
  deleteTicketHistoryEntrySchema,
  deleteTicketSchema,
  detachTicketFromWorkLogSchema,
  findTicketSchema,
  listTicketsSchema,
  saveTicketWorkUpdateSchema,
  updateTicketSchema,
  upsertTicketForWorkLogSchema,
} from "@/lib/validation";

/**
 * Ticket server actions — the core workflow.
 *
 * `requireUserId()` first, Zod second, ownership-scoped query third.
 * A hostile workLogId / ticketId from the client matches zero rows and comes
 * back as NOT_FOUND; it never reaches another user's data.
 */

function revalidateTickets(ticketId?: string, workLogId?: string) {
  revalidatePath("/tickets");
  if (ticketId) revalidatePath(`/tickets/${ticketId}`);
  if (workLogId) revalidatePath(`/work-logs/${workLogId}`);
}

/**
 * The ticket search box. Input: { ticketKey } (case-insensitive, normalised
 * to upper case server-side — "asu-1234" finds "ASU-1234").
 *
 * Returns { found: false } rather than an error when nothing matches, so the
 * UI can offer inline creation without treating it as a failure.
 */
export async function findTicket(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(findTicketSchema, input);
  if (!parsed.ok) return parsed;

  const ticket = await findTicketByKeyWithHistory(userId, parsed.data.ticketKey);
  if (!ticket) {
    return ok({ found: false as const, ticketKey: parsed.data.ticketKey });
  }
  return ok({ found: true as const, ticket });
}

/**
 * Spec 21 steps 1-3 — "+ Add Ticket" / typing a ticket ID in a work log.
 *
 * Input: { workLogId, ticketKey, title?, status? }
 * Output: { ticket (with full history), created, currentUpdate }
 *
 * Finds the ticket for THIS user or creates it, then attaches it to the work
 * log by ensuring exactly one TicketWorkUpdate row exists for
 * (ticket, workLog). Calling it twice for the same pair is a no-op and will
 * not clear a draft that is already typed.
 */
export async function upsertTicketForWorkLog(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(upsertTicketForWorkLogSchema, input);
  if (!parsed.ok) return parsed;

  const result = await upsertTicketRow(userId, parsed.data);
  if (!result) return notFound("Work log not found");

  revalidateTickets(result.ticket.id, parsed.data.workLogId);
  return ok(result);
}

/**
 * Spec 21 steps 4-6 + spec 22 — save "Work Done Today" and the status.
 *
 * Input: { workLogId, ticketId (cuid), description, status }
 * Output: { update (with its workLog), ticket }
 *
 * Keyed on (ticketId, workLogId):
 *   - first save for this work log  -> NEW history row
 *   - subsequent debounced autosaves -> that SAME row is rewritten
 *   - other work logs' rows          -> never read, never touched
 *
 * Safe to call on every debounce tick. It cannot produce duplicates and it
 * cannot overwrite a previous day's entry.
 */
export async function saveTicketWorkUpdate(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(saveTicketWorkUpdateSchema, input);
  if (!parsed.ok) return parsed;

  const result = await addTicketWorkUpdate(userId, parsed.data);
  if (!result) return notFound("Ticket or work log not found");

  revalidateTickets(result.ticket.id, parsed.data.workLogId);
  return ok({ ...result, savedAt: new Date() });
}

/**
 * Spec 9 — remove a ticket card from this work log.
 *
 * Input: { workLogId, ticketId }
 * Deletes ONLY this work log's update row. The Ticket and all other work
 * logs' history survive; the ticket's status rolls back to the newest
 * remaining update.
 */
export async function detachTicketFromWorkLog(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(detachTicketFromWorkLogSchema, input);
  if (!parsed.ok) return parsed;

  const result = await detachTicketRow(
    userId,
    parsed.data.workLogId,
    parsed.data.ticketId,
  );
  if (!result) return notFound("Ticket or work log not found");

  revalidateTickets(parsed.data.ticketId, parsed.data.workLogId);
  return ok(result);
}

/** Ticket detail page: header + full timeline. */
export async function getTicket(ticketId: string) {
  const userId = await requireUserId();
  const ticket = await getTicketWithHistory(userId, ticketId);
  if (!ticket) return notFound("Ticket not found");
  return ok(ticket);
}

/** Tickets table. Input: { search?, status?, take?, skip? } */
export async function listTickets(input?: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(listTicketsSchema, input ?? {});
  if (!parsed.ok) return parsed;

  return ok(
    await listTicketsQuery(userId, {
      search: parsed.data.search || undefined,
      status: parsed.data.status,
      take: parsed.data.take,
      skip: parsed.data.skip,
    }),
  );
}

/** Project / site names already used on tickets — feeds the project autocomplete. */
export async function listProjects() {
  const userId = await requireUserId();
  // Profile's project list: names used on tickets + saved ones − removed ones.
  return ok(await listProjectSuggestions(userId));
}

/** Dashboard card — Open / In Progress / Blocked. */
export async function listActiveTickets(take = 10) {
  const userId = await requireUserId();
  return ok(await listActiveTicketsQuery(userId, take));
}

/**
 * Edit a ticket directly (spec 13). Input: { ticketId, title?, status? }
 * Deliberately writes NO history row — a title fix is not logged work.
 */
export async function updateTicket(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(updateTicketSchema, input);
  if (!parsed.ok) return parsed;

  const { ticketId, ...data } = parsed.data;
  const ticket = await updateTicketRow(userId, ticketId, data);
  if (!ticket) return notFound("Ticket not found");

  revalidateTickets(ticketId);
  return ok(ticket);
}

/**
 * Append a body update from /tickets. Every call creates a new standalone
 * TicketHistoryEntry and leaves all work-log TicketWorkUpdate rows untouched.
 */
export async function appendTicketHistoryEntry(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(appendTicketHistoryEntrySchema, input);
  if (!parsed.ok) return parsed;

  const { ticketId, ...data } = parsed.data;
  const result = await appendTicketHistoryEntryRow(userId, ticketId, data);
  if (!result) return notFound("Ticket not found");

  revalidateTickets(ticketId);
  return ok(result);
}

/** Delete one direct /tickets history entry. Work-log history is untouched. */
export async function deleteTicketHistoryEntry(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(deleteTicketHistoryEntrySchema, input);
  if (!parsed.ok) return parsed;

  const removed = await deleteTicketHistoryEntryRow(
    userId,
    parsed.data.ticketId,
    parsed.data.entryId,
  );
  if (!removed) return notFound("Ticket update not found");

  revalidateTickets(parsed.data.ticketId);
  return ok({ deleted: true });
}

/**
 * Destructive: removes the ticket AND its whole history.
 * This is NOT what removing a ticket from a work log does — use
 * `detachTicketFromWorkLog` for that.
 */
export async function deleteTicket(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(deleteTicketSchema, input);
  if (!parsed.ok) return parsed;

  const removed = await deleteTicketRow(userId, parsed.data.ticketId);
  if (!removed) return notFound("Ticket not found");

  revalidateTickets();
  return ok({ deleted: true });
}

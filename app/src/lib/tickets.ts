import "server-only";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { TicketStatus as StoredTicketStatus } from "@/generated/prisma/enums";
import { touchWorkLog } from "@/lib/worklogs";
import {
  normalizeTicketStatus,
  toStoredTicketStatus,
  type WorkflowStatus,
} from "@/lib/workflow-status";

/**
 * ===========================================================================
 * THE CRITICAL PIECE — spec sections 7, 8, 9, 21, 22.
 * ===========================================================================
 *
 * Rules, in the order they matter:
 *
 *  1. A ticket is looked up by (userId, ticketId). NEVER by ticketId alone.
 *     `ticketId` is the human key ("ASU-1234") and is unique PER USER.
 *
 *  2. Work history is append-only. Writing work for a ticket on a new day
 *     creates a NEW TicketWorkUpdate row. It never edits an older one.
 *
 *  3. The ONE exception, and the reason this is subtle (spec 22):
 *     the update belonging to the CURRENT work log for THIS ticket may be
 *     rewritten in place while the user is still typing, so debounced
 *     autosave does not produce a row per keystroke.
 *
 *     That is expressed structurally, not by convention:
 *
 *         @@unique([ticketId, workLogId])
 *
 *     and every write goes through `prisma.ticketWorkUpdate.upsert` keyed on
 *     that pair. So:
 *       - same work log  -> in-place update  (autosave, idempotent)
 *       - different work log -> new row      (history, immutable)
 *     There is no code path that can blind-create a duplicate, and no code
 *     path that can update "the latest" update and clobber yesterday's entry.
 *
 *  4. Removing a ticket from a work log deletes ONLY that work log's update
 *     row. The Ticket and every other work log's updates survive.
 */

/** Ticket plus the data the work-log editor and detail page render. */
export const ticketWithHistoryInclude = {
  updates: {
    orderBy: [{ createdAt: "desc" }],
    include: {
      workLog: { select: { id: true, title: true, date: true } },
    },
  },
  historyEntries: {
    orderBy: [{ createdAt: "desc" }],
  },
} satisfies Prisma.TicketInclude;

export type TicketWithHistory = NonNullable<
  Awaited<ReturnType<typeof getTicketWithHistory>>
>;

// ---------------------------------------------------------------------------
// Ownership guards — every entry point starts with one of these.
// ---------------------------------------------------------------------------

async function assertWorkLogOwned(userId: string, workLogId: string) {
  return prisma.workLog.findFirst({
    where: { id: workLogId, userId },
    select: { id: true, date: true },
  });
}

async function assertTicketOwned(userId: string, ticketId: string) {
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, userId },
    select: { id: true, ticketId: true, status: true },
  });
  return ticket ? { ...ticket, status: normalizeTicketStatus(ticket.status) } : null;
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * The ticket-search box calls this. Returns the ticket with its recent
 * history, or null so the caller can offer inline creation.
 */
export async function findTicketByKeyWithHistory(
  userId: string,
  ticketKey: string,
  historyLimit = 10,
) {
  const ticket = await prisma.ticket.findUnique({
    where: { userId_ticketId: { userId, ticketId: ticketKey } },
    include: {
      updates: {
        orderBy: { createdAt: "desc" },
        take: historyLimit,
        include: { workLog: { select: { id: true, title: true, date: true } } },
      },
      // Updates written directly on the Tickets page — shown in the same history.
      historyEntries: { orderBy: { createdAt: "desc" }, take: historyLimit },
    },
  });
  if (!ticket) return null;
  const { historyEntries, ...rest } = ticket;
  return {
    ...normalizeTicketWithUpdates(rest),
    historyEntries: historyEntries.map((entry) => ({ ...entry, status: normalizeTicketStatus(entry.status) })),
  };
}

/** Full ticket + complete timeline. Null when it isn't this user's. */
export async function getTicketWithHistory(userId: string, ticketId: string) {
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, userId },
    include: ticketWithHistoryInclude,
  });
  return ticket ? normalizeTicketWithHistory(ticket) : null;
}

export type ListTicketsOptions = {
  search?: string;
  status?: WorkflowStatus;
  take?: number;
  skip?: number;
};

/** Tickets table: id, title, status, latest update, last updated, # work logs. */
export async function listTickets(
  userId: string,
  options: ListTicketsOptions = {},
) {
  const { search, status, take = 50, skip = 0 } = options;

  const where = {
    userId,
    ...(search
      ? {
          OR: [
            { ticketId: { contains: search, mode: "insensitive" as const } },
            { title: { contains: search, mode: "insensitive" as const } },
            { projectName: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const rows = await prisma.ticket.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { updates: true } },
      updates: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          workLog: { select: { id: true, title: true, date: true } },
        },
      },
    },
  });

  const normalized = rows
    .map((ticket) => normalizeTicketWithUpdates(ticket))
    .filter((ticket) => !status || ticket.status === status);
  return {
    total: normalized.length,
    items: normalized.slice(skip, skip + take).map((t) => ({
      ...t,
      latestUpdate: t.updates[0] ?? null,
      workLogCount: t._count.updates,
    })),
  };
}

// ---------------------------------------------------------------------------
// Spec 21 — find-or-create, then attach to the current work log
// ---------------------------------------------------------------------------

export type UpsertTicketInput = {
  workLogId: string;
  /** Normalised human key, e.g. "ASU-1234". */
  ticketKey: string;
  /** Used only when the ticket has to be created. */
  title?: string;
  /** Project / site — used only when the ticket has to be created. */
  projectName?: string | null;
  /** Initial status on create; ignored for an existing ticket. */
  status?: WorkflowStatus;
};

export type UpsertTicketResult = {
  ticket: TicketWithHistory;
  /** True when this call created the Ticket row. */
  created: boolean;
  /** The (possibly brand new, possibly empty) update row for THIS work log. */
  currentUpdate: {
    id: string;
    description: string;
    status: WorkflowStatus;
    createdAt: Date;
    updatedAt: Date;
  };
};

/**
 * Spec 21, steps 1-3.
 *
 *   1. Look up (userId, ticketKey).
 *   2. Found    -> return it with current status + history.
 *   3. Not found-> create it.
 *   ...and either way, attach it to this work log by ensuring exactly one
 *      TicketWorkUpdate row exists for (ticket, workLog). That row starts
 *      empty and is what the editor's autosave then writes into.
 *
 * Returns null if the work log is not this user's.
 */
export async function upsertTicketForWorkLog(
  userId: string,
  input: UpsertTicketInput,
): Promise<UpsertTicketResult | null> {
  const workLog = await assertWorkLogOwned(userId, input.workLogId);
  if (!workLog) return null;

  const { ticketKey } = input;

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.ticket.findUnique({
      where: { userId_ticketId: { userId, ticketId: ticketKey } },
      select: { id: true, status: true },
    });

    let created = false;
    let ticketRowId: string;
    let currentStatus: WorkflowStatus;

    if (existing) {
      ticketRowId = existing.id;
      currentStatus = normalizeTicketStatus(existing.status);
    } else {
      const ticket = await tx.ticket.create({
        data: {
          userId,
          ticketId: ticketKey,
          title: input.title?.trim() || ticketKey,
          projectName: input.projectName?.trim() || null,
          status: toStoredTicketStatus(input.status ?? "InProgress"),
        },
        select: { id: true, status: true },
      });
      created = true;
      ticketRowId = ticket.id;
      currentStatus = normalizeTicketStatus(ticket.status);
    }

    // Attach to this work log. Upsert, so re-adding a ticket that is already
    // on this log is a no-op and never wipes what was typed.
    const currentUpdate = await tx.ticketWorkUpdate.upsert({
      where: {
        ticketId_workLogId: { ticketId: ticketRowId, workLogId: workLog.id },
      },
      create: {
        ticketId: ticketRowId,
        workLogId: workLog.id,
        userId,
        description: "",
        status: toStoredTicketStatus(currentStatus),
      },
      update: {}, // already attached — leave the existing draft untouched
      select: {
        id: true,
        description: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return { ticketRowId, created, currentUpdate };
  });

  const ticket = await getTicketWithHistory(userId, result.ticketRowId);
  if (!ticket) return null;

  await touchWorkLog(workLog.id);

  return {
    ticket,
    created: result.created,
    currentUpdate: {
      ...result.currentUpdate,
      status: normalizeTicketStatus(result.currentUpdate.status),
    },
  };
}

// ---------------------------------------------------------------------------
// Spec 21 steps 4-6 + spec 22 — the append / autosave write
// ---------------------------------------------------------------------------

export type TicketWorkUpdateInput = {
  workLogId: string;
  /** Ticket.id (cuid) — NOT the human key. */
  ticketId: string;
  description: string;
  status: WorkflowStatus;
};

/**
 * Write the work done for a ticket on a given work log, and move the ticket's
 * current status.
 *
 * Keyed on (ticketId, workLogId):
 *   - No row yet for this work log -> a NEW TicketWorkUpdate row is created.
 *     Older work logs' rows are not read, not touched, not considered.
 *   - Row already exists for THIS work log -> it is rewritten in place.
 *     This is the debounced-autosave path from spec 22 and is the only
 *     circumstance in which an update row is ever modified after creation.
 *
 * Because the key includes workLogId, a historical entry is unreachable from
 * here: you would have to pass that older work log's id, which the editor for
 * today's log never does.
 *
 * Returns null if either the work log or the ticket is not this user's.
 */
export async function addTicketWorkUpdate(
  userId: string,
  input: TicketWorkUpdateInput,
) {
  const [workLog, ticket] = await Promise.all([
    assertWorkLogOwned(userId, input.workLogId),
    assertTicketOwned(userId, input.ticketId),
  ]);
  if (!workLog || !ticket) return null;

  const description = input.description ?? "";

  const { update, ticketRow } = await prisma.$transaction(async (tx) => {
    const update = await tx.ticketWorkUpdate.upsert({
      where: {
        ticketId_workLogId: {
          ticketId: ticket.id,
          workLogId: workLog.id,
        },
      },
      create: {
        ticketId: ticket.id,
        workLogId: workLog.id,
        userId,
        description,
        status: toStoredTicketStatus(input.status),
      },
      update: {
        description,
        status: toStoredTicketStatus(input.status),
      },
      include: {
        workLog: { select: { id: true, title: true, date: true } },
      },
    });

    // Spec 21 step 6 — the ticket's CURRENT status follows the newest update.
    const ticketRow = await tx.ticket.update({
      where: { id: ticket.id },
      data: { status: toStoredTicketStatus(input.status) },
    });

    return { update, ticketRow };
  });

  await touchWorkLog(workLog.id);

  return {
    update: { ...update, status: normalizeTicketStatus(update.status) },
    ticket: normalizeTicketRecord(ticketRow),
  };
}

/**
 * Alias kept because both names appear in the spec discussion.
 * Same function, same semantics — see `addTicketWorkUpdate`.
 */
export const saveTicketWorkUpdate = addTicketWorkUpdate;

// ---------------------------------------------------------------------------
// Spec 9 — remove a ticket from a work log
// ---------------------------------------------------------------------------

/**
 * Detach a ticket from ONE work log.
 *
 * Deletes only the TicketWorkUpdate row for (ticket, workLog). The Ticket row
 * and every other work log's update rows are untouched — removing a ticket
 * from today's log must never destroy its history.
 *
 * The ticket's current status is then recomputed from the newest surviving
 * update, so undoing today's entry also undoes today's status change.
 */
export async function detachTicketFromWorkLog(
  userId: string,
  workLogId: string,
  ticketId: string,
) {
  const [workLog, ticket] = await Promise.all([
    assertWorkLogOwned(userId, workLogId),
    assertTicketOwned(userId, ticketId),
  ]);
  if (!workLog || !ticket) return null;

  const removed = await prisma.ticketWorkUpdate.deleteMany({
    where: { ticketId: ticket.id, workLogId: workLog.id, userId },
  });

  if (removed.count === 0) {
    return { detached: false, ticket: await getTicketWithHistory(userId, ticket.id) };
  }

  // Roll the current status back to the newest remaining update, if any.
  const newest = await prisma.ticketWorkUpdate.findFirst({
    where: { ticketId: ticket.id, userId },
    orderBy: { createdAt: "desc" },
    select: { status: true },
  });

  const newestStatus = newest ? normalizeTicketStatus(newest.status) : null;
  if (newestStatus && newestStatus !== ticket.status) {
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: toStoredTicketStatus(newestStatus) },
    });
  }

  await touchWorkLog(workLog.id);

  return {
    detached: true,
    ticket: await getTicketWithHistory(userId, ticket.id),
  };
}

// ---------------------------------------------------------------------------
// Direct ticket edits (spec 13 — "allow direct updates when appropriate")
// ---------------------------------------------------------------------------

/**
 * Edit a ticket's title and/or status outside a work log.
 *
 * Note: this deliberately does NOT write a TicketWorkUpdate. History rows
 * represent work logged on a day; a title fix is not that.
 */
export async function updateTicket(
  userId: string,
  ticketId: string,
  data: { title?: string; projectName?: string | null; status?: WorkflowStatus },
) {
  const result = await prisma.ticket.updateMany({
    where: { id: ticketId, userId },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.projectName !== undefined ? { projectName: data.projectName } : {}),
      ...(data.status !== undefined
        ? { status: toStoredTicketStatus(data.status) }
        : {}),
    },
  });
  if (result.count === 0) return null;
  return getTicketWithHistory(userId, ticketId);
}

/**
 * Append a body update from the standalone ticket page.
 *
 * This always creates a new TicketHistoryEntry. It never updates an earlier
 * entry and never writes to TicketWorkUpdate, so dated work-log records remain
 * isolated and immutable. Direct entries may be explicitly deleted later.
 */
export async function appendTicketHistoryEntry(
  userId: string,
  ticketId: string,
  data: { body: string; status: WorkflowStatus },
) {
  const ticket = await assertTicketOwned(userId, ticketId);
  if (!ticket) return null;

  const { entry, ticketRow } = await prisma.$transaction(async (tx) => {
    const entry = await tx.ticketHistoryEntry.create({
      data: {
        ticketId: ticket.id,
        userId,
        body: data.body,
        status: toStoredTicketStatus(data.status),
      },
    });
    const ticketRow = await tx.ticket.update({
      where: { id: ticket.id },
      data: { status: toStoredTicketStatus(data.status) },
    });
    return { entry, ticketRow };
  });

  return {
    entry: { ...entry, status: normalizeTicketStatus(entry.status) },
    ticket: normalizeTicketRecord(ticketRow),
  };
}

/**
 * Delete one update written directly from /tickets.
 * Work-log TicketWorkUpdate rows are a different model and cannot be reached
 * through this operation.
 */
export async function deleteTicketHistoryEntry(
  userId: string,
  ticketId: string,
  entryId: string,
) {
  const result = await prisma.ticketHistoryEntry.deleteMany({
    where: { id: entryId, ticketId, userId },
  });
  return result.count > 0;
}

/**
 * Delete a ticket and its entire history. Destructive and deliberate —
 * this is NOT what "remove from work log" does.
 */
export async function deleteTicket(userId: string, ticketId: string) {
  const result = await prisma.ticket.deleteMany({ where: { id: ticketId, userId } });
  return result.count > 0;
}

/**
 * Quick log: the user's tickets a key as written could mean. An exact key wins;
 * a bare number ("1233") also matches keys ending in it after a separator
 * ("ASU-1233", "WEB_1233") — newest first, so the likeliest is first.
 */
export async function findTicketsByKeyHint(userId: string, hint: string, take = 5) {
  const select = { ticketId: true, title: true, status: true, projectName: true } as const;
  const exact = await prisma.ticket.findUnique({
    where: { userId_ticketId: { userId, ticketId: hint } },
    select,
  });
  if (exact) return [normalizeTicketRecord(exact)];
  if (!/^\d+$/.test(hint)) return [];
  const rows = await prisma.ticket.findMany({
    where: { userId, ticketId: { endsWith: hint } },
    orderBy: { updatedAt: "desc" },
    select,
    take: 20,
  });
  const suffix = new RegExp(`[^0-9]${hint}$`);
  return rows
    .filter((row) => suffix.test(row.ticketId))
    .slice(0, take)
    .map((row) => normalizeTicketRecord(row));
}

/** Dashboard card: the active workflow states. */

export async function listActiveTickets(userId: string, take = 10) {
  const tickets = await prisma.ticket.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
  return tickets
    .map((ticket) => normalizeTicketRecord(ticket))
    .filter((ticket) => ticket.status !== "Done")
    .slice(0, take);
}

function normalizeTicketRecord<T extends { status: StoredTicketStatus }>(
  ticket: T,
): Omit<T, "status"> & { status: WorkflowStatus } {
  const { status, ...rest } = ticket;
  return { ...rest, status: normalizeTicketStatus(status) };
}

function normalizeTicketWithUpdates<
  T extends {
    status: StoredTicketStatus;
    updates: Array<{ status: StoredTicketStatus }>;
  },
>(
  ticket: T,
): Omit<T, "status" | "updates"> & {
  status: WorkflowStatus;
  updates: Array<
    Omit<T["updates"][number], "status"> & { status: WorkflowStatus }
  >;
} {
  const { status, updates, ...rest } = ticket;
  return {
    ...rest,
    status: normalizeTicketStatus(status),
    updates: updates.map((update) => {
      const { status: updateStatus, ...updateRest } = update;
      return {
        ...updateRest,
        status: normalizeTicketStatus(updateStatus),
      } as Omit<T["updates"][number], "status"> & {
        status: WorkflowStatus;
      };
    }),
  };
}

function normalizeTicketWithHistory<
  T extends {
    status: StoredTicketStatus;
    updates: Array<{ status: StoredTicketStatus }>;
    historyEntries: Array<{ status: StoredTicketStatus }>;
  },
>(
  ticket: T,
): Omit<T, "status" | "updates" | "historyEntries"> & {
  status: WorkflowStatus;
  updates: Array<
    Omit<T["updates"][number], "status"> & { status: WorkflowStatus }
  >;
  historyEntries: Array<
    Omit<T["historyEntries"][number], "status"> & { status: WorkflowStatus }
  >;
} {
  const { status, updates, historyEntries, ...rest } = ticket;
  return {
    ...rest,
    status: normalizeTicketStatus(status),
    updates: updates.map((update) => {
      const { status: updateStatus, ...updateRest } = update;
      return {
        ...updateRest,
        status: normalizeTicketStatus(updateStatus),
      } as Omit<T["updates"][number], "status"> & {
        status: WorkflowStatus;
      };
    }),
    historyEntries: historyEntries.map((entry) => {
      const { status: entryStatus, ...entryRest } = entry;
      return {
        ...entryRest,
        status: normalizeTicketStatus(entryStatus),
      } as Omit<T["historyEntries"][number], "status"> & {
        status: WorkflowStatus;
      };
    }),
  };
}

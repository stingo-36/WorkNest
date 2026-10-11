import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { EntryKind, FollowUpStatus } from "@/generated/prisma/enums";

/**
 * Follow-ups — "what did I tell whom, and when".
 *
 * Two rules carry the whole feature:
 *
 *  1. **Updates are append-only.** Saying something new to the same person about
 *     the same subject writes a NEW `FollowUpUpdate` row. Nothing edits an
 *     existing one. If the record could be rewritten it would be worthless as
 *     an answer to "what did I actually tell them on the 4th?".
 *  2. **userId is in every WHERE clause.** Writes go through `updateMany` /
 *     `deleteMany` with `{ id, userId }` so a hostile id from the client matches
 *     zero rows rather than touching someone else's thread.
 */

export type FollowUpInput = {
  kind?: EntryKind;
  /** Required for a FollowUp; ignored for a Task or Note. */
  person?: string | null;
  subject: string;
  ticketKey?: string | null;
  dueDate?: Date | null;
  /** The first thing you told them. Optional — a thread can start empty. */
  note?: string;
  channel?: string;
  /** When that first conversation happened. Defaults to now. */
  occurredAt?: Date | null;
  /** Labels — used by Notes. Normalised by `normalizeTags`. */
  tags?: string[];
};

/** Lowercase, no "#", spaces → dashes, de-duplicated — same rule as resources. */
function normalizeTags(tags: string[] | undefined) {
  return Array.from(
    new Set(
      (tags ?? [])
        .map((tag) => tag.trim().replace(/^#+/, "").trim().toLowerCase().replace(/\s+/g, "-"))
        .filter(Boolean),
    ),
  ).slice(0, 25);
}

const UPDATE_SELECT = {
  id: true,
  note: true,
  channel: true,
  occurredAt: true,
  fromThem: true,
  createdAt: true,
} satisfies Prisma.FollowUpUpdateSelect;

const FOLLOW_UP_SELECT = {
  id: true,
  kind: true,
  person: true,
  subject: true,
  ticketKey: true,
  status: true,
  pinned: true,
  tags: true,
  dueDate: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  updates: {
    // Newest first: the last thing you said is the thing you need to see.
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    select: UPDATE_SELECT,
  },
} satisfies Prisma.FollowUpSelect;

export async function createFollowUp(userId: string, input: FollowUpInput) {
  const note = input.note?.trim();

  return prisma.followUp.create({
    data: {
      userId,
      kind: input.kind ?? EntryKind.FollowUp,
      // A Task or a Note is yours; only a FollowUp is addressed to someone.
      person:
        (input.kind ?? EntryKind.FollowUp) === EntryKind.FollowUp
          ? (input.person?.trim() ?? null)
          : null,
      subject: input.subject.trim(),
      ticketKey: input.ticketKey?.trim() || null,
      dueDate: input.dueDate ?? null,
      tags: normalizeTags(input.tags),
      // A first note is written as a real update row, not as a field on the
      // thread, so day one is history in exactly the same shape as day ten.
      ...(note
        ? {
            updates: {
              create: {
                userId,
                note,
                channel: input.channel ?? "Slack",
                occurredAt: input.occurredAt ?? new Date(),
              },
            },
          }
        : {}),
    },
    select: FOLLOW_UP_SELECT,
  });
}

/**
 * Appends one more row: something you told them, or (`fromThem`) their reply.
 * Never touches the previous rows.
 */
export async function addFollowUpUpdate(
  userId: string,
  followUpId: string,
  input: {
    note: string;
    channel?: string;
    occurredAt?: Date | null;
    fromThem?: boolean;
  },
) {
  // Ownership check first — `create` cannot express "only if this thread is mine".
  const owned = await prisma.followUp.findFirst({
    where: { id: followUpId, userId },
    select: { id: true },
  });
  if (!owned) return null;

  await prisma.followUpUpdate.create({
    data: {
      followUpId,
      userId,
      note: input.note.trim(),
      channel: input.channel ?? "Slack",
      occurredAt: input.occurredAt ?? new Date(),
      fromThem: input.fromThem ?? false,
    },
  });

  // Touch the thread so "recently active" ordering stays honest.
  await prisma.followUp.updateMany({
    where: { id: followUpId, userId },
    data: { updatedAt: new Date() },
  });

  return getFollowUp(userId, followUpId);
}

export async function setFollowUpStatus(
  userId: string,
  followUpId: string,
  status: FollowUpStatus,
) {
  const result = await prisma.followUp.updateMany({
    where: { id: followUpId, userId },
    data: {
      status,
      completedAt: status === FollowUpStatus.Done ? new Date() : null,
    },
  });
  if (result.count === 0) return null;
  return getFollowUp(userId, followUpId);
}

/** Flag / unflag an entry as important. Scoped to the owner. */
export async function setFollowUpPinned(userId: string, followUpId: string, pinned: boolean) {
  const result = await prisma.followUp.updateMany({
    where: { id: followUpId, userId },
    data: { pinned },
  });
  if (result.count === 0) return null;
  return getFollowUp(userId, followUpId);
}

/** Replace an entry's tags. Tags are labels, not history, so they are editable. */
export async function setFollowUpTags(userId: string, followUpId: string, tags: string[]) {
  const result = await prisma.followUp.updateMany({
    where: { id: followUpId, userId },
    data: { tags: normalizeTags(tags) },
  });
  if (result.count === 0) return null;
  return getFollowUp(userId, followUpId);
}

/**
 * To-dos worth showing on one work log's day: finished around that day, or
 * due on/before it and not finished before it. Deliberately a little wide (±1
 * day) — the client narrows it to the user's own local calendar day, which the
 * server can't know.
 */
export async function listTodosAroundDay(userId: string, day: Date) {
  const DAY = 86_400_000;
  const from = new Date(day.getTime() - DAY);
  const to = new Date(day.getTime() + 2 * DAY);
  return prisma.followUp.findMany({
    where: {
      userId,
      kind: EntryKind.Task,
      OR: [
        { completedAt: { gte: from, lt: to } },
        {
          dueDate: { lte: day },
          OR: [{ status: FollowUpStatus.Open }, { completedAt: { gte: from } }],
        },
      ],
    },
    orderBy: [{ dueDate: "asc" }, { completedAt: "asc" }],
    select: { id: true, subject: true, status: true, pinned: true, dueDate: true, completedAt: true },
    take: 100,
  });
}

/**
 * Every Tracker entry that did something within [from, to): created, finished,
 * or written to (updates in range are included), plus open to-dos due by `to`
 * (so a day can show what was overdue on it). Work Logs groups them by day.
 */
export async function listTrackerForRange(userId: string, from: Date, to: Date) {
  return prisma.followUp.findMany({
    where: {
      userId,
      OR: [
        { createdAt: { gte: from, lt: to } },
        { completedAt: { gte: from, lt: to } },
        { updates: { some: { occurredAt: { gte: from, lt: to } } } },
        { kind: EntryKind.Task, status: FollowUpStatus.Open, dueDate: { lt: to } },
      ],
    },
    orderBy: [{ pinned: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      kind: true,
      person: true,
      subject: true,
      ticketKey: true,
      status: true,
      pinned: true,
      tags: true,
      dueDate: true,
      completedAt: true,
      createdAt: true,
      updates: {
        where: { occurredAt: { gte: from, lt: to } },
        orderBy: { occurredAt: "asc" },
        select: { id: true, note: true, fromThem: true, occurredAt: true },
      },
    },
    take: 300,
  });
}

export async function rescheduleFollowUp(
  userId: string,
  followUpId: string,
  dueDate: Date | null,
) {
  const result = await prisma.followUp.updateMany({
    where: { id: followUpId, userId },
    data: { dueDate },
  });
  if (result.count === 0) return null;
  return getFollowUp(userId, followUpId);
}

export async function deleteFollowUp(userId: string, followUpId: string) {
  const result = await prisma.followUp.deleteMany({
    where: { id: followUpId, userId },
  });
  return result.count > 0;
}

export async function getFollowUp(userId: string, followUpId: string) {
  return prisma.followUp.findFirst({
    where: { id: followUpId, userId },
    select: FOLLOW_UP_SELECT,
  });
}

export async function listFollowUps(userId: string) {
  return prisma.followUp.findMany({
    where: { userId },
    // Undated threads sort last within their group; the UI regroups anyway,
    // but a stable order keeps the lists from jumping between renders.
    orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
    select: FOLLOW_UP_SELECT,
  });
}

/** Every distinct person you have logged, for the create form's datalist. */
export async function listFollowUpPeople(userId: string) {
  const rows = await prisma.followUp.findMany({
    where: { userId, person: { not: null } },
    distinct: ["person"],
    orderBy: { updatedAt: "desc" },
    select: { person: true },
    take: 50,
  });
  return rows
    .map((row) => row.person)
    .filter((person): person is string => Boolean(person));
}

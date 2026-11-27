import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { EntryKind, FollowUpStatus } from "@/generated/prisma/enums";
import { withEffectiveDue } from "@/lib/tracker-rules";
import { docFileIds, docToText, TODO_STATUS_NOTES } from "@/lib/rich-text";
import { getPeopleList } from "@/lib/user-lists";

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
  /** Rich text (TipTap JSON); when given, `note` is derived from it. */
  doc?: unknown;
  channel?: string;
  /** When that first conversation happened. Defaults to now. */
  occurredAt?: Date | null;
  /** The first message is something THEY told you ("They told me"). FollowUp only. */
  fromThem?: boolean;
  /** Labels — used by Notes. Normalised by `normalizeTags`. */
  tags?: string[];
  /** A personal to-do (sticky note). Only kept on a Task. */
  personal?: boolean;
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
  doc: true,
  editedAt: true,
  createdAt: true,
  // How many earlier versions an edit has kept; the versions load on demand.
  _count: { select: { revisions: true } },
} satisfies Prisma.FollowUpUpdateSelect;

/** Rich text in, plain text alongside: the doc is stored, `note` is what everything else reads. */
function noteFields(input: { note?: string; doc?: unknown }) {
  const doc = input.doc && typeof input.doc === "object" ? (input.doc as Prisma.InputJsonValue) : undefined;
  return { note: (doc ? docToText(doc) : input.note ?? "").trim(), doc };
}

/** Claim the uploads a saved doc points at, so they belong to (and are deleted with) the entry. */
async function linkFiles(userId: string, followUpId: string, doc: unknown) {
  const ids = docFileIds(doc);
  if (!ids.length) return;
  await prisma.followUpFile.updateMany({ where: { id: { in: ids }, userId }, data: { followUpId } });
}

/** One uploaded image/file, before it's in any saved update. */
export async function addTrackerFiles(userId: string, files: Array<{ name: string; mimeType: string; bytes: Uint8Array<ArrayBuffer> }>) {
  return prisma.$transaction(
    files.map((file) =>
      prisma.followUpFile.create({
        data: { userId, name: file.name, mimeType: file.mimeType, size: file.bytes.byteLength, data: file.bytes },
        select: { id: true, name: true, mimeType: true, size: true },
      }),
    ),
  );
}

/** The owner's file, for download. */
export async function getTrackerFile(userId: string, fileId: string) {
  return prisma.followUpFile.findFirst({ where: { id: fileId, userId }, select: { name: true, mimeType: true, data: true } });
}

const FOLLOW_UP_SELECT = {
  id: true,
  kind: true,
  person: true,
  subject: true,
  ticketKey: true,
  status: true,
  pinned: true,
  tags: true,
  personal: true,
  dueDate: true,
  completedAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  updates: {
    // Newest first: the last thing you said is the thing you need to see.
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    select: UPDATE_SELECT,
  },
} satisfies Prisma.FollowUpSelect;

export async function createFollowUp(userId: string, input: FollowUpInput) {
  const { note, doc } = noteFields(input);

  const created = await prisma.followUp.create({
    data: {
      userId,
      kind: input.kind ?? EntryKind.FollowUp,
      // A Task is yours; a FollowUp is addressed to someone, and a Note may name
      // who it's with (Minutes of Meeting, 2026-11-21).
      person:
        (input.kind ?? EntryKind.FollowUp) !== EntryKind.Task
          ? (input.person?.trim() || null)
          : null,
      // A note dated to another day (a MoM written up later) is "added" that day.
      ...(input.kind === EntryKind.Note && input.occurredAt ? { createdAt: input.occurredAt } : {}),
      subject: input.subject.trim(),
      ticketKey: input.ticketKey?.trim() || null,
      dueDate: input.dueDate ?? null,
      tags: normalizeTags(input.tags),
      personal: (input.kind ?? EntryKind.FollowUp) === EntryKind.Task && Boolean(input.personal),
      // A first note is written as a real update row, not as a field on the
      // thread, so day one is history in exactly the same shape as day ten.
      ...(note || doc
        ? {
            updates: {
              create: {
                userId,
                note,
                doc,
                channel: input.channel ?? "Slack",
                occurredAt: input.occurredAt ?? new Date(),
                fromThem: (input.kind ?? EntryKind.FollowUp) === EntryKind.FollowUp && Boolean(input.fromThem),
              },
            },
          }
        : {}),
    },
    select: FOLLOW_UP_SELECT,
  });
  await linkFiles(userId, created.id, doc);
  return created;
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
    doc?: unknown;
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
      ...noteFields(input),
      channel: input.channel ?? "Slack",
      occurredAt: input.occurredAt ?? new Date(),
      fromThem: input.fromThem ?? false,
    },
  });

  await linkFiles(userId, followUpId, input.doc);

  // Touch the thread so "recently active" ordering stays honest.
  await prisma.followUp.updateMany({
    where: { id: followUpId, userId },
    data: { updatedAt: new Date() },
  });

  return getFollowUp(userId, followUpId);
}

/**
 * Rewrite one recorded message's text (owner's call, 2026-11-21 — the one
 * exception to append-only follow-up history). Only the words change; who
 * spoke, the channel and when stay as recorded, and `editedAt` marks it.
 */
export async function editFollowUpUpdate(
  userId: string,
  updateId: string,
  input: { note: string; doc?: unknown },
) {
  const existing = await prisma.followUpUpdate.findFirst({
    where: { id: updateId, userId },
    select: { followUpId: true, note: true, doc: true },
  });
  if (!existing) return null;

  const fields = noteFields(input);
  // An edit that changes nothing keeps no revision and no "edited" mark.
  if (fields.note === existing.note && JSON.stringify(fields.doc ?? null) === JSON.stringify(existing.doc ?? null)) {
    return getFollowUp(userId, existing.followUpId);
  }
  // The text as it stood goes into the revision history first, in the same
  // transaction, so an edit can never lose what it replaced.
  await prisma.$transaction([
    prisma.followUpUpdateRevision.create({
      data: {
        updateId,
        userId,
        note: existing.note,
        doc: existing.doc === null ? Prisma.DbNull : (existing.doc as Prisma.InputJsonValue),
      },
    }),
    prisma.followUpUpdate.update({
      where: { id: updateId },
      data: { note: fields.note, doc: fields.doc ?? Prisma.DbNull, editedAt: new Date() },
    }),
  ]);
  await linkFiles(userId, existing.followUpId, input.doc);
  return getFollowUp(userId, existing.followUpId);
}

/** Earlier versions of one message/note entry, newest first (the owner's only). */
export async function listUpdateRevisions(userId: string, updateId: string) {
  const owned = await prisma.followUpUpdate.findFirst({ where: { id: updateId, userId }, select: { id: true } });
  if (!owned) return null;
  return prisma.followUpUpdateRevision.findMany({
    where: { updateId, userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, note: true, doc: true, createdAt: true },
  });
}

export async function setFollowUpStatus(
  userId: string,
  followUpId: string,
  status: FollowUpStatus,
) {
  const before = await prisma.followUp.findFirst({
    where: { id: followUpId, userId },
    select: { kind: true, status: true },
  });
  if (!before) return null;

  const now = new Date();
  await prisma.followUp.updateMany({
    where: { id: followUpId, userId },
    data: {
      status,
      completedAt: status === FollowUpStatus.Done ? now : null,
    },
  });

  // A to-do's timeline keeps every done/reopen with its date. `completedAt`
  // alone is cleared by a reopen, so the history would be lost.
  if (before.kind === EntryKind.Task && before.status !== status) {
    await prisma.followUpUpdate.create({
      data: {
        followUpId,
        userId,
        note: status === FollowUpStatus.Done ? TODO_STATUS_NOTES.done : TODO_STATUS_NOTES.reopened,
        channel: "Other",
        occurredAt: now,
        fromThem: false,
      },
    });
  }
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

/** Archive / restore an entry. Archiving leaves its status alone, so a restore puts it back as it was. */
export async function setFollowUpArchived(userId: string, followUpId: string, archived: boolean) {
  const result = await prisma.followUp.updateMany({
    where: { id: followUpId, userId },
    data: { archivedAt: archived ? new Date() : null },
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
 * Rewrite a sticky note's text. Only a personal to-do: its text is a scribble,
 * not a record, and its timeline (done / reopened, notes) is left untouched.
 */
export async function editPersonalTodo(userId: string, followUpId: string, subject: string) {
  const result = await prisma.followUp.updateMany({
    where: { id: followUpId, userId, kind: EntryKind.Task, personal: true },
    data: { subject },
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
      // Work Logs are about work; personal to-dos stay on the Tracker.
      personal: false,
      OR: [
        { completedAt: { gte: from, lt: to } },
        {
          dueDate: { lte: day },
          OR: [{ status: FollowUpStatus.Open, archivedAt: null }, { completedAt: { gte: from } }],
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
      personal: false,
      OR: [
        { createdAt: { gte: from, lt: to } },
        { completedAt: { gte: from, lt: to } },
        { updates: { some: { occurredAt: { gte: from, lt: to } } } },
        { kind: EntryKind.Task, status: FollowUpStatus.Open, archivedAt: null, dueDate: { lt: to } },
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

/** Change when an entry counts as added (its `createdAt`). Its history rows are untouched. */
export async function setFollowUpAdded(userId: string, followUpId: string, createdAt: Date) {
  const result = await prisma.followUp.updateMany({
    where: { id: followUpId, userId },
    data: { createdAt },
  });
  if (result.count === 0) return null;
  return getFollowUp(userId, followUpId);
}

/** Who a note is with (Minutes of Meeting). Notes only; null clears it. */
export async function setNotePerson(userId: string, followUpId: string, person: string | null) {
  const result = await prisma.followUp.updateMany({
    where: { id: followUpId, userId, kind: EntryKind.Note },
    data: { person: person?.trim() || null },
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

/** Reads apply the effective reminder (`lib/tracker-rules.ts`); writes store what was picked. */
export async function getFollowUp(userId: string, followUpId: string) {
  const entry = await prisma.followUp.findFirst({
    where: { id: followUpId, userId },
    select: FOLLOW_UP_SELECT,
  });
  return entry ? withEffectiveDue(entry) : null;
}

export async function listFollowUps(userId: string) {
  return prisma.followUp.findMany({
    where: { userId },
    // Undated threads sort last within their group; the UI regroups anyway,
    // but a stable order keeps the lists from jumping between renders.
    orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
    select: FOLLOW_UP_SELECT,
  }).then((rows) => rows.map(withEffectiveDue));
}

/** Who-field suggestions: people you have logged plus those saved in Profile → People. */
export async function listFollowUpPeople(userId: string) {
  const [rows, list] = await Promise.all([
    prisma.followUp.findMany({
      where: { userId, person: { not: null } },
      distinct: ["person"],
      orderBy: { updatedAt: "desc" },
      select: { person: true },
      take: 50,
    }),
    getPeopleList(userId),
  ]);
  // Most recent first, then names saved in Profile; names removed there are not suggested.
  const hidden = new Set(list.hidden.map((name) => name.toLowerCase()));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of [...rows.map((row) => row.person), ...list.saved]) {
    const key = name?.trim().toLowerCase();
    if (!name || !key || hidden.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(name.trim());
  }
  return out;
}

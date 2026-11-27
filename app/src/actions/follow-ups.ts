"use server";

import { revalidatePath } from "next/cache";

import * as followUps from "@/lib/follow-ups";
import { notFound, ok, parseOrFail } from "@/lib/result";
import { requireUserId } from "@/lib/session";
import {
  addFollowUpUpdateSchema,
  createFollowUpSchema,
  deleteFollowUpSchema,
  editFollowUpUpdateSchema,
  editPersonalTodoSchema,
  listUpdateRevisionsSchema,
  rescheduleFollowUpSchema,
  setFollowUpAddedSchema,
  setFollowUpArchivedSchema,
  setFollowUpPinnedSchema,
  setFollowUpStatusSchema,
  setFollowUpTagsSchema,
  setNotePersonSchema,
  todosForDaySchema,
  trackerForRangeSchema,
} from "@/lib/validation";

/**
 * Follow-ups server actions.
 *
 * `editFollowUpUpdate` rewrites a recorded message's text only; who spoke, the
 * channel and the date stay as recorded, and the text it replaced is kept as a
 * revision (`listUpdateRevisions`).
 */

export async function createFollowUp(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(createFollowUpSchema, input);
  if (!parsed.ok) return parsed;

  const followUp = await followUps.createFollowUp(userId, parsed.data);
  revalidatePath("/tracker");
  return ok(followUp);
}

export async function addFollowUpUpdate(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(addFollowUpUpdateSchema, input);
  if (!parsed.ok) return parsed;

  const { followUpId, ...rest } = parsed.data;
  const followUp = await followUps.addFollowUpUpdate(userId, followUpId, rest);
  if (!followUp) return notFound("Follow-up not found");

  revalidatePath("/tracker");
  return ok(followUp);
}

export async function editFollowUpUpdate(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(editFollowUpUpdateSchema, input);
  if (!parsed.ok) return parsed;

  const { updateId, ...rest } = parsed.data;
  const followUp = await followUps.editFollowUpUpdate(userId, updateId, rest);
  if (!followUp) return notFound("Message not found");

  revalidatePath("/tracker");
  return ok(followUp);
}

/** The versions an entry had before it was edited. Input: { updateId } */
export async function listUpdateRevisions(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(listUpdateRevisionsSchema, input);
  if (!parsed.ok) return parsed;
  const revisions = await followUps.listUpdateRevisions(userId, parsed.data.updateId);
  if (!revisions) return notFound("Entry not found");
  return ok(revisions.map((revision) => ({ ...revision, createdAt: revision.createdAt.toISOString() })));
}

/** Who a note is with (Minutes of Meeting). Input: { followUpId, person | null } */
export async function setNotePerson(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(setNotePersonSchema, input);
  if (!parsed.ok) return parsed;
  const note = await followUps.setNotePerson(userId, parsed.data.followUpId, parsed.data.person);
  if (!note) return notFound("Note not found");
  revalidatePath("/tracker");
  return ok(note);
}

/** Archive / restore. Input: { followUpId, archived } */
export async function setFollowUpArchived(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(setFollowUpArchivedSchema, input);
  if (!parsed.ok) return parsed;
  const followUp = await followUps.setFollowUpArchived(userId, parsed.data.followUpId, parsed.data.archived);
  if (!followUp) return notFound("Entry not found");
  revalidatePath("/tracker");
  revalidatePath("/favourites");
  return ok(followUp);
}

/** Mark / unmark as important. Input: { followUpId, pinned } */
export async function setFollowUpPinned(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(setFollowUpPinnedSchema, input);
  if (!parsed.ok) return parsed;
  const followUp = await followUps.setFollowUpPinned(userId, parsed.data.followUpId, parsed.data.pinned);
  if (!followUp) return notFound("Entry not found");
  revalidatePath("/tracker");
  return ok(followUp);
}

/** Replace a note's tags. Input: { followUpId, tags } */
export async function setFollowUpTags(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(setFollowUpTagsSchema, input);
  if (!parsed.ok) return parsed;
  const followUp = await followUps.setFollowUpTags(userId, parsed.data.followUpId, parsed.data.tags);
  if (!followUp) return notFound("Entry not found");
  revalidatePath("/tracker");
  return ok(followUp);
}

/** Rewrite a sticky note's text. Input: { followUpId, subject } */
export async function editPersonalTodo(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(editPersonalTodoSchema, input);
  if (!parsed.ok) return parsed;
  const followUp = await followUps.editPersonalTodo(userId, parsed.data.followUpId, parsed.data.subject);
  if (!followUp) return notFound("Personal to-do not found");
  revalidatePath("/tracker");
  return ok(followUp);
}

/** To-dos finished or overdue on a work log's day. Input: { date: "YYYY-MM-DD" } */
export async function listTodosForDay(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(todosForDaySchema, input);
  if (!parsed.ok) return parsed;
  if (!parsed.data.date) return ok([]);
  return ok(await followUps.listTodosAroundDay(userId, parsed.data.date));
}

/** Tracker entries active in a window (Work Logs' day cards). Input: { from, to } */
export async function listTrackerForRange(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(trackerForRangeSchema, input);
  if (!parsed.ok) return parsed;
  return ok(await followUps.listTrackerForRange(userId, parsed.data.from, parsed.data.to));
}

export async function setFollowUpStatus(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(setFollowUpStatusSchema, input);
  if (!parsed.ok) return parsed;

  const followUp = await followUps.setFollowUpStatus(
    userId,
    parsed.data.followUpId,
    parsed.data.status,
  );
  if (!followUp) return notFound("Follow-up not found");

  revalidatePath("/tracker");
  return ok(followUp);
}

export async function rescheduleFollowUp(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(rescheduleFollowUpSchema, input);
  if (!parsed.ok) return parsed;

  const followUp = await followUps.rescheduleFollowUp(
    userId,
    parsed.data.followUpId,
    parsed.data.dueDate,
  );
  if (!followUp) return notFound("Follow-up not found");

  revalidatePath("/tracker");
  return ok(followUp);
}

export async function setFollowUpAdded(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(setFollowUpAddedSchema, input);
  if (!parsed.ok) return parsed;

  const followUp = await followUps.setFollowUpAdded(userId, parsed.data.followUpId, parsed.data.createdAt);
  if (!followUp) return notFound("Entry not found");

  // The added day feeds Work Logs, reports and Favourites as well as the Tracker.
  revalidatePath("/tracker");
  revalidatePath("/work-logs");
  revalidatePath("/favourites");
  return ok(followUp);
}

export async function deleteFollowUp(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(deleteFollowUpSchema, input);
  if (!parsed.ok) return parsed;

  const removed = await followUps.deleteFollowUp(userId, parsed.data.followUpId);
  if (!removed) return notFound("Follow-up not found");

  revalidatePath("/tracker");
  return ok({ deleted: true });
}

export async function listFollowUps() {
  const userId = await requireUserId();
  return ok(await followUps.listFollowUps(userId));
}

export async function listFollowUpPeople() {
  const userId = await requireUserId();
  return ok(await followUps.listFollowUpPeople(userId));
}

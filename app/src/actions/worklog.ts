"use server";

import { revalidatePath } from "next/cache";

import { requireUserId } from "@/lib/session";
import { aiFailureMessage } from "@/lib/ai-summary";
import { getUserSettings } from "@/lib/user-settings";
import { fail, notFound, ok, parseOrFail } from "@/lib/result";
import {
  addMeeting,
  deleteMeeting as deleteMeetingRow,
  deleteWorkLog as deleteWorkLogRow,
  getOrCreateWorkLog,
  getWorkLogByDate,
  getWorkLogById,
  listWorkLogs as listWorkLogsQuery,
  getAdjacentWorkLogs as getAdjacentWorkLogsQuery,
  todayUtc,
  updateWorkLogDetails,
  saveLearningNotesRow,
  saveWorkLogSummaryRow,
  addLinkAttachment,
  deleteAttachmentRow,
  updateMeeting as updateMeetingRow,
} from "@/lib/worklogs";
import {
  createMeetingSchema,
  deleteMeetingSchema,
  deleteWorkLogSchema,
  updateMeetingSchema,
  updateWorkLogSchema,
  workLogDateSchema,
  saveLearningNotesSchema,
  generateWorkLogSummarySchema,
  addWorkLogLinkSchema,
  deleteWorkLogAttachmentSchema,
} from "@/lib/validation";

/**
 * Work log server actions.
 *
 * Every one starts with `requireUserId()` and passes that id down. No action
 * accepts a userId from the client.
 */

function revalidateWorkLog(workLogId?: string) {
  revalidatePath("/work-logs");
  if (workLogId) {
    revalidatePath(`/work-logs/${workLogId}`);
    revalidatePath(`/work-logs/${workLogId}/edit`);
  }
}

/** Open (or create) a dated work log. Input: { date, title?, dayType? } — dayType applies on create. */
export async function openWorkLogForDate(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(workLogDateSchema, input);
  if (!parsed.ok) return parsed;
  // Logs record what happened — only today and past days can be logged.
  if (parsed.data.date.getTime() > todayUtc().getTime()) {
    return fail("VALIDATION_ERROR", "You can't log a future date");
  }

  const existing = await getWorkLogByDate(userId, parsed.data.date);
  if (existing) {
    revalidateWorkLog(existing.id);
    return ok(existing);
  }
  if (parsed.data.date.getUTCDay() === 0 || parsed.data.date.getUTCDay() === 6) {
    return fail("VALIDATION_ERROR", "Work logs can only be created on weekdays");
  }

  const workLog = await getOrCreateWorkLog(
    userId,
    parsed.data.date,
    parsed.data.title,
    parsed.data.dayType,
  );
  revalidateWorkLog(workLog.id);
  return ok(workLog);
}

/** Read-only fetch. Returns NOT_FOUND for someone else's id. */
export async function getWorkLog(workLogId: string) {
  const userId = await requireUserId();
  const workLog = await getWorkLogById(userId, workLogId);
  if (!workLog) return notFound("Work log not found");
  return ok(workLog);
}

export async function getAdjacentWorkLogs(workLogId: string) {
  const userId = await requireUserId();
  const adjacent = await getAdjacentWorkLogsQuery(userId, workLogId);
  if (!adjacent) return notFound("Work log not found");
  return ok(adjacent);
}

export async function listWorkLogs(options?: {
  search?: string;
  from?: string;
  to?: string;
  ticketId?: string;
  take?: number;
  skip?: number;
}) {
  const userId = await requireUserId();
  return ok(
    await listWorkLogsQuery(userId, {
      search: options?.search?.trim() || undefined,
      from: options?.from ? new Date(`${options.from}T00:00:00.000Z`) : undefined,
      to: options?.to ? new Date(`${options.to}T00:00:00.000Z`) : undefined,
      ticketId: options?.ticketId,
      take: options?.take,
      skip: options?.skip,
    }),
  );
}

/** Update the work-log title and/or day type. Input: { workLogId, title?, dayType? } */
export async function updateWorkLog(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(updateWorkLogSchema, input);
  if (!parsed.ok) return parsed;

  const { workLogId, title, dayType } = parsed.data;
  if (title === undefined && dayType === undefined) return fail("VALIDATION_ERROR", "Nothing to update");

  const workLog = await updateWorkLogDetails(userId, workLogId, { title, dayType });
  if (!workLog) return notFound("Work log not found");

  revalidateWorkLog(workLogId);
  return ok(workLog);
}

/** Deletes the log + its meetings + its ticket updates. Tickets are kept. */
export async function deleteWorkLog(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(deleteWorkLogSchema, input);
  if (!parsed.ok) return parsed;

  const removed = await deleteWorkLogRow(userId, parsed.data.workLogId);
  if (!removed) return notFound("Work log not found");

  revalidateWorkLog();
  return ok({ deleted: true });
}

// --- meetings ---------------------------------------------------------------

/** "+ Add Meeting". Input: { workLogId, name, notes? } */
export async function createMeeting(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(createMeetingSchema, input);
  if (!parsed.ok) return parsed;

  const { workLogId, name, notes } = parsed.data;
  const meeting = await addMeeting(userId, workLogId, name, notes);
  if (!meeting) return notFound("Work log not found");

  revalidateWorkLog(workLogId);
  return ok(meeting);
}

/**
 * Autosave target for meeting notes. Input: { meetingId, name?, notes? }
 * Idempotent — safe to call on every debounce tick.
 */
export async function updateMeeting(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(updateMeetingSchema, input);
  if (!parsed.ok) return parsed;

  const { meetingId, name, notes } = parsed.data;
  const meeting = await updateMeetingRow(userId, meetingId, { name, notes });
  if (!meeting) return notFound("Meeting not found");

  return ok({ ...meeting, savedAt: new Date() });
}

export async function deleteMeeting(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(deleteMeetingSchema, input);
  if (!parsed.ok) return parsed;

  const removed = await deleteMeetingRow(userId, parsed.data.meetingId);
  if (!removed) return notFound("Meeting not found");

  revalidateWorkLog();
  return ok({ deleted: true });
}

/** Autosave the day's learning / upskilling notes. Input: { workLogId, notes } */
export async function saveLearningNotes(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(saveLearningNotesSchema, input);
  if (!parsed.ok) return parsed;
  const saved = await saveLearningNotesRow(userId, parsed.data.workLogId, parsed.data.notes);
  if (!saved) return notFound("Work log not found");
  return ok({ savedAt: new Date() });
}

/**
 * (Re)generate and store the log's summary. Input: { workLogId, auto?, tzOffset? } —
 * `auto` only fills a missing summary (the one-time generate on first view).
 */
export async function generateWorkLogSummary(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(generateWorkLogSummarySchema, input);
  if (!parsed.ok) return parsed;
  const { ticketsEnabled } = await getUserSettings(userId);
  const saved = await saveWorkLogSummaryRow(userId, parsed.data.workLogId, ticketsEnabled, { mode: parsed.data.auto ? "auto" : "manual", tzOffset: parsed.data.tzOffset });
  if (!saved) return notFound("Work log not found");
  if (!saved.ok) {
    return fail("AI_UNAVAILABLE", saved.reason === "empty" ? "Nothing to summarise yet — add tickets, work done, or to-dos, follow-ups or notes for this day first." : aiFailureMessage({ reason: saved.reason, model: saved.model }));
  }
  revalidateWorkLog(parsed.data.workLogId);
  return ok(saved);
}

/** Add a link to a work log. Input: { workLogId, url, label? } */
export async function addWorkLogLink(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(addWorkLogLinkSchema, input);
  if (!parsed.ok) return parsed;
  const link = await addLinkAttachment(userId, parsed.data.workLogId, { url: parsed.data.url, label: parsed.data.label });
  if (!link) return notFound("Work log not found");
  revalidateWorkLog(parsed.data.workLogId);
  return ok(link);
}

/** Remove a file or link from a work log. Input: { attachmentId } */
export async function deleteWorkLogAttachment(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(deleteWorkLogAttachmentSchema, input);
  if (!parsed.ok) return parsed;
  const removed = await deleteAttachmentRow(userId, parsed.data.attachmentId);
  if (!removed) return notFound("Attachment not found");
  revalidateWorkLog();
  return ok({ deleted: true });
}

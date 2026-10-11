"use server";

import { revalidatePath } from "next/cache";

import { aiFailureMessage } from "@/lib/ai-summary";
import * as quickLog from "@/lib/quick-log";
import { fail, ok, parseOrFail } from "@/lib/result";
import { requireUserId } from "@/lib/session";
import { applyQuickLogSchema, draftQuickLogSchema, quickLogTemplateSchema } from "@/lib/validation";

/**
 * Quick log server actions: read pasted text into a draft (no writes), then
 * apply the reviewed draft. See lib/quick-log.ts for the rules.
 */

/** Input: { kind, text, date, today } → a draft to review. */
export async function draftQuickLog(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(draftQuickLogSchema, input);
  if (!parsed.ok) return parsed;

  const result = await quickLog.draftQuickLog(userId, parsed.data);
  if (!result.ok) return fail("AI_UNAVAILABLE", aiFailureMessage(result));
  return ok(result.draft);
}

/** Input: { date } → a work-log starting text with the user's meetings and open tickets. */
export async function getWorkLogTemplate(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(quickLogTemplateSchema, input);
  if (!parsed.ok) return parsed;
  return ok(await quickLog.workLogTemplate(userId, parsed.data.date));
}

/** Input: the reviewed draft (see applyQuickLogSchema). */
export async function applyQuickLog(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(applyQuickLogSchema, input);
  if (!parsed.ok) return parsed;

  const result = await quickLog.applyQuickLog(userId, parsed.data);
  if (!result.ok) return fail("VALIDATION_ERROR", result.message);

  const { workLogId } = result.data;
  revalidatePath("/tracker");
  if (workLogId) {
    revalidatePath("/work-logs");
    revalidatePath(`/work-logs/${workLogId}`);
    revalidatePath(`/work-logs/${workLogId}/edit`);
    revalidatePath("/tickets");
  }
  return ok(result.data);
}

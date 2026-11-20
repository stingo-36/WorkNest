"use server";

import { revalidatePath } from "next/cache";

import { disconnectGmail as disconnect, getGmailStatus, saveGmailRule as saveRule, syncGmail, undoGmailImport as undoImport } from "@/lib/gmail";
import { fail, notFound, ok, parseOrFail } from "@/lib/result";
import { requireUserId } from "@/lib/session";
import { saveGmailRuleSchema, undoGmailImportSchema } from "@/lib/validation";

/** Profile → Gmail import → Check now. Returns how many resources were added. */
export async function syncGmailNow() {
  const userId = await requireUserId();
  try {
    const result = await syncGmail(userId);
    if (!result) return fail("NOT_FOUND", "Connect Gmail first");
    revalidatePath("/resources", "layout");
    return ok({ ...result, status: await getGmailStatus(userId) });
  } catch (error) {
    return fail("INTERNAL_ERROR", error instanceof Error ? error.message : "Gmail import failed");
  }
}

/** Input: { label, resourceType } */
export async function saveGmailRule(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(saveGmailRuleSchema, input);
  if (!parsed.ok) return parsed;
  if (!(await saveRule(userId, parsed.data))) return notFound("Connect Gmail first");
  revalidatePath("/resources", "layout");
  return ok(await getGmailStatus(userId));
}

export async function disconnectGmail() {
  const userId = await requireUserId();
  await disconnect(userId);
  revalidatePath("/resources", "layout");
  return ok(await getGmailStatus(userId));
}

/** Resources → "N added from Gmail · Undo". Input: { messageId } */
export async function undoGmailImport(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(undoGmailImportSchema, input);
  if (!parsed.ok) return parsed;
  const removed = await undoImport(userId, parsed.data.messageId);
  revalidatePath("/resources", "layout");
  revalidatePath("/favourites");
  return ok({ removed });
}

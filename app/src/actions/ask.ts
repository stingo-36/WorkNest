"use server";

import * as ask from "@/lib/ask";
import { fail, ok, parseOrFail } from "@/lib/result";
import { requireUserId } from "@/lib/session";
import { askWorkspaceSchema } from "@/lib/validation";

/**
 * Ask your workspace. Answers from the signed-in user's own records (see
 * lib/ask.ts) and changes nothing: Tracker items it drafts come back as
 * `proposals`, which the chat adds through `createFollowUp` only when clicked,
 * and a pasted document comes back as a `notebook` plan saved by `importNotebook`.
 * Input: { question, history: [{ question, answer }], today: "YYYY-MM-DD" }.
 */
export async function askWorkspace(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(askWorkspaceSchema, input);
  if (!parsed.ok) return parsed;

  const result = await ask.askWorkspace(userId, parsed.data);
  if (!result.ok) return fail("AI_UNAVAILABLE", result.message);
  return ok({ answer: result.answer, sources: result.sources, proposals: result.proposals, notebook: result.notebook ?? null });
}

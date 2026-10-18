"use server";

import * as ask from "@/lib/ask";
import { fail, ok, parseOrFail } from "@/lib/result";
import { requireUserId } from "@/lib/session";
import { askWorkspaceSchema } from "@/lib/validation";

/**
 * Ask your workspace. Read-only: answers a question from the signed-in user's
 * own records (see lib/ask.ts) and changes nothing.
 * Input: { question, history: [{ question, answer }], today: "YYYY-MM-DD" }.
 */
export async function askWorkspace(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(askWorkspaceSchema, input);
  if (!parsed.ok) return parsed;

  const result = await ask.askWorkspace(userId, parsed.data);
  if (!result.ok) return fail("AI_UNAVAILABLE", result.message);
  return ok({ answer: result.answer, sources: result.sources });
}

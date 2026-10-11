"use server";

import { revalidatePath } from "next/cache";

import { aiFailureMessage } from "@/lib/ai-summary";
import { generateSprintReport, resolveSprint } from "@/lib/reports";
import { fail, ok, parseOrFail } from "@/lib/result";
import { requireUser } from "@/lib/session";
import { getUserSettings } from "@/lib/user-settings";
import { generateReportSchema } from "@/lib/validation";

/** (Re)generate the "5-15 Report" for one sprint. Input: { sprint: "YYYY-MM-DD" } */
export async function generateReport(input: unknown) {
  const user = await requireUser();
  const parsed = parseOrFail(generateReportSchema, input);
  if (!parsed.ok) return parsed;
  const settings = await getUserSettings(user.id);
  const sprint = resolveSprint(parsed.data.sprint, settings.sprint);
  const result = await generateSprintReport(user.id, {
    start: sprint.start,
    end: sprint.end,
    name: settings.name || user.name || user.email || "My",
    ticketsEnabled: settings.ticketsEnabled,
  });
  if (!result.ok) {
    return fail("AI_UNAVAILABLE", result.reason === "empty" ? "No work days logged in this sprint yet." : aiFailureMessage({ reason: result.reason, model: result.model }));
  }
  revalidatePath("/reports");
  return ok({ generatedAt: result.generatedAt, model: result.model });
}

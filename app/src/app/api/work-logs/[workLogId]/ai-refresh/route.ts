import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { getCurrentUser } from "@/lib/session";
import { getUserSettings } from "@/lib/user-settings";
import { refreshWorkLogAiSchema } from "@/lib/validation";
import { saveWorkLogSummaryRow } from "@/lib/worklogs";

// The AI call (and one retry) can take a while; it runs after the response.
export const maxDuration = 120;

/** Lets the editor's last autosaves land before the log is read. */
const SETTLE_MS = 2500;

/**
 * Leave-the-editor beacon (2026-10-09): when the user closes or leaves a log's
 * editor, `navigator.sendBeacon` posts here. We answer at once and, after the
 * response, regenerate the AI summary (and an auto title) — but only if the
 * text the AI reads changed since last time (see `saveWorkLogSummaryRow`).
 * A route handler, not a server action: a beacon can't call an action.
 */
export async function POST(request: Request, { params }: { params: Promise<{ workLogId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const { workLogId } = await params;
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // An empty beacon is fine: the timezone defaults to UTC.
  }
  const parsed = refreshWorkLogAiSchema.safeParse({ ...(body as object), workLogId });
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });

  after(async () => {
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    const { ticketsEnabled } = await getUserSettings(user.id);
    const result = await saveWorkLogSummaryRow(user.id, workLogId, ticketsEnabled, { mode: "background", tzOffset: parsed.data.tzOffset });
    if (!result?.ok) {
      if (result && result.reason !== "empty" && result.reason !== "not_configured") console.warn(`[ai] background refresh of ${workLogId} failed: ${result.reason}`);
      return;
    }
    if (result.unchanged) return;
    revalidatePath("/work-logs");
    revalidatePath(`/work-logs/${workLogId}`);
  });

  return new Response(null, { status: 202 });
}

import "server-only";

/**
 * AI text via OpenRouter (OpenAI-compatible chat API, plain fetch): work-log
 * summaries and titles here, sprint reports in lib/reports.ts.
 * The key and models come from lib/ai-settings.ts (the user's Profile key, else
 * OPENROUTER_API_KEY). There is deliberately NO non-AI fallback (the user asked
 * for AI or nothing): failures come back as an `AiFailure` the UI explains.
 */

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 90_000;
const MAX_INPUT_CHARS = 16_000;

// Everything in the log, one line per item, scannable (owner, 2026-10-09: tickets,
// work done, to-dos, follow-ups and notes; meetings are not in the input).
const SYSTEM_PROMPT = `Summarise this developer's work log for one day so they can recall all of it at a glance.
Reply with ONLY Markdown bullet points ("- "), one per item, each under 20 words, at most 170 words in total.
Cover every section present, in this order: ticket work (start with the ticket key, e.g. "25917:"), other work done,
to-dos finished, to-dos still due or overdue (start those with "Overdue:" or "Due:"), follow-ups (who, about what, where it stands), notes.
No headings, no section labels, no intro or closing line, no reasoning. Merge repeated items.
Use only facts in the log.`;

/** Longer than this means the model ignored the brief (often it's its reasoning). */
const MAX_SUMMARY_CHARS = 1400;

// A log title in the style the owner writes by hand: "Indexing Issue Fixed | Field Limit Module Doc".
const TITLE_PROMPT = `Write a title for this developer's work day.
Reply with ONLY the title: the 1–3 most important pieces of work, each 2–5 words in Title Case, joined by " | ".
At most 70 characters. No quotes, no date, no ticket numbers, no trailing punctuation. Use only facts in the log.`;
// Reasoning models sometimes answer with their working instead of the answer.
const REASONING_LEAK = /thinking process|analy[sz]e the (request|input)|constraints?:|let's structure|output format:/i;

export type OpenRouterConfig = { apiKey: string; models: string[] };

/** Why an AI request produced nothing. There is no non-AI fallback, so the UI explains it. */
export type AiFailure = "not_configured" | "auth" | "credits" | "rate_limited" | "unavailable" | "cut_off" | "bad_reply";
/** `model` on a failure = the model whose reply was rejected, when there was one. */
export type AiResult = { ok: true; text: string; model: string } | { ok: false; reason: AiFailure; model?: string };

/** What to tell the user for each failure. */
export const AI_FAILURE_MESSAGE: Record<AiFailure, string> = {
  not_configured: "AI isn't set up. Add your OpenRouter key in Profile → Account.",
  auth: "OpenRouter rejected your API key. Check it in Profile → Account.",
  credits: "Your OpenRouter account has no credit left for this model.",
  rate_limited: "The free AI models are busy or today's free limit is used up. Try again in a few minutes.",
  unavailable: "Couldn't reach the AI right now. Try again shortly.",
  cut_off: "The AI stopped before finishing — common with small or “thinking” free models. Try again, or set a stronger model in Profile → Account.",
  bad_reply: "The AI's reply didn't follow the expected format. Try again, or set a stronger model in Profile → Account.",
};

/** The message for a failure, naming the model that answered when there was one. */
export function aiFailureMessage({ reason, model }: { reason: AiFailure; model?: string }) {
  return `${AI_FAILURE_MESSAGE[reason]}${model ? ` (Model used: ${model}.)` : ""}`;
}

type CompleteOptions = {
  system: string;
  user: string;
  maxChars: number;
  maxTokens: number;
  accept?: (text: string) => string | null;
  /** Off for JSON replies: they echo the user's own notes, which may contain "constraints:" etc. `accept` validates them instead. */
  checkReasoning?: boolean;
};

/**
 * One chat completion with the guards every caller needs: a reply that was cut
 * off (`cut_off`), is longer than `maxChars`, reads like leaked reasoning, or is
 * rejected by the caller's `accept` (`bad_reply`) is never shown. Those two are
 * retried once — `openrouter/free` often lands on a different model the second time.
 * `accept` may also tidy the text (return the cleaned version) or return null to reject.
 */
export async function openRouterComplete(
  config: OpenRouterConfig,
  options: CompleteOptions,
): Promise<AiResult> {
  const first = await completeOnce(config, options);
  if (first.ok || (first.reason !== "cut_off" && first.reason !== "bad_reply")) return first;
  const second = await completeOnce(config, options);
  return second.ok ? second : { ...second, model: second.model ?? first.model };
}

async function completeOnce(
  { apiKey, models }: OpenRouterConfig,
  { system, user, maxChars, maxTokens, accept, checkReasoning = true }: CompleteOptions,
): Promise<AiResult> {
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Title": "WorkNest" },
      body: JSON.stringify({
        model: models[0],
        // OpenRouter tries these in order when the first is down or rate-limited.
        ...(models.length > 1 ? { models } : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.2,
        // Room for a reasoning model to think; the answer itself is capped by the prompt + maxChars.
        max_tokens: maxTokens,
        // Keep any model reasoning out of the reply.
        reasoning: { exclude: true },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`[ai] OpenRouter ${response.status}: ${(await response.text()).slice(0, 300)}`);
      const reason: AiFailure =
        response.status === 401 || response.status === 403 ? "auth"
        : response.status === 402 ? "credits"
        : response.status === 429 ? "rate_limited"
        : "unavailable";
      return { ok: false, reason };
    }
    const json = (await response.json()) as { model?: string; choices?: Array<{ finish_reason?: string; message?: { content?: string | null } }> };
    const choice = json.choices?.[0];
    // Some free reasoning models inline their thinking; keep only the answer.
    const raw = choice?.message?.content?.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    const model = json.model ?? models[0]!;
    if (choice?.finish_reason === "length") {
      console.warn(`[ai] ${model} hit the token limit (${raw?.length ?? 0} chars)`);
      return { ok: false, reason: "cut_off", model };
    }
    const text = raw && raw.length <= maxChars && !(checkReasoning && REASONING_LEAK.test(raw)) ? (accept ? accept(raw) : raw) : null;
    if (!text) {
      console.warn(`[ai] Discarded reply from ${model} (${raw?.length ?? 0} chars): ${(raw ?? "").slice(0, 200).replace(/\n/g, " ⏎ ")}`);
      return { ok: false, reason: "bad_reply", model };
    }
    return { ok: true, text, model };
  } catch (error) {
    console.warn("[ai] OpenRouter request failed:", error instanceof Error ? error.message : error);
    return { ok: false, reason: "unavailable" };
  }
}

/** One-line title, tidied: quotes, "Title:" prefixes and a trailing full stop dropped. */
function acceptTitle(text: string) {
  const line = text.split("\n").map((part) => part.trim()).find(Boolean) ?? "";
  const title = line.replace(/^(title\s*:\s*)/i, "").replace(/^["'“”*#\s]+|["'“”*\s]+$/g, "").replace(/\.$/, "").trim();
  return title.length >= 3 && title.length <= 90 ? title : null;
}

/** A short title for one day, from the same plain text as the summary. */
export function titleWithOpenRouter(logText: string, config: OpenRouterConfig): Promise<AiResult> {
  return openRouterComplete(config, {
    system: TITLE_PROMPT,
    user: logText.slice(0, MAX_INPUT_CHARS),
    maxChars: 200,
    maxTokens: 1000,
    accept: acceptTitle,
  });
}

/** One day's summary from its plain-text log. */
export function summarizeWithOpenRouter(logText: string, config: OpenRouterConfig): Promise<AiResult> {
  return openRouterComplete(config, {
    system: SYSTEM_PROMPT,
    user: logText.slice(0, MAX_INPUT_CHARS),
    maxChars: MAX_SUMMARY_CHARS,
    maxTokens: 3000,
  });
}

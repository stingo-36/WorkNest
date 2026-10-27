import "server-only";

/**
 * AI text via OpenRouter (OpenAI-compatible chat API, plain fetch): work-log
 * summaries and titles here, sprint reports in lib/reports.ts.
 * The key and models come from lib/ai-settings.ts (the user's Profile key, else
 * OPENROUTER_API_KEY). When OpenRouter fails or has no key, the same request
 * goes to Groq (GROQ_API_KEY) as a backup — another AI, not a non-AI fallback.
 * There is deliberately NO non-AI fallback (the user asked for AI or nothing):
 * failures come back as an `AiFailure` the UI explains.
 */

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const TIMEOUT_MS = 90_000;
/** With Groq to fall back on, a hung OpenRouter isn't worth waiting the full 90 s for. */
const OPENROUTER_TIMEOUT_WITH_BACKUP_MS = 40_000;
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

export type GroqConfig = { apiKey: string; models: string[] };
/**
 * `apiKey` null = no OpenRouter key, Groq only. `skipOpenRouter` is set once
 * OpenRouter is down for this request, so an agent loop doesn't wait on it every step.
 */
export type OpenRouterConfig = { apiKey: string | null; models: string[]; groq: GroqConfig | null; skipOpenRouter?: boolean };

/** Where one request goes: OpenRouter with its model list, or Groq with one model. */
type Target = { provider: "openrouter"; apiKey: string; models: string[]; timeoutMs: number } | { provider: "groq"; apiKey: string; models: [string]; timeoutMs: number };

/** Failures that mean OpenRouter itself isn't working, as opposed to one bad reply. */
const PROVIDER_DOWN = new Set<AiFailure>(["auth", "credits", "rate_limited", "unavailable"]);

/**
 * Until when OpenRouter is out, per key — e.g. its free daily limit is used up.
 * While it is (and there's a Groq key), requests go straight to Groq instead of
 * failing on OpenRouter first. In memory: each server instance learns it once.
 */
const openRouterOutUntil = new Map<string, number>();

/** How long to leave OpenRouter alone after it failed this way. */
function outFor(failure: { reason?: AiFailure; retryAfter?: number; resetAt?: number }) {
  const now = Date.now();
  switch (failure.reason) {
    // OpenRouter says when the limit resets (its free models have a daily cap); else 10 minutes.
    case "rate_limited": return Math.min(failure.resetAt ?? now + (failure.retryAfter ? failure.retryAfter * 1000 : 10 * 60_000), now + 24 * 3_600_000);
    case "credits":
    case "auth": return now + 60 * 60_000;
    case "unavailable": return now + 2 * 60_000;
    default: return now;
  }
}

/** A short "try again in N s" is worth waiting for; a longer one is reported instead. */
const MAX_RATE_LIMIT_WAIT_S = 15;

/**
 * Runs `attempt` on OpenRouter, then on Groq if OpenRouter failed (any reason),
 * has no key, or is known to be out (`openRouterOutUntil`). Groq's models are tried in turn while they're rate-limited
 * (each has its own per-minute limit); if all are and the wait is short, it
 * waits once and tries the first again. A Groq failure reports OpenRouter's
 * reason when there was one — that's the key the user manages.
 */
async function withGroqBackup<R extends { ok: boolean; reason?: AiFailure; retryAfter?: number; resetAt?: number }>(
  config: OpenRouterConfig,
  attempt: (target: Target) => Promise<R>,
): Promise<R | { ok: false; reason: "not_configured" }> {
  let first: R | null = null;
  const outUntil = config.apiKey ? openRouterOutUntil.get(config.apiKey) ?? 0 : 0;
  const out = Boolean(config.groq) && outUntil > Date.now();
  if (out && !config.skipOpenRouter) console.warn(`[ai] OpenRouter is out until ${new Date(outUntil).toISOString()}; using Groq`);
  if (config.apiKey && !config.skipOpenRouter && !out) {
    const timeoutMs = config.groq ? OPENROUTER_TIMEOUT_WITH_BACKUP_MS : TIMEOUT_MS;
    first = await attempt({ provider: "openrouter", apiKey: config.apiKey, models: config.models, timeoutMs });
    if (first.ok) openRouterOutUntil.delete(config.apiKey);
    if (first.ok || !config.groq) return first;
    if (first.reason && PROVIDER_DOWN.has(first.reason)) {
      config.skipOpenRouter = true;
      openRouterOutUntil.set(config.apiKey, outFor(first));
    }
    console.warn(`[ai] OpenRouter failed (${first.reason}); trying Groq`);
  }
  if (!config.groq) return first ?? { ok: false, reason: "not_configured" };
  const groq = (model: string) => attempt({ provider: "groq", apiKey: config.groq!.apiKey, models: [model], timeoutMs: TIMEOUT_MS });
  let backup: R | null = null;
  let wait = Infinity;
  for (const model of config.groq.models) {
    backup = await groq(model);
    if (backup.ok || backup.reason !== "rate_limited") break;
    wait = Math.min(wait, backup.retryAfter ?? Infinity);
  }
  if (backup && !backup.ok && backup.reason === "rate_limited" && wait <= MAX_RATE_LIMIT_WAIT_S) {
    console.warn(`[ai] Groq rate-limited; waiting ${wait}s`);
    await new Promise((resolve) => setTimeout(resolve, (wait + 0.5) * 1000));
    backup = await groq(config.groq.models[0]!);
  }
  return backup!.ok || !first ? backup! : first;
}

/** Seconds from a 429's `retry-after` header, when it gives one. */
function retryAfter(response: Response) {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

/** When a limit resets: OpenRouter's `x-ratelimit-reset` (epoch ms, or s), in ms. */
function resetAt(response: Response) {
  const value = Number(response.headers.get("x-ratelimit-reset"));
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const ms = value < 1e12 ? value * 1000 : value;
  return ms > Date.now() ? ms : undefined;
}

function request(target: Target, body: Record<string, unknown>) {
  const groq = target.provider === "groq";
  return fetch(groq ? GROQ_ENDPOINT : ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${target.apiKey}`, "Content-Type": "application/json", ...(groq ? {} : { "X-Title": "WorkNest" }) },
    body: JSON.stringify({
      model: target.models[0],
      // OpenRouter tries these in order when the first is down or rate-limited.
      ...(!groq && target.models.length > 1 ? { models: target.models } : {}),
      ...body,
      // Keep any model reasoning out of the reply (each provider spells it differently).
      ...(groq ? { include_reasoning: false } : { reasoning: { exclude: true } }),
    }),
    signal: AbortSignal.timeout(target.timeoutMs),
  });
}

const providerName = (target: Target) => (target.provider === "groq" ? "Groq" : "OpenRouter");

/** Why an AI request produced nothing. There is no non-AI fallback, so the UI explains it. */
export type AiFailure = "not_configured" | "auth" | "credits" | "rate_limited" | "unavailable" | "cut_off" | "bad_reply";
/** `model` on a failure = the model whose reply was rejected, when there was one; `retryAfter` = seconds the provider asked to wait; `resetAt` = when its limit resets (ms). */
export type AiResult = { ok: true; text: string; model: string } | { ok: false; reason: AiFailure; model?: string; retryAfter?: number; resetAt?: number };

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
export function openRouterComplete(
  config: OpenRouterConfig,
  options: CompleteOptions,
): Promise<AiResult> {
  return withGroqBackup(config, async (target) => {
    const first = await completeOnce(target, options);
    if (first.ok || (first.reason !== "cut_off" && first.reason !== "bad_reply")) return first;
    const second = await completeOnce(target, options);
    return second.ok ? second : { ...second, model: second.model ?? first.model };
  });
}

async function completeOnce(
  target: Target,
  { system, user, maxChars, maxTokens, accept, checkReasoning = true }: CompleteOptions,
): Promise<AiResult> {
  try {
    const response = await request(target, {
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
      // Room for a reasoning model to think; the answer itself is capped by the prompt + maxChars.
      max_tokens: maxTokens,
    });
    if (!response.ok) {
      console.warn(`[ai] ${providerName(target)} ${response.status}: ${(await response.text()).slice(0, 300)}`);
      const reason: AiFailure =
        response.status === 401 || response.status === 403 ? "auth"
        : response.status === 402 ? "credits"
        : response.status === 429 ? "rate_limited"
        : "unavailable";
      return { ok: false, reason, retryAfter: retryAfter(response), resetAt: resetAt(response) };
    }
    const json = (await response.json()) as { model?: string; choices?: Array<{ finish_reason?: string; message?: { content?: string | null } }> };
    const choice = json.choices?.[0];
    // Some free reasoning models inline their thinking; keep only the answer.
    const raw = choice?.message?.content?.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    const model = json.model ?? target.models[0]!;
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
    console.warn(`[ai] ${providerName(target)} request failed:`, error instanceof Error ? error.message : error);
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

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
export type ToolSpec = { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } };
/** `noTools`: none of the configured models can call tools — the caller falls back to a plain completion. */
export type ChatResult = { ok: true; content: string; toolCalls: ToolCall[]; model: string } | { ok: false; reason: AiFailure; model?: string; noTools?: boolean; retryAfter?: number; resetAt?: number };

/**
 * One turn of a tool-using conversation (Ask's agent loop). With `tools`,
 * OpenRouter only routes to models that support them (`require_parameters`).
 * A reply cut off by the token limit is retried once, like `openRouterComplete`,
 * and Groq is the backup the same way.
 */
export async function openRouterChat(
  config: OpenRouterConfig,
  options: ChatOptions,
): Promise<ChatResult> {
  return withGroqBackup(config, async (target) => {
    const first = await chatOnce(target, options);
    if (first.ok || first.reason !== "cut_off") return first;
    return chatOnce(target, options);
  });
}

type ChatOptions = { messages: ChatMessage[]; tools?: ToolSpec[]; maxTokens: number };

async function chatOnce(target: Target, { messages, tools, maxTokens }: ChatOptions): Promise<ChatResult> {
  try {
    const response = await request(target, {
      messages,
      ...(tools?.length ? { tools, ...(target.provider === "openrouter" ? { provider: { require_parameters: true } } : {}) } : {}),
      temperature: 0.2,
      max_tokens: maxTokens,
    });
    if (!response.ok) {
      const body = (await response.text()).slice(0, 300);
      console.warn(`[ai] ${providerName(target)} ${response.status}: ${body}`);
      // 404 "No endpoints found that support tool use" (or 400 from a model that rejects `tools`).
      if (tools?.length && (response.status === 404 || (response.status === 400 && /tool/i.test(body)))) return { ok: false, reason: "unavailable", noTools: true };
      const reason: AiFailure =
        response.status === 401 || response.status === 403 ? "auth"
        : response.status === 402 ? "credits"
        : response.status === 429 ? "rate_limited"
        : "unavailable";
      return { ok: false, reason, retryAfter: retryAfter(response), resetAt: resetAt(response) };
    }
    const json = (await response.json()) as { model?: string; choices?: Array<{ finish_reason?: string; message?: { content?: string | null; tool_calls?: ToolCall[] } }> };
    const choice = json.choices?.[0];
    const model = json.model ?? target.models[0]!;
    let content = choice?.message?.content?.replace(/<think>[\s\S]*?<\/think>/g, "").trim() ?? "";
    let toolCalls = choice?.message?.tool_calls ?? [];
    // Some free models write the call as text instead of using the API's tool calls.
    if (!toolCalls.length && tools?.length && /<tool_call>|<function=/.test(content)) {
      toolCalls = textToolCalls(content);
      if (toolCalls.length) content = content.slice(0, content.search(/<tool_call>|<function=/)).trim();
    }
    if (choice?.finish_reason === "length" && !toolCalls.length) {
      console.warn(`[ai] ${model} hit the token limit (${content.length} chars)`);
      return { ok: false, reason: "cut_off", model };
    }
    if (!content && !toolCalls.length) return { ok: false, reason: "bad_reply", model };
    return { ok: true, content, toolCalls, model };
  } catch (error) {
    console.warn(`[ai] ${providerName(target)} request failed:`, error instanceof Error ? error.message : error);
    return { ok: false, reason: "unavailable" };
  }
}

/**
 * Tool calls written as text: Qwen-style `<function=name><parameter=key>value</parameter></function>`
 * or `<tool_call>{"name": …, "arguments": {…}}</tool_call>`.
 */
function textToolCalls(content: string): ToolCall[] {
  const calls: ToolCall[] = [];
  for (const match of content.matchAll(/<function=([\w-]+)>([\s\S]*?)(?:<\/function>|$)/g)) {
    const args: Record<string, unknown> = {};
    for (const param of match[2]!.matchAll(/<parameter=([\w-]+)>([\s\S]*?)<\/parameter>/g)) {
      const raw = param[2]!.trim();
      try {
        args[param[1]!] = JSON.parse(raw);
      } catch {
        args[param[1]!] = raw;
      }
    }
    calls.push({ id: `text-${calls.length + 1}`, type: "function", function: { name: match[1]!, arguments: JSON.stringify(args) } });
  }
  if (calls.length) return calls;
  for (const match of content.matchAll(/<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g)) {
    try {
      const parsed = JSON.parse(match[1]!) as { name?: string; arguments?: unknown };
      if (parsed.name) calls.push({ id: `text-${calls.length + 1}`, type: "function", function: { name: parsed.name, arguments: typeof parsed.arguments === "string" ? parsed.arguments : JSON.stringify(parsed.arguments ?? {}) } });
    } catch {
      // Not a call after all.
    }
  }
  return calls;
}

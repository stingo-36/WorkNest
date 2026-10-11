import "server-only";

import { prisma } from "@/lib/prisma";
import { open, seal } from "@/lib/secret-box";

// A free model that answers directly first; `openrouter/free` (any free model, often
// a reasoning one) only as the fallback.
export const DEFAULT_OPENROUTER_MODEL = "google/gemma-4-31b-it:free, openrouter/free";

/** What Profile may see — never the key itself. */
export type AiSettings = {
  /** "user" = their own key, "server" = OPENROUTER_API_KEY env, null = AI off. */
  keySource: "user" | "server" | null;
  /** Last 4 characters of the user's own key. */
  keyHint: string | null;
  /** True when a key is stored but can't be decrypted (AUTH_SECRET changed). */
  keyUnreadable: boolean;
  /** The user's model list, or "" to use the default. */
  model: string;
  defaultModel: string;
};

function envModel() {
  return process.env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL;
}

function parseModels(value: string) {
  return value.split(",").map((model) => model.trim()).filter(Boolean);
}

export async function getAiSettings(userId: string): Promise<AiSettings> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { openRouterKeyEnc: true, openRouterKeyHint: true, openRouterModel: true },
  });
  const userKeyReadable = user?.openRouterKeyEnc ? open(user.openRouterKeyEnc) !== null : false;
  const serverKey = Boolean(process.env.OPENROUTER_API_KEY?.trim());
  return {
    keySource: userKeyReadable ? "user" : serverKey ? "server" : null,
    keyHint: userKeyReadable ? user?.openRouterKeyHint ?? null : null,
    keyUnreadable: Boolean(user?.openRouterKeyEnc) && !userKeyReadable,
    model: user?.openRouterModel ?? "",
    defaultModel: envModel(),
  };
}

/** Key + models for a summary request: the user's own key first, then the server's. */
export async function getOpenRouterConfig(userId: string): Promise<{ apiKey: string; models: string[] } | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { openRouterKeyEnc: true, openRouterModel: true },
  });
  const apiKey = (user?.openRouterKeyEnc ? open(user.openRouterKeyEnc) : null) ?? process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return null;
  const models = parseModels(user?.openRouterModel || envModel());
  return { apiKey, models: models.length ? models : parseModels(DEFAULT_OPENROUTER_MODEL) };
}

/**
 * Ask OpenRouter whether a key is real before storing it. Only a definite
 * "unauthorised" counts as invalid; network trouble shouldn't block saving.
 */
export async function checkOpenRouterKey(apiKey: string): Promise<"valid" | "invalid" | "unknown"> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/key", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) return "valid";
    return response.status === 401 || response.status === 403 ? "invalid" : "unknown";
  } catch {
    return "unknown";
  }
}

export async function saveOpenRouterKey(userId: string, apiKey: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { openRouterKeyEnc: seal(apiKey), openRouterKeyHint: apiKey.slice(-4) },
  });
}

export async function clearOpenRouterKey(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { openRouterKeyEnc: null, openRouterKeyHint: null },
  });
}

export async function saveOpenRouterModel(userId: string, model: string) {
  const models = parseModels(model);
  await prisma.user.update({
    where: { id: userId },
    data: { openRouterModel: models.length ? models.join(", ") : null },
  });
}

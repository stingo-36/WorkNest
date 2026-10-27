"use client";

import { ExternalLink, KeyRound } from "lucide-react";
import { useState, useTransition } from "react";

import { removeAiGroqKey, removeAiKey, saveAiGroqKey, saveAiKey, saveAiModel } from "@/actions/profile";
import { ListCard } from "@/components/profile/list-editors";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

/** Mirror of lib/ai-settings.ts AiSettings (that module is server-only). */
export type AiSettingsView = {
  aiOn: boolean;
  keySource: "user" | "server" | null;
  groqSource: "user" | "server" | null;
  groqHint: string | null;
  groqUnreadable: boolean;
  keyHint: string | null;
  keyUnreadable: boolean;
  model: string;
  defaultModel: string;
};

/**
 * Profile → AI summaries. Saves on its own (not via the profile save bar): the key
 * goes to the server once, is stored encrypted, and is never sent back — only its
 * last four characters are shown. Two keys: OpenRouter (the main AI) and Groq
 * (answers when OpenRouter fails or has no key).
 */
export function AiSettingsCard({ initial }: { initial: AiSettingsView }) {
  const [settings, setSettings] = useState(initial);
  const [apiKey, setApiKey] = useState("");
  const [groqKey, setGroqKey] = useState("");
  const [groqError, setGroqError] = useState<string>();
  const [model, setModel] = useState(initial.model);
  const [keyError, setKeyError] = useState<string>();
  const [modelError, setModelError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function saveKey() {
    setKeyError(undefined);
    startTransition(async () => {
      const result = await saveAiKey({ apiKey });
      if (!result.ok) { setKeyError(result.error.fields?.apiKey ?? result.error.message); return; }
      setSettings(result.data);
      setApiKey("");
      toast.success("OpenRouter key saved");
    });
  }

  function removeKey() {
    startTransition(async () => {
      const result = await removeAiKey();
      if (!result.ok) { toast.error(result.error.message); return; }
      setSettings(result.data);
      toast.success("OpenRouter key removed");
    });
  }

  function saveGroq() {
    setGroqError(undefined);
    startTransition(async () => {
      const result = await saveAiGroqKey({ apiKey: groqKey });
      if (!result.ok) { setGroqError(result.error.fields?.apiKey ?? result.error.message); return; }
      setSettings(result.data);
      setGroqKey("");
      toast.success("Groq key saved");
    });
  }

  function removeGroq() {
    startTransition(async () => {
      const result = await removeAiGroqKey();
      if (!result.ok) { toast.error(result.error.message); return; }
      setSettings(result.data);
      toast.success("Groq key removed");
    });
  }

  function saveModel() {
    setModelError(undefined);
    startTransition(async () => {
      const result = await saveAiModel({ model });
      if (!result.ok) { setModelError(result.error.fields?.model ?? result.error.message); return; }
      setSettings(result.data);
      setModel(result.data.model);
      toast.success("Model saved");
    });
  }

  const status =
    settings.keySource === "user" ? `On — using your key ending ${settings.keyHint ?? "····"}.`
    : settings.keySource === "server" ? "On — using the server's shared key. Add your own to use it instead."
    : settings.groqSource ? "No OpenRouter key — Groq answers everything."
    : "Off — no summaries or reports are generated. Add a key to turn AI on.";
  const groqStatus =
    settings.groqSource === "user" ? `On — using your Groq key ending ${settings.groqHint ?? "····"}. It answers whenever OpenRouter fails.`
    : settings.groqSource === "server" ? "On — using the server's Groq key. It answers whenever OpenRouter fails."
    : "Off — if OpenRouter fails or is busy, AI requests fail. Add a free Groq key as a backup.";

  return (
    <ListCard title="AI summaries" description="Work-log summaries, 5-15 reports and Ask are written by AI: OpenRouter first, Groq as the backup. Free keys work for both.">
      <h3 className="text-md font-semibold text-text">OpenRouter</h3>
      <div className="flex items-start gap-3 rounded-xl border border-border-strong bg-surface-2 p-4">
        <KeyRound className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text" role="status">{status}</p>
          {settings.keyUnreadable ? <p className="mt-1 text-sm text-danger">Your saved key can no longer be read (the server secret changed). Please add it again.</p> : null}
        </div>
        {settings.keySource === "user" ? <Button variant="secondary" size="sm" disabled={pending} onClick={removeKey}>Remove</Button> : null}
      </div>

      <form className="flex flex-col gap-2" onSubmit={(event) => { event.preventDefault(); saveKey(); }}>
        <Field label={settings.keySource === "user" ? "Replace API key" : "OpenRouter API key"} htmlFor="ai-key" error={keyError} hint="Stored encrypted and never shown again. Checked with OpenRouter when you save.">
          <div className="flex flex-col gap-2 md:flex-row">
            <Input
              id="ai-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-or-v1-…"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              aria-invalid={Boolean(keyError)}
              className="md:flex-1"
            />
            <Button type="submit" loading={pending} disabled={!apiKey.trim()}>Save key</Button>
          </div>
        </Field>
        <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 w-fit items-center gap-1 text-md font-semibold text-accent-text hover:underline">
          Get a key at openrouter.ai<ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      </form>

      <form className="flex flex-col gap-2" onSubmit={(event) => { event.preventDefault(); saveModel(); }}>
        <Field label="OpenRouter model" htmlFor="ai-model" error={modelError} hint={`Leave empty for the recommended free default (${settings.defaultModel}) — Ask then uses free models that are good at its tools. Several ids, comma-separated, are tried in order.`}>
          <div className="flex flex-col gap-2 md:flex-row">
            <Input
              id="ai-model"
              spellCheck={false}
              placeholder={settings.defaultModel}
              value={model}
              onChange={(event) => setModel(event.target.value)}
              aria-invalid={Boolean(modelError)}
              className="md:flex-1"
            />
            <Button type="submit" variant="secondary" disabled={pending || model.trim() === settings.model}>Save model</Button>
          </div>
        </Field>
      </form>

      <h3 className="mt-2 text-md font-semibold text-text">Groq (backup)</h3>
      <div className="flex items-start gap-3 rounded-xl border border-border-strong bg-surface-2 p-4">
        <KeyRound className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text" role="status">{groqStatus}</p>
          {settings.groqUnreadable ? <p className="mt-1 text-sm text-danger">Your saved Groq key can no longer be read (the server secret changed). Please add it again.</p> : null}
        </div>
        {settings.groqSource === "user" ? <Button variant="secondary" size="sm" disabled={pending} onClick={removeGroq}>Remove</Button> : null}
      </div>

      <form className="flex flex-col gap-2" onSubmit={(event) => { event.preventDefault(); saveGroq(); }}>
        <Field label={settings.groqSource === "user" ? "Replace Groq key" : "Groq API key"} htmlFor="ai-groq-key" error={groqError} hint="Stored encrypted and never shown again. Checked with Groq when you save.">
          <div className="flex flex-col gap-2 md:flex-row">
            <Input
              id="ai-groq-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="gsk_…"
              value={groqKey}
              onChange={(event) => setGroqKey(event.target.value)}
              aria-invalid={Boolean(groqError)}
              className="md:flex-1"
            />
            <Button type="submit" loading={pending} disabled={!groqKey.trim()}>Save key</Button>
          </div>
        </Field>
        <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 w-fit items-center gap-1 text-md font-semibold text-accent-text hover:underline">
          Get a free key at console.groq.com<ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      </form>

      <p className="text-sm text-text-muted">
        When AI is on, a log’s tickets, meeting notes and work done (and what you ask) are sent to OpenRouter or Groq and the model’s provider. Free models may log prompts.
      </p>
    </ListCard>
  );
}

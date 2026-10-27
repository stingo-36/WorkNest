"use client";

import { ExternalLink, KeyRound } from "lucide-react";
import { useState, useTransition } from "react";

import { removeAiKey, saveAiKey, saveAiModel } from "@/actions/profile";
import { ListCard } from "@/components/profile/list-editors";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

/** Mirror of lib/ai-settings.ts AiSettings (that module is server-only). */
export type AiSettingsView = {
  keySource: "user" | "server" | null;
  groqBackup: boolean;
  keyHint: string | null;
  keyUnreadable: boolean;
  model: string;
  defaultModel: string;
};

/**
 * Profile → AI summaries. Saves on its own (not via the profile save bar): the key
 * goes to the server once, is stored encrypted, and is never sent back — only its
 * last four characters are shown.
 */
export function AiSettingsCard({ initial }: { initial: AiSettingsView }) {
  const [settings, setSettings] = useState(initial);
  const [apiKey, setApiKey] = useState("");
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
    : "Off — no summaries or reports are generated. Add a key to turn AI on.";

  return (
    <ListCard title="AI summaries" description="Work-log summaries and 5-15 reports are written by AI through OpenRouter. Free models work.">
      <div className="flex items-start gap-3 rounded-xl border border-border-strong bg-surface-2 p-4">
        <KeyRound className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text" role="status">{status}</p>
          {settings.groqBackup ? <p className="mt-1 text-sm text-text-muted">If OpenRouter fails, Groq answers instead.</p> : null}
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
        <Field label="Model" htmlFor="ai-model" error={modelError} hint={`Leave empty for the free default (${settings.defaultModel}). Several ids, comma-separated, are tried in order.`}>
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

      <p className="text-sm text-text-muted">
        When AI is on, a log’s tickets, meeting notes and work done are sent to OpenRouter and the model’s provider. Free models may log prompts.
      </p>
    </ListCard>
  );
}

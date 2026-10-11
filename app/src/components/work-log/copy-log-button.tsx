"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { toast } from "@/components/ui/toast";

/** Copies the whole log as plain text (for stand-ups, chat, email). */
export function CopyLogButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Log copied as text");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy — your browser blocked clipboard access");
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border border-border-strong bg-surface px-4 text-sm font-semibold text-text transition-colors duration-150 hover:bg-surface-2 md:h-10"
    >
      {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
      {copied ? "Copied" : "Copy as text"}
    </button>
  );
}

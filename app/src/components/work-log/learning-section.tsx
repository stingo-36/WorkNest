"use client";

import { ClipboardCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { saveLearningNotes } from "@/actions/worklog";
import { MarkdownEditor } from "@/components/work-log/markdown-editor";
import { useAutosave } from "@/components/work-log/save-status";
import { SectionHeading } from "@/components/work-log/section-heading";

/**
 * Work done — a general daily summary independent of ticket-specific updates.
 * Autosaves like meeting notes.
 */
export function LearningSection({ workLogId, initialNotes, onFilledChange }: { workLogId: string; initialNotes: string; onFilledChange?: (filled: boolean) => void }) {
  const [notes, setNotes] = useState(initialNotes);
  const filled = notes.trim().length > 0;
  useEffect(() => onFilledChange?.(filled), [filled, onFilledChange]);
  const { flush } = useAutosave({
    id: `learning:${workLogId}`,
    value: notes,
    initial: initialNotes,
    save: async (value) => {
      const result = await saveLearningNotes({ workLogId, notes: value });
      return result.ok ? { ok: true } : { ok: false, message: result.error.message };
    },
  });

  return (
    <section aria-labelledby="learning-heading" className="wl-card">
      <SectionHeading id="learning-heading" title="Work done" />
      <div className="p-4 md:p-5">
        <label htmlFor="learning-notes" className="mb-2 flex items-center gap-2 text-sm text-text-muted">
          <ClipboardCheck className="size-4 text-accent-text" aria-hidden="true" />
          Summarize what you completed today — with or without tickets.
        </label>
        <MarkdownEditor
          id="learning-notes"
          value={notes}
          ariaLabel="Work done notes"
          minHeight="min-h-32"
          onChange={setNotes}
          onBlur={() => flush()}
        />
      </div>
    </section>
  );
}

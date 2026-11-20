"use client";

import { useEffect, useState } from "react";

import { saveLearningNotes } from "@/actions/worklog";
import { MarkdownEditor } from "@/components/work-log/markdown-editor";
import { useAutosave } from "@/components/work-log/save-status";
import { StepHeading } from "@/components/work-log/section-heading";

/**
 * Step 3 "Anything else?" (was "Work done"; stored as `learningNotes`) —
 * whatever isn't on a ticket. Optional. Autosaves like meeting notes.
 */
export function LearningSection({ workLogId, initialNotes, step, onFilledChange }: { workLogId: string; initialNotes: string; step: number; onFilledChange?: (filled: boolean) => void }) {
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
      <StepHeading id="learning-heading" step={step} done={filled} title="Anything else?" hint="Reviews, learning, support… whatever isn't on a ticket. Optional." />
      <div className="wl-step-body">
        <MarkdownEditor
          id="learning-notes"
          compact
          value={notes}
          ariaLabel="Anything else you did today"
          placeholder="Reviewed two PRs. Helped QA reproduce a bug."
          minHeight="min-h-16"
          onChange={setNotes}
          onBlur={() => flush()}
        />
      </div>
    </section>
  );
}

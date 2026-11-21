"use client";

import { ChevronDown, FolderKanban, History, X } from "lucide-react";
import { useCallback, useState, useTransition } from "react";

import { getTicket } from "@/actions/tickets";
import { cn } from "@/components/cn";
import { TicketId } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { ProjectInput } from "@/components/ui/project-input";
import { MarkdownEditor } from "@/components/work-log/markdown-editor";
import {
  TICKET_STATUS_LABELS,
  TICKET_STATUS_ORDER,
} from "@/components/ui/ticket-status-badge";
import { useAutosave, type SaveResult } from "@/components/work-log/save-status";
import { TicketHistory } from "@/components/work-log/ticket-history";
import { toMergedHistory, type EditorTicket, type HistoryEntry } from "@/components/work-log/types";
import type { WorkflowStatus } from "@/lib/workflow-status";

/**
 * One attached ticket on the day page (compact, 2026-11-18): key + title,
 * one-tap status (In progress / QA / Done, the other stages under More), × to
 * remove, a one-line update, and project + previous updates behind Details.
 * Status buttons are labelled and pressed-state, not colour alone.
 *
 * Remove calls `detachTicketFromWorkLog` — it deletes THIS log's update row
 * only. The ticket and every other day's history survive.
 */

type Draft = { description: string; status: WorkflowStatus };

/** One-tap statuses on the card; the rest of the six stages sit under "More". */
const QUICK_STATUSES: Array<{ value: WorkflowStatus; label: string }> = [
  { value: "InProgress", label: "In progress" },
  { value: "SentToQA", label: "QA" },
  { value: "Done", label: "Done" },
];

const draftEquals = (a: Draft, b: Draft) =>
  a.description === b.description && a.status === b.status;

export function TicketWorkCard({
  workLogId,
  ticket,
  onSaveWork,
  onDetach,
  onHistoryLoaded,
  onSaveProject,
}: {
  workLogId: string;
  ticket: EditorTicket;
  onSaveWork: (input: { ticketId: string; draft: Draft }) => Promise<SaveResult>;
  onDetach: (ticketId: string) => Promise<boolean>;
  onHistoryLoaded: (ticketId: string, history: HistoryEntry[]) => void;
  /** Saves the ticket's project; resolves to the stored value, or undefined on failure. */
  onSaveProject: (ticketId: string, projectName: string) => Promise<string | null | undefined>;
}) {
  const [draft, setDraft] = useState<Draft>(ticket.draft);
  const [project, setProject] = useState(ticket.projectName ?? "");
  const [savingProject, setSavingProject] = useState(false);

  async function saveProject(next: string) {
    if (next === (ticket.projectName ?? "")) return;
    setSavingProject(true);
    const stored = await onSaveProject(ticket.id, next);
    setSavingProject(false);
    // Failure: put the saved value back so the field never shows unsaved text.
    setProject(stored === undefined ? ticket.projectName ?? "" : stored ?? "");
  }
  const [open, setOpen] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [detaching, startDetach] = useTransition();
  const { flush } = useAutosave<Draft>({
    id: `ticket:${ticket.id}`,
    value: draft,
    initial: ticket.draft,
    equals: draftEquals,
    save: (value) => onSaveWork({ ticketId: ticket.id, draft: value }),
  });

  // Previous updates = everything except this work log's own row.
  const previous = ticket.history
    ? ticket.history.filter((entry) => entry.workLog?.id !== workLogId)
    : null;

  const loadHistory = useCallback(async () => {
    if (ticket.history) return;
    setLoadingHistory(true);
    const result = await getTicket(ticket.id);
    setLoadingHistory(false);
    if (result.ok) onHistoryLoaded(ticket.id, toMergedHistory(result.data.updates, result.data.historyEntries));
  }, [ticket.history, ticket.id, onHistoryLoaded]);

  const historyCount = previous?.length;

  const pending = !draft.description.trim();

  const quick = QUICK_STATUSES.some((item) => item.value === draft.status);
  function setStatus(status: WorkflowStatus) {
    if (status === draft.status) return;
    const next: Draft = { ...draft, status };
    setDraft(next);
    // A status change is a decision, not a keystroke — save it now.
    flush(next);
  }

  return (
    <article
      id={`ticket-card-${ticket.ticketKey}`}
      aria-labelledby={`ticket-heading-${ticket.id}`}
      className={cn("wl-tk scroll-mt-24", !pending && "is-on")}
    >
      <header className="wl-tk-head">
        <TicketId className="shrink-0 text-xs">{ticket.ticketKey}</TicketId>
        <h3 id={`ticket-heading-${ticket.id}`} className="wl-tk-title">{ticket.title}</h3>
        <div className="wl-tk-status" role="group" aria-label={`Status for ${ticket.ticketKey}`}>
          <span className="wl-seg">
            {QUICK_STATUSES.map((item) => (
              <button key={item.value} type="button" aria-pressed={draft.status === item.value} data-tone={item.value} onClick={() => setStatus(item.value)}>{item.label}</button>
            ))}
          </span>
          {/* The other stages (Blocked, Ready for production, Released) live under More. */}
          <span className={cn("wl-more", !quick && "is-set")}>
            <label htmlFor={`status-${ticket.id}`} className="sr-only">More statuses for {ticket.ticketKey}</label>
            <select id={`status-${ticket.id}`} value={quick ? "" : draft.status} onChange={(event) => { if (event.target.value) setStatus(event.target.value as WorkflowStatus); }}>
              <option value="" disabled>More</option>
              {TICKET_STATUS_ORDER.filter((status) => !QUICK_STATUSES.some((item) => item.value === status)).map((status) => (
                <option key={status} value={status}>{TICKET_STATUS_LABELS[status]}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none size-3.5" aria-hidden="true" />
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          className="wl-tk-x"
          aria-label={`Remove ${ticket.ticketKey} from this work log`}
          title={`Remove ${ticket.ticketKey} from this work log`}
          loading={detaching}
          onClick={() => {
            if (draft.description.trim()) setConfirming(true);
            else void detach();
          }}
        >
          <X aria-hidden="true" />
        </Button>
      </header>

      <MarkdownEditor
        id={`work-${ticket.id}`}
        compact
        value={draft.description}
        ariaLabel={`What you did on ${ticket.ticketKey} today`}
        placeholder={`What did you do on ${ticket.ticketKey} today?`}
        minHeight="min-h-20"
        onChange={(description) => setDraft((current) => ({ ...current, description }))}
        onBlur={() => flush()}
      />

      <button
        type="button"
        aria-expanded={open}
        aria-controls={`details-${ticket.id}`}
        onClick={() => {
          if (!open) void loadHistory();
          setOpen((value) => !value);
        }}
        className="wl-link-btn mt-2"
      >
        {project ? <><FolderKanban className="size-3.5" aria-hidden="true" />{project} · </> : null}
        Details
        {typeof historyCount === "number" ? ` · ${historyCount} previous ${historyCount === 1 ? "update" : "updates"}` : ""}
        <ChevronDown aria-hidden="true" className={cn("size-3.5 transition-transform duration-200 ease-standard", open && "rotate-180")} />
      </button>

      <div id={`details-${ticket.id}`} hidden={!open}>
        {open ? (
          <div className="mt-3 flex flex-col gap-3">
            <div className="w-full md:w-64">
              <label htmlFor={`project-${ticket.id}`} className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-text-muted">
                <FolderKanban className="size-3.5" aria-hidden="true" />
                Project / site
              </label>
              <ProjectInput
                id={`project-${ticket.id}`}
                value={project}
                placeholder="Add a project"
                disabled={savingProject}
                onValueChange={setProject}
                onCommit={(next) => void saveProject(next)}
              />
            </div>
            <div>
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-text-muted"><History className="size-3.5" aria-hidden="true" />Previous updates</p>
              <TicketHistory entries={previous} loading={loadingHistory} />
            </div>
          </div>
        ) : null}
      </div>

      <ConfirmationDialog
        open={confirming}
        title={`Remove ${ticket.ticketKey} from this work log?`}
        description="Today's work note for this ticket is deleted. The ticket itself and all of its previous updates are kept."
        confirmLabel="Remove from log"
        destructive
        onCancel={() => setConfirming(false)}
        onConfirm={async () => {
          setConfirming(false);
          await detach();
        }}
      />
    </article>
  );

  function detach() {
    return new Promise<void>((resolve) => {
      startDetach(async () => {
        await onDetach(ticket.id);
        resolve();
      });
    });
  }
}

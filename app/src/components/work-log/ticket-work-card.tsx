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
  TICKET_STATUS_DOT,
  TICKET_STATUS_ORDER,
} from "@/components/ui/ticket-status-badge";
import { useAutosave, type SaveResult } from "@/components/work-log/save-status";
import { TicketHistory } from "@/components/work-log/ticket-history";
import { toMergedHistory, type EditorTicket, type HistoryEntry } from "@/components/work-log/types";
import type { WorkflowStatus } from "@/lib/workflow-status";

/**
 * One attached ticket — spec §24.
 *
 * ID + status badge + title · "Work Done Today" · status select ·
 * "View Previous Updates" · remove.
 *
 * Status is communicated by the labelled badge and native select rather than
 * a decorative card edge, so it remains clear without relying on colour alone.
 *
 * Remove calls `detachTicketFromWorkLog` — it deletes THIS log's update row
 * only. The ticket and every other day's history survive.
 */

type Draft = { description: string; status: WorkflowStatus };

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

  return (
    <article
      id={`ticket-card-${ticket.ticketKey}`}
      aria-labelledby={`ticket-heading-${ticket.id}`}
      className={cn("scroll-mt-24 px-4 py-4 transition-colors duration-150 md:px-5", pending && "bg-surface-2")}
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <TicketId className="text-xs text-text-muted">{ticket.ticketKey}</TicketId>
            {project ? (
              <span className="inline-flex items-center gap-1 font-medium text-accent-text">
                <FolderKanban className="size-3.5" aria-hidden="true" />
                {project}
              </span>
            ) : null}
            {pending ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-3 px-2 py-0.5 font-semibold text-accent-text">
                <span className="size-1.5 rounded-full bg-accent-text" aria-hidden="true" />
                No update yet
              </span>
            ) : null}
          </div>
          <h3 id={`ticket-heading-${ticket.id}`} className="mt-1 max-w-[72ch] text-base font-semibold leading-snug text-text">
            {ticket.title}
          </h3>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {/* Status: a neutral pill with the stage's colour dot; native select for a11y. */}
          <span className="relative inline-flex h-9 items-center rounded-full border border-border-strong bg-surface pl-3 pr-8 text-sm font-semibold text-text transition-colors duration-150 focus-within:border-primary hover:border-primary">
            <span className={cn("mr-2 size-2 rounded-full", TICKET_STATUS_DOT[draft.status])} aria-hidden="true" />
            {TICKET_STATUS_LABELS[draft.status]}
            <ChevronDown className="pointer-events-none absolute right-2.5 size-4 text-text-muted" aria-hidden="true" />
            <label htmlFor={`status-${ticket.id}`} className="sr-only">Status for {ticket.ticketKey}</label>
            <select
              id={`status-${ticket.id}`}
              value={draft.status}
              onChange={(event) => {
                const next: Draft = { ...draft, status: event.target.value as WorkflowStatus };
                setDraft(next);
                // A status change is a decision, not a keystroke — save it now.
                flush(next);
              }}
              className="absolute inset-0 cursor-pointer appearance-none rounded-full opacity-0"
            >
              {TICKET_STATUS_ORDER.map((status) => (
                <option key={status} value={status}>{TICKET_STATUS_LABELS[status]}</option>
              ))}
            </select>
          </span>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
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
        </div>
      </header>

      <label htmlFor={`work-${ticket.id}`} className="sr-only">What I did today on {ticket.ticketKey}</label>
      <MarkdownEditor
        id={`work-${ticket.id}`}
        value={draft.description}
        ariaLabel={`Work completed for ${ticket.ticketKey}`}
        minHeight="min-h-24"
        onChange={(description) => setDraft((current) => ({ ...current, description }))}
        onBlur={() => flush()}
      />

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
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
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`history-${ticket.id}`}
          onClick={() => {
            if (!open) void loadHistory();
            setOpen((value) => !value);
          }}
          className={cn(
            "tap-area inline-flex cursor-pointer items-center gap-1.5 rounded-sm text-sm font-semibold",
            "text-accent-text transition-colors duration-150 ease-standard hover:text-primary",
          )}
        >
          <History className="size-3.5" aria-hidden="true" />
          Previous updates
          {typeof historyCount === "number" ? ` (${historyCount})` : ""}
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-3.5 transition-transform duration-200 ease-standard",
              open && "rotate-180",
            )}
          />
        </button>
      </div>

      <div>
        <div id={`history-${ticket.id}`} hidden={!open}>
          {open ? (
            <TicketHistory entries={previous} loading={loadingHistory} className="mt-3" />
          ) : null}
        </div>
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

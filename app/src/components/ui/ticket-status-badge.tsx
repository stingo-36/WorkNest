import * as React from "react";

import { cn } from "@/components/cn";
import {
  WORKFLOW_STATUS_ORDER,
  type WorkflowStatus,
} from "@/lib/workflow-status";

/**
 * Ticket status badge — design.md §4.
 *
 * Status is always rendered as a labelled badge plus a semantic colour. The
 * five workflow stages are intentionally compact: In Progress → Sent to QA →
 * Ready for production → Released → Done.
 *
 * The label is always rendered — never signal state by colour alone (§12).
 *
 * Class strings are written out per status rather than built from a template,
 * because Tailwind only ships classes it can see as literal text.
 */

export const TICKET_STATUS_LABELS: Record<WorkflowStatus, string> = {
  InProgress: "In Progress",
  SentToQA: "Sent to QA",
  ReadyForProduction: "Ready for production",
  Released: "Released",
  Done: "Done",
};

/** Display order for dropdowns and filters — roughly the lifecycle order. */
export const TICKET_STATUS_ORDER: WorkflowStatus[] = [...WORKFLOW_STATUS_ORDER];

/**
 * Every stage looks the same way — light tint, soft ring, dark label — and differs by
 * hue (homepage palette): In Progress blue, Sent to QA orange, Ready for production pink,
 * Released muted ink, Done green. Every label clears 4.5:1 (6.2–8.8:1).
 */
const BADGE_CLASS: Record<WorkflowStatus, string> = {
  InProgress: "bg-status-progress-bg text-status-progress-fg ring-1 ring-inset ring-status-progress/40",
  SentToQA: "bg-status-testing-bg text-status-testing-fg ring-1 ring-inset ring-status-testing/60",
  ReadyForProduction: "bg-status-waiting-bg text-status-waiting-fg ring-1 ring-inset ring-status-waiting/60",
  Released: "bg-status-closed-bg text-status-closed-fg ring-1 ring-inset ring-status-closed/50",
  Done: "bg-status-completed-bg text-status-completed-fg ring-1 ring-inset ring-status-completed/50",
};

/** The bare accent token — dots, a card's 3px left rule, timeline markers. */
export const TICKET_STATUS_DOT: Record<WorkflowStatus, string> = {
  InProgress: "bg-status-progress",
  SentToQA: "bg-status-testing",
  ReadyForProduction: "bg-status-waiting",
  Released: "bg-status-closed",
  Done: "bg-status-completed",
};

export function TicketStatusBadge({
  status,
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { status: WorkflowStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center justify-center gap-1.5 rounded-full px-3 text-center text-xs leading-none font-semibold whitespace-nowrap before:size-1.5 before:shrink-0 before:rounded-full before:bg-current before:opacity-70 before:content-['']",
        BADGE_CLASS[status],
        className,
      )}
      {...props}
    >
      {TICKET_STATUS_LABELS[status]}
    </span>
  );
}


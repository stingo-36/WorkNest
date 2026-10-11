import type { WorkflowStatus } from "@/lib/workflow-status";

/**
 * Quick log drafts — what the AI read out of the pasted text, already matched
 * against the user's own tickets / meetings / people by lib/quick-log.ts.
 * Nothing here is saved until the user applies it (actions/quick-log.ts).
 */

export type QuickLogKind = "worklog" | "todo" | "followup";

export type DraftMeeting = {
  name: string;
  notes: string;
  /** A card with this name is (or will be, from Default meetings) on the day's log. */
  existing: boolean;
};

export type DraftTicket = {
  key: string;
  /** The key exactly as the AI read it from the text, e.g. "1233". */
  written: string;
  title: string;
  projectName: string | null;
  exists: boolean;
  currentStatus: WorkflowStatus | null;
  status: WorkflowStatus;
  update: string;
  /** More than one ticket ends in the written number — the user picks. */
  candidates: Array<{ key: string; title: string; status: WorkflowStatus }>;
};

export type DraftFollowUp = {
  person: string;
  subject: string;
  note: string;
  channel: string;
};

export type DraftTodo = { subject: string; dueDate: string | null };

export type QuickLogDraft =
  | {
      kind: "worklog";
      date: string;
      logExists: boolean;
      ticketsEnabled: boolean;
      meetings: DraftMeeting[];
      tickets: DraftTicket[];
      workDone: string;
      /** Suggestions only — unticked in the preview by default. */
      followUps: DraftFollowUp[];
      channels: string[];
      model: string;
    }
  | {
      kind: "todo";
      todos: DraftTodo[];
      /** null when AI wasn't available and each line became a to-do. */
      model: string | null;
      fallbackReason?: string;
    }
  | {
      kind: "followup";
      followUps: DraftFollowUp[];
      channels: string[];
      model: string;
    };

export type QuickLogApplied = { kind: QuickLogKind; workLogId: string | null; count: number };

import type { TicketStatus as StoredTicketStatus } from "@/generated/prisma/enums";

export const WORKFLOW_STATUS_ORDER = [
  "InProgress",
  "SentToQA",
  "ReadyForProduction",
  "Released",
  "Done",
] as const;

export type WorkflowStatus = (typeof WORKFLOW_STATUS_ORDER)[number];

/**
 * Preserve legacy database rows while presenting one consistent five-stage
 * workflow throughout the UI.
 */
export function normalizeTicketStatus(
  status: StoredTicketStatus | string,
): WorkflowStatus {
  switch (status) {
    case "Open":
    case "InProgress":
      return "InProgress";
    case "Blocked":
    case "Waiting":
    case "SentToQA":
      return "SentToQA";
    case "Testing":
    case "ReadyForProduction":
      return "ReadyForProduction";
    case "Completed":
    case "Released":
      return "Released";
    case "Closed":
    case "Done":
      return "Done";
    default:
      return "InProgress";
  }
}

/**
 * New writes use the requested workflow values. The additive migration makes
 * these valid without changing any historical row.
 */
export function toStoredTicketStatus(
  status: WorkflowStatus,
): StoredTicketStatus {
  return status as StoredTicketStatus;
}

import { z } from "zod";
import {
  EntryKind,
  FollowUpStatus,
  TaskPriority,
  TaskStatus,
} from "@/generated/prisma/enums";
import {
  WORKFLOW_STATUS_ORDER,
  type WorkflowStatus,
} from "@/lib/workflow-status";

/**
 * Every server-side mutation validates its input through one of these.
 * Nothing from the client is trusted — not ids, not enum values, not dates.
 */

export const PASSWORD_MIN_LENGTH = 8;

// --- primitives -------------------------------------------------------------

/** A cuid-ish opaque id. Ownership is still verified against userId in the query. */
export const idSchema = z.string().trim().min(1, "Required").max(64);

export const ticketStatusSchema = z.enum(
  WORKFLOW_STATUS_ORDER,
) as z.ZodType<WorkflowStatus>;

export const taskPrioritySchema = z.enum(
  Object.values(TaskPriority) as [string, ...string[]],
) as z.ZodType<TaskPriority>;

export const taskStatusSchema = z.enum(
  Object.values(TaskStatus) as [string, ...string[]],
) as z.ZodType<TaskStatus>;

export const entryKindSchema = z.enum(
  Object.values(EntryKind) as [string, ...string[]],
) as z.ZodType<EntryKind>;

/** Free text since 2026-10-01 — the options come from the user's Profile list. */
export const followUpChannelSchema = z.string().trim().min(1, "Required").max(60);

export const followUpStatusSchema = z.enum(
  Object.values(FollowUpStatus) as [string, ...string[]],
) as z.ZodType<FollowUpStatus>;

/** Free text since 2026-10-01 — the options come from the user's Profile list. */
export const resourceTypeSchema = z.string().trim().min(1, "Required").max(60);

/** Accepts "YYYY-MM-DD" or a Date; always yields a UTC-midnight Date. */
export const dateOnlySchema = z
  .union([z.string(), z.date()])
  .transform((value, ctx) => {
    const raw = value instanceof Date ? value.toISOString().slice(0, 10) : value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      ctx.addIssue({ code: "custom", message: "Expected a YYYY-MM-DD date" });
      return z.NEVER;
    }
    const parsed = new Date(`${raw}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      ctx.addIssue({ code: "custom", message: "Invalid date" });
      return z.NEVER;
    }
    return parsed;
  });

export const optionalDateSchema = z
  .union([z.string(), z.date(), z.null()])
  .optional()
  .transform((value, ctx) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      ctx.addIssue({ code: "custom", message: "Invalid date" });
      return z.NEVER;
    }
    return parsed;
  });

export const tagsSchema = z
  .union([z.array(z.string()), z.string()])
  .optional()
  .transform((value) => {
    if (!value) return [] as string[];
    const list = Array.isArray(value) ? value : value.split(",");
    return Array.from(
      new Set(list.map((t) => t.trim()).filter(Boolean).slice(0, 25)),
    );
  });

/** Trim + collapse whitespace; used for anything rendered as a heading. */
const cleanLine = (max: number) =>
  z
    .string()
    .trim()
    .min(1, "Required")
    .max(max)
    .transform((s) => s.replace(/\s+/g, " "));

/** Sticky-note text: keeps line breaks (at most one blank line), tidies spaces inside each line. */
const noteLines = (max: number) =>
  z
    .string()
    .transform((s) =>
      s
        .split(/\r?\n/)
        .map((line) => line.replace(/\s+/g, " ").trim())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim(),
    )
    .pipe(z.string().min(1, "Required").max(max));

const optionalCleanLine = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => s.replace(/\s+/g, " ") || null)
    .optional();

const richText = (max: number) =>
  z.string().max(max).optional().transform((s) => (s ?? "").trimEnd());

// --- auth -------------------------------------------------------------------

export const registerSchema = z
  .object({
    name: cleanLine(120),
    email: z.string().trim().toLowerCase().email("Enter a valid email").max(255),
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
      .max(200),
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(255),
  password: z.string().min(1, "Password is required").max(200),
});

const newPasswordFields = {
  newPassword: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
    .max(200),
  confirmPassword: z.string().min(1, "Confirm the new password"),
};

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password").max(200),
    ...newPasswordFields,
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "Choose a password you have not just used",
    path: ["newPassword"],
  });

export const adminResetPasswordSchema = z
  .object({
    userId: idSchema,
    ...newPasswordFields,
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const adminAccountConfirmationSchema = z.object({
  userId: idSchema,
  confirmationEmail: z.string().trim().toLowerCase().email("Enter the account email").max(255),
});

// --- work log ---------------------------------------------------------------

export const dayTypeSchema = z.enum(["Work", "Holiday", "Leave"]);

export const workLogDateSchema = z.object({
  date: dateOnlySchema,
  title: cleanLine(160).optional(),
  /** Only applied when the log is created. */
  dayType: dayTypeSchema.optional(),
});

export const updateWorkLogSchema = z.object({
  workLogId: idSchema,
  title: cleanLine(160).optional(),
  dayType: dayTypeSchema.optional(),
});

export const deleteWorkLogSchema = z.object({ workLogId: idSchema });

// --- meetings ---------------------------------------------------------------

export const createMeetingSchema = z.object({
  workLogId: idSchema,
  name: cleanLine(120),
  notes: richText(20_000),
});

export const updateMeetingSchema = z.object({
  meetingId: idSchema,
  name: cleanLine(120).optional(),
  notes: richText(20_000),
});

export const deleteMeetingSchema = z.object({ meetingId: idSchema });

// --- learning & attachments ------------------------------------------------

export const saveLearningNotesSchema = z.object({
  workLogId: idSchema,
  notes: richText(20_000),
});

/** Body of the leave-the-editor beacon (POST /api/work-logs/[id]/ai-refresh). */
export const refreshWorkLogAiSchema = z.object({
  workLogId: idSchema,
  tzOffset: z.number().int().min(-840).max(840).optional(),
});

export const generateWorkLogSummarySchema = z.object({
  workLogId: idSchema,
  auto: z.boolean().optional(),
  /** The browser's `Date#getTimezoneOffset()` — decides which to-dos fall on the log's day. */
  tzOffset: z.number().int().min(-840).max(840).optional(),
});

export const addWorkLogLinkSchema = z.object({
  workLogId: idSchema,
  url: z
    .string()
    .trim()
    .max(2000)
    .url("Enter a full link, e.g. https://example.com")
    .refine((value) => /^https?:\/\//i.test(value), "Only http(s) links are allowed"),
  label: optionalCleanLine(160),
});

export const deleteWorkLogAttachmentSchema = z.object({ attachmentId: idSchema });

// --- tickets ----------------------------------------------------------------

/** "asu-1234" -> "ASU-1234". Letters/digits/dash/underscore only. */
export const ticketKeySchema = z
  .string()
  .trim()
  .min(1, "Enter a ticket ID")
  .max(64)
  .transform((s) => s.replace(/\s+/g, "").toUpperCase())
  .refine((s) => /^[A-Z0-9][A-Z0-9_-]*$/.test(s), {
    message: "Ticket ID may only contain letters, numbers, - and _",
  });

export const findTicketSchema = z.object({ ticketKey: ticketKeySchema });

export const upsertTicketForWorkLogSchema = z.object({
  workLogId: idSchema,
  ticketKey: ticketKeySchema,
  title: cleanLine(300).optional(),
  /** Project / site — used only when the ticket has to be created. */
  projectName: optionalCleanLine(160),
  status: ticketStatusSchema.optional(),
});

export const createTicketSchema = z.object({
  ticketKey: ticketKeySchema,
  title: cleanLine(300),
  projectName: optionalCleanLine(160),
  status: ticketStatusSchema.optional(),
});

export const saveTicketWorkUpdateSchema = z.object({
  workLogId: idSchema,
  /** Ticket.id (cuid), not the human key. */
  ticketId: idSchema,
  description: richText(20_000),
  status: ticketStatusSchema,
});

export const appendTicketHistoryEntrySchema = z.object({
  ticketId: idSchema,
  body: z.string().trim().min(1, "Write an update before saving").max(20_000),
  status: ticketStatusSchema,
});

export const deleteTicketHistoryEntrySchema = z.object({
  ticketId: idSchema,
  entryId: idSchema,
});

export const detachTicketFromWorkLogSchema = z.object({
  workLogId: idSchema,
  ticketId: idSchema,
});

export const updateTicketSchema = z.object({
  ticketId: idSchema,
  ticketKey: cleanLine(80).optional(),
  title: cleanLine(300).optional(),
  projectName: optionalCleanLine(160),
  status: ticketStatusSchema.optional(),
});

export const deleteTicketSchema = z.object({ ticketId: idSchema });

export const listTicketsSchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: ticketStatusSchema.optional(),
  take: z.coerce.number().int().min(1).max(200).optional(),
  skip: z.coerce.number().int().min(0).optional(),
});

// --- tasks ------------------------------------------------------------------

export const createTaskSchema = z.object({
  title: cleanLine(300),
  description: richText(10_000),
  notes: richText(10_000),
  dueDate: optionalDateSchema,
  priority: taskPrioritySchema.optional(),
  status: taskStatusSchema.optional(),
  ticketId: idSchema.nullish(),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  taskId: idSchema,
});

export const deleteTaskSchema = z.object({ taskId: idSchema });

// --- notes -----------------------------------------------------------------
// Notes are notebooks now (Note -> Section -> Page) and validate through
// `lib/notes.ts`, which the editor imports too. Nothing lives here.

// --- links ------------------------------------------------------------------

export const createLinkSchema = z.object({
  title: cleanLine(300),
  url: z.string().trim().url("Enter a valid URL").max(2000),
  description: richText(5_000),
  category: cleanLine(80).optional(),
  tags: tagsSchema,
});

export const updateLinkSchema = createLinkSchema.partial().extend({
  linkId: idSchema,
});

export const deleteLinkSchema = z.object({ linkId: idSchema });

// --- resources --------------------------------------------------------------

export const createResourceSchema = z.object({
  title: cleanLine(300),
  description: richText(5_000),
  type: resourceTypeSchema.optional(),
  url: z.string().trim().url("Enter a valid URL").max(2000).nullish().or(z.literal("")),
  content: richText(100_000),
  tags: tagsSchema,
});

export const updateResourceSchema = createResourceSchema.partial().extend({
  resourceId: idSchema,
});

export const deleteResourceSchema = z.object({ resourceId: idSchema });

// --- follow-ups -------------------------------------------------------------

/** A follow-up due date is a plain calendar day; no time component is stored. */
export const followUpDueDateSchema = z
  .union([z.string(), z.date(), z.null()])
  .optional()
  .transform((value, ctx) => {
    if (value === null || value === undefined || value === "") return null;
    const raw =
      value instanceof Date ? value.toISOString().slice(0, 10) : value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      ctx.addIssue({ code: "custom", message: "Expected a YYYY-MM-DD date" });
      return z.NEVER;
    }
    const parsed = new Date(`${raw}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      ctx.addIssue({ code: "custom", message: "Invalid date" });
      return z.NEVER;
    }
    return parsed;
  });

/**
 * A Tracker update's rich text: a TipTap document, capped by serialised size.
 * It's rendered only through the editor schema (unknown nodes and non-upload
 * image sources are dropped there), never as raw HTML.
 */
const richDocSchema = z
  .unknown()
  .optional()
  .refine((value) => value === undefined || (typeof value === "object" && value !== null && (value as { type?: unknown }).type === "doc"), "Invalid text")
  .refine((value) => value === undefined || JSON.stringify(value).length <= 300_000, "That note is too long");

export const createFollowUpSchema = z
  .object({
    kind: entryKindSchema.default("FollowUp"),
    /** Optional here, then required for FollowUp in the refinement below. */
    person: z.string().trim().max(120).optional(),
    /** Line breaks survive only on a personal to-do (a sticky note); see the transform below. */
    subject: noteLines(1_000),
    ticketKey: z.string().trim().max(64).nullish().or(z.literal("")),
    dueDate: followUpDueDateSchema,
    /** Optional: a thread can be opened before there is anything to record. */
    note: z.string().trim().max(10_000).optional(),
    doc: richDocSchema,
    channel: followUpChannelSchema.optional(),
    occurredAt: optionalDateSchema,
    tags: tagsSchema,
    /** A personal to-do (sticky note). Ignored for anything but a Task. */
    personal: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    // Only a follow-up is addressed to someone. A task or a note is yours, so
    // demanding a name there would be noise — and a Note has no date either.
    if (value.kind === "FollowUp" && !value.person) {
      ctx.addIssue({
        code: "custom",
        path: ["person"],
        message: "Who did you update?",
      });
    }
    if (value.kind === "Note" && value.dueDate) {
      ctx.addIssue({
        code: "custom",
        path: ["dueDate"],
        message: "Notes have no due date — add it as a to-do instead",
      });
    }
    if (!(value.kind === "Task" && value.personal) && value.subject.length > 300) {
      ctx.addIssue({ code: "custom", path: ["subject"], message: "Keep it under 300 characters" });
    }
  })
  // Everything but a sticky note is a one-line title.
  .transform((value) =>
    value.kind === "Task" && value.personal ? value : { ...value, subject: value.subject.replace(/\s+/g, " ") },
  );

/** Rewrite a personal to-do's text (sticky notes are editable; work records aren't). */
export const editPersonalTodoSchema = z.object({ followUpId: idSchema, subject: noteLines(1_000) });

/**
 * A change from the phone (`PATCH /api/mobile/tracker/:id`), one at a time, the
 * same edits the Tracker allows inline: tick/untick, rewrite a sticky note's
 * text, star/unstar, or move the due date.
 */
export const mobileTrackerPatchSchema = z
  .object({
    status: followUpStatusSchema.optional(),
    subject: noteLines(1_000).optional(),
    pinned: z.boolean().optional(),
    /** "YYYY-MM-DD", or null to clear. Kept raw so "absent" and "clear" differ; parse with `followUpDueDateSchema`. */
    dueDate: z.union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date"), z.null()]).optional(),
  })
  .refine(
    (value) => [value.status, value.subject, value.pinned, value.dueDate].filter((field) => field !== undefined).length === 1,
    "Send one change: a status, a subject, pinned or a due date",
  );

/**
 * Appending is the only write that touches history, so `note` is required —
 * except for their reply, where "they replied" is itself the fact worth keeping.
 */
export const addFollowUpUpdateSchema = z
  .object({
    followUpId: idSchema,
    note: z.string().trim().max(10_000),
    doc: richDocSchema,
    channel: followUpChannelSchema.optional(),
    occurredAt: optionalDateSchema,
    fromThem: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.fromThem && !value.note && !value.doc) {
      ctx.addIssue({ code: "custom", path: ["note"], message: "Write something first" });
    }
  });

export const setFollowUpPinnedSchema = z.object({
  followUpId: idSchema,
  pinned: z.boolean(),
});

export const setFollowUpStatusSchema = z.object({
  followUpId: idSchema,
  status: followUpStatusSchema,
});

export const rescheduleFollowUpSchema = z.object({
  followUpId: idSchema,
  dueDate: followUpDueDateSchema,
});

export const deleteFollowUpSchema = z.object({ followUpId: idSchema });

export const setFollowUpTagsSchema = z.object({
  followUpId: idSchema,
  tags: tagsSchema,
});

/** A work log's calendar day, for the "to-dos that day" card. */
export const todosForDaySchema = z.object({ date: followUpDueDateSchema });
export const trackerForRangeSchema = z.object({ from: z.coerce.date(), to: z.coerce.date() }).refine((value) => value.from < value.to, "`from` must be before `to`");

// --- quick log --------------------------------------------------------------

export const quickLogKindSchema = z.enum(["worklog", "todo", "followup"]);

/** Step 1: the pasted text goes to the AI. Nothing is written. */
export const draftQuickLogSchema = z.object({
  kind: quickLogKindSchema,
  text: z
    .string()
    .trim()
    .min(1, "Paste some text first")
    .max(12_000, "That's too long — keep it under 12,000 characters"),
  /** The work log's day. */
  date: dateOnlySchema,
  /** The browser's own today, so "tomorrow" / "Friday" resolve in the user's timezone. */
  today: dateOnlySchema,
});

/** The work-log template for a day (that day's meeting cards). */
export const quickLogTemplateSchema = z.object({ date: dateOnlySchema });

const quickFollowUpSchema = z.object({
  person: z.string().trim().min(1, "Who is the follow-up with?").max(120),
  subject: cleanLine(300),
  note: z.string().trim().max(10_000).optional(),
  channel: followUpChannelSchema.optional(),
});

/**
 * Step 2: the reviewed draft, as edited in the preview. Re-validated in full —
 * ticket keys are looked up again by key + userId, never trusted as ids.
 */
export const applyQuickLogSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("worklog"),
    date: dateOnlySchema,
    meetings: z
      .array(z.object({ name: cleanLine(120), notes: z.string().trim().min(1, "Meeting notes are empty").max(20_000) }))
      .max(20),
    tickets: z
      .array(
        z.object({
          key: ticketKeySchema,
          title: optionalCleanLine(300),
          projectName: optionalCleanLine(160),
          status: ticketStatusSchema,
          update: z.string().trim().max(20_000),
        }),
      )
      .max(30),
    workDone: richText(20_000),
    followUps: z.array(quickFollowUpSchema).max(20),
  }),
  z.object({
    kind: z.literal("todo"),
    todos: z
      .array(z.object({ subject: cleanLine(300), dueDate: followUpDueDateSchema }))
      .min(1, "Nothing to add")
      .max(50),
  }),
  z.object({
    kind: z.literal("followup"),
    followUps: z.array(quickFollowUpSchema).min(1, "Nothing to add").max(30),
  }),
]);

// --- profile ---------------------------------------------------------------

export const updateProfileSchema = z.object({
  name: z.string().trim().max(80, "Keep the name under 80 characters"),
  /** "YYYY-MM-DD", or null to use the app default. */
  sprintStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date").nullable(),
  sprintLengthDays: z.number().int().min(5, "At least 5 days").max(42, "At most 6 weeks"),
  ticketsEnabled: z.boolean(),
});

export const saveOpenRouterKeySchema = z.object({
  apiKey: z.string().trim().min(10, "That doesn't look like an OpenRouter key").max(300).regex(/^\S+$/, "Keys don't contain spaces"),
});

/** Comma-separated OpenRouter model ids, or "" for the default. */
export const saveOpenRouterModelSchema = z.object({
  model: z.string().trim().max(500).regex(/^([\w.\-/:]+(\s*,\s*[\w.\-/:]+)*)?$/, "Use model ids like openrouter/free, separated by commas"),
});

/** Reports: any day inside the sprint, "YYYY-MM-DD". */
export const generateReportSchema = z.object({
  sprint: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a sprint"),
});

export const toggleResourceFavoriteSchema =z.object({ resourceId: idSchema, favorite: z.boolean() });

// --- profile lists -----------------------------------------------------------

const listValue = z.string().trim().min(1, "Required").max(60);

export const setOrderedListSchema = z.object({
  kind: z.enum(["FollowUpChannel", "ResourceType", "DefaultMeeting"]),
  values: z.array(listValue).max(50),
});

export const resetOrderedListSchema = z.object({
  kind: z.enum(["FollowUpChannel", "ResourceType", "DefaultMeeting"]),
});

export const projectNameSchema = z.object({ name: listValue });

const tagKind = z.enum(["NoteTag", "ResourceTag"]);
const tagValue = z.string().trim().min(1, "Required").max(40);

export const tagSchema = z.object({ kind: tagKind, tag: tagValue });

export const tagKindSchema = z.object({ kind: tagKind });

/** An icon from the note icon index: "si:SiGithub", "lu:LuGlobe", "fa6:FaBook". null = back to the guess. */
export const setResourceTypeIconSchema = z.object({
  type: listValue,
  icon: z.string().regex(/^(si|lu|fa6):[A-Za-z0-9]{2,60}$/, "Pick an icon from the list").nullable(),
});

export const renameTagSchema = z.object({ kind: tagKind, from: tagValue, to: tagValue });

// --- achievements ------------------------------------------------------------

const optionalDayKey = z
  .string()
  .trim()
  .refine((s) => s === "" || /^\d{4}-\d{2}-\d{2}$/.test(s), "Pick a valid date")
  .nullable()
  .optional()
  .transform((s) => (s ? new Date(`${s}T00:00:00.000Z`) : null));

export const achievementSchema = z
  .object({
    title: cleanLine(160),
    type: z.string().trim().min(1, "Required").max(60),
    status: z.enum(["InProgress", "Completed"]),
    assignedBy: optionalCleanLine(80),
    startDate: optionalDayKey,
    endDate: optionalDayKey,
    description: richText(5000),
  })
  .refine((data) => !data.startDate || !data.endDate || data.endDate >= data.startDate, {
    message: "End date can't be before the start date",
    path: ["endDate"],
  });

export const updateAchievementSchema = z.object({ achievementId: idSchema, data: achievementSchema });

export const achievementIdSchema = z.object({ achievementId: idSchema });

export const achievementFileIdSchema = z.object({ fileId: idSchema });

/** Ask your workspace: one question, plus a few earlier turns for follow-ups. */
/**
 * A Tracker item the Ask AI drafted. Checked here so a malformed reply never
 * reaches the chat; adding it still goes through `createFollowUpSchema`.
 */
export const askProposalSchema = z
  .object({
    kind: z.enum(["todo", "followup", "note"]),
    subject: z.string().trim().min(1).max(300),
    person: z.string().trim().max(120).nullish(),
    note: z.string().trim().max(2_000).nullish(),
    due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
    tags: z.array(z.string().trim().max(40)).max(8).nullish(),
  })
  .refine((item) => item.kind !== "followup" || Boolean(item.person), "A follow-up needs a person")
  .transform((item) => ({
    action: "create" as const,
    kind: item.kind === "todo" ? ("Task" as const) : item.kind === "followup" ? ("FollowUp" as const) : ("Note" as const),
    subject: item.subject.replace(/\s+/g, " "),
    person: item.kind === "followup" ? item.person!.trim() : null,
    note: item.note || null,
    dueDate: item.kind === "note" ? null : (item.due ?? null),
    tags: (item.tags ?? []).map((tag) => tag.replace(/^#/, "").toLowerCase()).filter(Boolean),
  }));
/** A change to an existing Tracker entry the Ask AI proposed, by record number (the server maps it to an id). */
export const askChangeSchema = z
  .object({
    record: z.coerce.number().int().min(1),
    change: z.enum(["done", "reopen", "reschedule", "add_update"]),
    due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
    note: z.string().trim().max(2_000).nullish(),
    from_them: z.boolean().nullish(),
  })
  .transform((value) => ({
    record: value.record,
    change: value.change === "add_update" ? ("update" as const) : value.change,
    due: value.due ?? null,
    note: value.note || null,
    fromThem: Boolean(value.from_them),
  }));

/** Ask's work-log lookup: a date range of at most 62 days. */
export const askRangeSchema = z
  .object({ from: dateOnlySchema, to: dateOnlySchema })
  .refine((range) => range.from <= range.to && range.to.getTime() - range.from.getTime() <= 62 * 86_400_000, "At most 62 days, from before to");

type AskCreate = z.output<typeof askProposalSchema>;
type AskChange = {
  action: "done" | "reopen" | "reschedule" | "update";
  entryId: string;
  kind: AskCreate["kind"];
  subject: string;
  dueDate: string | null;
  note: string | null;
  fromThem: boolean;
  /** The item's due date now, so two same-named items can be told apart on the card. */
  currentDue: string | null;
};
/** One thing Ask proposes; the chat applies it through the normal Tracker actions when the user confirms. */
export type AskProposal = AskCreate | AskChange;

export const askWorkspaceSchema = z.object({
  question: z.string().trim().min(2, "Type a message first").max(500, "Keep the message under 500 characters"),
  history: z
    .array(z.object({ question: z.string().max(500), answer: z.string().max(4_000) }))
    .max(10)
    .default([]),
  /** The browser's local day, so "today" and "this week" mean the user's day. */
  today: dateOnlySchema,
});

import { z } from "zod";

/**
 * One result shape for every server action, so the frontend never has to guess.
 *
 *   success -> { ok: true,  data }
 *   failure -> { ok: false, error: { code, message, fields? } }
 */

export type ActionErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "CONFLICT"
  /** AI (OpenRouter) isn't set up or failed; the message says why. */
  | "AI_UNAVAILABLE"
  | "INTERNAL_ERROR";

export type ActionError = {
  code: ActionErrorCode;
  message: string;
  /** Per-field messages, keyed by form field name. Present for VALIDATION_ERROR. */
  fields?: Record<string, string>;
};

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ActionError };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail<T = never>(
  code: ActionErrorCode,
  message: string,
  fields?: Record<string, string>,
): ActionResult<T> {
  return { ok: false, error: { code, message, ...(fields ? { fields } : {}) } };
}

export function notFound<T = never>(what = "Not found"): ActionResult<T> {
  return fail<T>("NOT_FOUND", what);
}

/** Flattens a ZodError into { fieldName: firstMessage }. */
export function zodFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_form";
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

/** Validate or produce a VALIDATION_ERROR result. */
export function parseOrFail<S extends z.ZodTypeAny>(
  schema: S,
  input: unknown,
):
  | { ok: true; data: z.output<S> }
  | { ok: false; error: ActionError } {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fields = zodFields(parsed.error);
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: fields._form ?? Object.values(fields)[0] ?? "Invalid input",
        fields,
      },
    };
  }
  return { ok: true, data: parsed.data };
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseDocument, saveDocument, splitMessage } from "@/lib/note-import";
import * as store from "@/lib/note-store";
import { noteSchema, type NoteInput } from "@/lib/notes";
import { fail, ok, parseOrFail } from "@/lib/result";
import { requireUserId } from "@/lib/session";
import { notebookDetailsSchema, notebookImportSchema } from "@/lib/validation";

/**
 * Notes server actions.
 *
 * These use `useActionState` form state rather than the `ActionResult` shape the
 * rest of the app uses, because the note editor posts its whole tree as one
 * hidden JSON field and needs per-path field errors back — the same contract the
 * Nexa editor was written against.
 */

export type NoteFormState = {
  errors?: Record<string, string[]>;
  message?: string;
};

/**
 * The editor posts the whole note — title, sections and pages — as one JSON
 * string, because the tree is far too nested for flat form fields.
 */
function parseNotePayload(
  formData: FormData,
): { ok: true; data: NoteInput } | { ok: false; state: NoteFormState } {
  const raw = formData.get("notes");
  if (typeof raw !== "string" || !raw) {
    return { ok: false, state: { message: "The note could not be read." } };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { ok: false, state: { message: "The note could not be read." } };
  }

  const parsed = noteSchema.safeParse(payload);
  if (!parsed.success) {
    const errors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "form";
      errors[key] = [...(errors[key] ?? []), issue.message];
    }
    return {
      ok: false,
      state: { errors, message: "Please fix the highlighted fields." },
    };
  }

  return { ok: true, data: parsed.data };
}

export async function createNote(
  _prev: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  const userId = await requireUserId();

  const parsed = parseNotePayload(formData);
  if (!parsed.ok) return parsed.state;

  const noteId = await store.createNote(userId, parsed.data);

  revalidatePath("/notes");
  redirect(`/notes/${noteId}`);
}

export async function updateNote(
  _prev: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  const userId = await requireUserId();

  const id = String(formData.get("id") ?? "");
  if (!id) return { message: "The note could not be read." };

  const parsed = parseNotePayload(formData);
  if (!parsed.ok) return parsed.state;

  const saved = await store.updateNote(userId, id, parsed.data);
  if (!saved) return { message: "That note no longer exists." };

  revalidatePath("/notes");
  revalidatePath(`/notes/${id}`);
  redirect(`/notes/${id}`);
}

/** Move a note to trash. Nothing is removed from the database here. */
export async function deleteNote(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await store.trashNote(userId, id);

  revalidatePath("/notes");
  redirect("/notes");
}

export async function restoreNote(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await store.restoreNote(userId, id);
  revalidatePath("/notes");
}

/** Flip a note's favourite from the list, without opening the editor. */
export async function toggleNoteFavorite(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await store.toggleFavorite(userId, id);

  revalidatePath("/notes");
  revalidatePath(`/notes/${id}`);
}

/**
 * Save a document pasted into Ask as notebook pages: into `noteId` (making it
 * match the document), or as a new notebook — what the chat sends when the user
 * presses Save on Ask's card. Unlike the editor actions above this returns an
 * `ActionResult`. Input: { markdown, noteId?, title, description?, iconName?, iconLibrary? }.
 */
export async function importNotebook(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(notebookImportSchema, input);
  if (!parsed.ok) return parsed;
  const { markdown, noteId, title, description, iconName, iconLibrary } = parsed.data;

  const document = parseDocument(splitMessage(markdown)?.document ?? markdown);
  if (!document) return fail("VALIDATION_ERROR", "There's nothing in that document to save.");

  const saved = await saveDocument(userId, document, noteId ?? null, { title, description, iconName, iconLibrary });
  if (!saved) return fail("NOT_FOUND", "That notebook no longer exists.");
  revalidatePath("/notes");
  revalidatePath(`/notes/${saved.noteId}`);
  return ok({ id: saved.noteId, mode: saved.mode });
}

/**
 * Create an empty notebook, or change an existing one's title, description or
 * icon — what Ask proposes and the chat sends on confirm. Returns an
 * `ActionResult` like `importNotebook`. Input: { noteId?, title, description?, iconName?, iconLibrary? }.
 */
export async function saveNotebookDetails(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(notebookDetailsSchema, input);
  if (!parsed.ok) return parsed;
  const { noteId, title, description, iconName, iconLibrary } = parsed.data;
  // An icon is a pair; half of one is no icon.
  const icon = iconName && iconLibrary ? { iconName, iconLibrary } : {};

  if (!noteId) {
    const id = await store.createNote(userId, { title, description: description ?? "", ...icon, sections: [] });
    revalidatePath("/notes");
    return ok({ id, mode: "create" as const });
  }
  const saved = await store.updateNoteDetails(userId, noteId, { title, ...(description != null ? { description: description || null } : {}), ...icon });
  if (!saved) return fail("NOT_FOUND", "That notebook no longer exists.");
  revalidatePath("/notes");
  revalidatePath(`/notes/${noteId}`);
  return ok({ id: noteId, mode: "update" as const });
}

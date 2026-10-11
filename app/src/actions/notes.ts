"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import * as store from "@/lib/note-store";
import { noteSchema, type NoteInput } from "@/lib/notes";
import { requireUserId } from "@/lib/session";

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

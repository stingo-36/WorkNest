import { z } from "zod";

/**
 * Notes are a three-level notebook — Note -> Section -> Page — ported from the
 * Nexa project so both apps shape a note the same way. The note carries no body
 * text; everything written lives on a page as a TipTap document.
 *
 * This file is SHARED (no `server-only`): the editor imports the schemas to
 * validate before it posts. The Prisma side lives in `lib/note-store.ts`.
 */

/** The react-icons sets the picker is allowed to draw from. */
export const NOTE_ICON_LIBRARIES = ["si", "lu", "fa6"] as const;

/**
 * A page's body is a TipTap document, so the shape is the editor's business,
 * not ours — validate that it is an object and store it as-is.
 */
const tiptapContent = z.unknown().refine(
  (value) => typeof value === "object" && value !== null && !Array.isArray(value),
  "That page's content could not be read.",
);

export const notePageSchema = z.object({
  // absent on pages the editor has just added
  id: z.string().optional(),
  title: z
    .string()
    .trim()
    .min(1, "Give the page a title.")
    .max(200, "Keep the page title under 200 characters."),
  content: tiptapContent,
  order: z.number().int().min(0),
});

export const noteSectionSchema = z.object({
  id: z.string().optional(),
  title: z
    .string()
    .trim()
    .min(1, "Give the section a title.")
    .max(200, "Keep the section title under 200 characters."),
  order: z.number().int().min(0),
  pages: z.array(notePageSchema),
});

export const noteSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Give the note a title.")
    .max(200, "Keep the title under 200 characters."),
  description: z
    .string()
    .trim()
    .max(2000, "Keep the description under 2000 characters.")
    .optional()
    .or(z.literal("")),
  iconName: z.string().trim().max(100).optional().or(z.literal("")),
  iconLibrary: z.enum(NOTE_ICON_LIBRARIES).optional(),
  sections: z.array(noteSectionSchema),
});

export type NoteInput = z.infer<typeof noteSchema>;

/** One page as a page component hands it to the form. */
export type NotePageDetail = {
  id: string;
  title: string;
  content: unknown;
  order: number;
};

export type NoteSectionDetail = {
  id: string;
  title: string;
  order: number;
  pages: NotePageDetail[];
};

/** A single note with its whole tree — what the editor screen reads. */
export type NoteDetail = {
  id: string;
  title: string;
  description: string | null;
  iconName: string | null;
  iconLibrary: string | null;
  favorite: boolean;
  createdAt: Date;
  updatedAt: Date;
  sections: NoteSectionDetail[];
};

/** A note as it appears in the list, without the page bodies. */
export type NoteSummary = {
  id: string;
  title: string;
  description: string | null;
  iconName: string | null;
  iconLibrary: string | null;
  favorite: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** section titles in editor order — the whole of the list preview */
  sectionTitles: string[];
  /** total pages across every section (a count — bodies are never loaded) */
  pageCount: number;
};

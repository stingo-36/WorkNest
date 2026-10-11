import { NoteLibrary } from "@/components/notes/NoteLibrary";
import { isLightColor, noteAccent } from "@/lib/note-colors";
import { listNotes } from "@/lib/note-store";
import { requireUserId } from "@/lib/session";

export const metadata = { title: "Notes" };

export default async function NotesPage() {
  const userId = await requireUserId();
  const notes = await listNotes(userId);

  return (
    <NoteLibrary
      notes={notes.map((note) => {
        const accent = noteAccent(note.iconName, note.id);
        return {
          id: note.id,
          title: note.title,
          description: note.description,
          iconName: note.iconName,
          iconLibrary: note.iconLibrary,
          // Pale brand colours (JS yellow) are darkened so the bare icon stays legible on white.
          iconColor: isLightColor(accent) ? `color-mix(in srgb, ${accent} 60%, var(--c-text))` : accent,
          coverColor: accent,
          coverInk: isLightColor(accent) ? "var(--c-text)" : "var(--c-text-inverse)",
          favorite: note.favorite,
          sectionTitles: note.sectionTitles,
          pageCount: note.pageCount,
          updatedLabel: note.updatedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
        };
      })}
    />
  );
}

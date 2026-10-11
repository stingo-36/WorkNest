import { FileText } from "lucide-react";
import { notFound } from "next/navigation";

import { NoteIcon } from "@/components/notes/NoteIcon";
import { NoteReader } from "@/components/notes/NoteReader";
import { isLightColor, noteAccent } from "@/lib/note-colors";
import { getNote } from "@/lib/note-store";
import { requireUserId } from "@/lib/session";

export const metadata = { title: "Note" };

export default async function NotePage({ params }: { params: Promise<{ noteId: string }> }) {
  const { noteId } = await params;
  const userId = await requireUserId();
  const note = await getNote(userId, noteId);
  if (!note) notFound();

  const accent = noteAccent(note.iconName, note.id);
  // Pale brand colours (JS yellow) need darkening to read as an icon or label on white.
  const iconColor = isLightColor(accent) ? "color-mix(in srgb, var(--note) 65%, var(--c-text))" : "var(--note)";

  return (
    <NoteReader
      note={{
        id: note.id,
        title: note.title,
        description: note.description,
        favorite: note.favorite,
        updatedLabel: note.updatedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
      }}
      icon={
        <NoteIcon
          icon={note.iconLibrary && note.iconName ? { library: note.iconLibrary, name: note.iconName } : null}
          className="size-6"
          fallback={<FileText className="size-6" />}
        />
      }
      accent={accent}
      iconColor={iconColor}
      sections={note.sections.map((section) => ({
        id: section.id,
        title: section.title,
        pages: section.pages.map((page) => ({ id: page.id, title: page.title, content: page.content })),
      }))}
    />
  );
}

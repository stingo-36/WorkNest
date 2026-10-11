import { notFound } from "next/navigation";

import { updateNote } from "@/actions/notes";
import { NoteForm } from "@/components/notes/NoteForm";
import { PageHeader } from "@/components/shell/page-header";
import { getNote } from "@/lib/note-store";
import { requireUserId } from "@/lib/session";

export const metadata = { title: "Edit note" };

export default async function EditNotePage({
  params,
}: {
  params: Promise<{ noteId: string }>;
}) {
  const { noteId } = await params;
  const userId = await requireUserId();
  const note = await getNote(userId, noteId);
  if (!note) notFound();

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        title="Edit note"
        description="Sections and pages you remove here are gone for good when you save."
      />
      <NoteForm
        action={updateNote}
        heading="Edit note"
        submitLabel="Save changes"
        defaults={{
          id: note.id,
          title: note.title,
          description: note.description,
          iconName: note.iconName,
          iconLibrary: note.iconLibrary,
          sections: note.sections,
        }}
      />
    </div>
  );
}

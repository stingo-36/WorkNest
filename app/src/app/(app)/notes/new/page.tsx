import { createNote } from "@/actions/notes";
import { NoteForm } from "@/components/notes/NoteForm";
import { PageHeader } from "@/components/shell/page-header";

export const metadata = { title: "New note" };

export default function NewNotePage() {
  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        title="New note"
        description="Give it a title, then add sections and pages. Each page is a full rich-text document."
      />
      <NoteForm action={createNote} heading="New note" submitLabel="Save note" />
    </div>
  );
}

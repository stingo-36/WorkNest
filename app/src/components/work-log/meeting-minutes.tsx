"use client";

import { FileText, Link2, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import { createMeetingMinutes, linkMeetingMinutes, listMeetingMinutesOptions, unlinkMeetingMinutes } from "@/actions/worklog";
import { cn } from "@/components/cn";
import { UpdateEditor, type EditorValue } from "@/components/tracker/update-editor";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { TagChip } from "@/components/ui/tag-chip";
import { toast } from "@/components/ui/toast";
import type { EditorMeeting, MeetingMinutesRef } from "@/components/work-log/types";

type Candidate = { id: string; subject: string; tags: string[]; archivedAt: Date | null };

/** Where a MoM opens: its Tracker Note, in the entry dialog. */
const minutesHref = (id: string) => `/tracker?open=${id}`;

/**
 * The meeting card's "Minutes" row: links to full minutes of meeting (MoM),
 * which live in Tracker → Notes (tagged `mom`). Write a new MoM here, or link
 * one that already exists. Unlinking never deletes the note.
 */
export function MeetingMinutes({
  meeting,
  dateKey,
  onChange,
}: {
  meeting: EditorMeeting;
  /** The day, YYYY-MM-DD — used in a new MoM's suggested title. */
  dateKey: string;
  onChange: (minutes: MeetingMinutesRef[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState<EditorValue>({ doc: null, text: "", hasContent: false });
  const [subjectError, setSubjectError] = useState<string>();
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const linkedIds = useMemo(() => new Set(meeting.minutes.map((item) => item.id)), [meeting.minutes]);

  function openPicker() {
    setMode("new");
    setSubject(`${meeting.name} — ${dateKey}`);
    setBody({ doc: null, text: "", hasContent: false });
    setSubjectError(undefined);
    setQuery("");
    setOpen(true);
    startTransition(async () => {
      const result = await listMeetingMinutesOptions();
      if (result.ok) setCandidates(result.data);
      else toast.error(result.error.message);
    });
  }

  function saveNew() {
    if (!subject.trim()) { setSubjectError("Give the minutes a title"); return; }
    startTransition(async () => {
      const result = await createMeetingMinutes({ meetingId: meeting.id, subject, doc: body.doc ?? undefined });
      if (!result.ok) { toast.error(result.error.message); return; }
      onChange([...meeting.minutes, { id: result.data.id, subject: result.data.subject, archived: false }]);
      setOpen(false);
      toast.success("Minutes saved to Tracker → Notes and linked");
    });
  }

  function link(candidate: Candidate) {
    startTransition(async () => {
      const result = await linkMeetingMinutes({ meetingId: meeting.id, followUpId: candidate.id });
      if (!result.ok) { toast.error(result.error.message); return; }
      onChange([...meeting.minutes, { id: candidate.id, subject: candidate.subject, archived: Boolean(candidate.archivedAt) }]);
      setOpen(false);
    });
  }

  function unlink(item: MeetingMinutesRef) {
    startTransition(async () => {
      const result = await unlinkMeetingMinutes({ meetingId: meeting.id, followUpId: item.id });
      if (!result.ok) { toast.error(result.error.message); return; }
      onChange(meeting.minutes.filter((minutes) => minutes.id !== item.id));
    });
  }

  const needle = query.trim().toLowerCase();
  const shown = (candidates ?? []).filter((item) => !needle || item.subject.toLowerCase().includes(needle) || item.tags.some((tag) => tag.includes(needle.replace(/^#/, ""))));

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
      <span className="text-xs font-semibold tracking-[0.08em] text-text-subtle uppercase">Minutes</span>
      {meeting.minutes.map((item) => (
        <span key={item.id} className="flex max-w-full min-w-0 items-center rounded-full border border-border bg-surface-2 text-sm">
          <Link href={minutesHref(item.id)} className="flex min-w-0 items-center gap-1.5 rounded-full py-1 pr-1 pl-3 font-medium text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-primary">
            <FileText className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.subject}</span>
            {item.archived ? <span className="shrink-0 text-xs text-text-subtle">(archived)</span> : null}
          </Link>
          <button type="button" onClick={() => unlink(item)} disabled={pending} aria-label={`Unlink ${item.subject}`} title="Unlink (the note stays in Tracker)" className="mr-1 grid size-6 shrink-0 cursor-pointer place-items-center rounded-full text-text-subtle transition-colors duration-150 hover:bg-surface-3 hover:text-text">
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </span>
      ))}
      <Button variant="subtle" size="sm" onClick={openPicker}>
        <Link2 aria-hidden="true" />
        {meeting.minutes.length ? "Add minutes" : "Add full minutes (MoM)"}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        eyebrow={meeting.name}
        title="Minutes of meeting"
        footer={mode === "new" ? (
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={saveNew} loading={pending}>Save &amp; link</Button>
          </>
        ) : undefined}
      >
        <div role="radiogroup" aria-label="Minutes source" className="mb-4 inline-flex rounded-xl border border-border bg-surface-2 p-1">
          {([["new", "Write new", Plus], ["existing", "Link existing", Link2]] as const).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              onClick={() => setMode(value)}
              className={cn("flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors duration-150", mode === value ? "bg-sidebar text-sidebar-fg" : "text-text-muted hover:bg-surface-3 hover:text-text")}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        {mode === "new" ? (
          <div className="flex flex-col gap-4">
            <Field label="Title" htmlFor="mom-subject" error={subjectError}>
              <Input id="mom-subject" value={subject} maxLength={300} onChange={(event) => { setSubject(event.target.value); setSubjectError(undefined); }} />
            </Field>
            <div className="flex flex-col gap-2">
              <label htmlFor="mom-body" className="text-sm font-semibold text-text">Minutes</label>
              <UpdateEditor id="mom-body" label="Minutes" placeholder="Attendees, discussion, decisions, action items…" boxed minHeight="min-h-56" onChange={setBody} onSubmit={saveNew} />
              <p className="text-xs text-text-subtle">Saved as a note in Tracker → Notes, tagged #mom. Add to it there later.</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <label htmlFor="mom-search" className="sr-only">Search notes</label>
            <Input id="mom-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notes or #tag" startIcon={<Search className="size-4" aria-hidden="true" />} />
            {candidates === null ? (
              <p className="py-6 text-center text-sm text-text-muted">Loading notes…</p>
            ) : shown.length === 0 ? (
              <p className="py-6 text-center text-sm text-text-muted">{candidates.length ? "No notes match." : "No Tracker notes yet — write new minutes instead."}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {shown.map((item) => {
                  const linked = linkedIds.has(item.id);
                  return (
                    <li key={item.id}>
                      <button type="button" disabled={linked || pending} onClick={() => link(item)} className="flex w-full min-w-0 cursor-pointer flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors duration-150 hover:bg-surface-2 disabled:cursor-default disabled:opacity-60">
                        <FileText className="size-4 shrink-0 text-text-subtle" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">{item.subject}</span>
                        {item.tags.slice(0, 3).map((tag) => <TagChip key={tag} tag={tag} />)}
                        {linked ? <span className="text-xs text-text-subtle">Linked</span> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

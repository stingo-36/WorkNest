"use client";

import { FileText, Loader2, Plus } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { createMeeting, deleteMeeting, updateMeeting } from "@/actions/worklog";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { toast } from "@/components/ui/toast";
import { MarkdownEditor } from "@/components/work-log/markdown-editor";
import { MeetingMinutes } from "@/components/work-log/meeting-minutes";
import { useAutosave } from "@/components/work-log/save-status";
import { StepHeading } from "@/components/work-log/section-heading";
import type { EditorMeeting, MeetingMinutesRef } from "@/components/work-log/types";

/** One meeting as a row: name, a small notes box, Minutes and Skip. */
function MeetingRow({
  meeting,
  dateKey,
  busy,
  onChange,
  onMinutesChange,
  onSkip,
}: {
  meeting: EditorMeeting;
  dateKey: string;
  busy: boolean;
  onChange: (notes: string) => void;
  onMinutesChange: (minutes: MeetingMinutesRef[]) => void;
  onSkip: () => void;
}) {
  const [showMinutes, setShowMinutes] = useState(meeting.minutes.length > 0);
  const { flush } = useAutosave({
    id: `meeting:${meeting.id}`,
    value: meeting.notes,
    initial: meeting.notes,
    save: async (value) => {
      const result = await updateMeeting({ meetingId: meeting.id, notes: value });
      return result.ok ? { ok: true } : { ok: false, message: result.error.message };
    },
  });

  return (
    <li className="wl-meeting">
      <label htmlFor={`meeting-${meeting.id}`} className="wl-meeting-name">{meeting.name}</label>
      <MarkdownEditor
        id={`meeting-${meeting.id}`}
        compact
        value={meeting.notes}
        ariaLabel={`${meeting.name} notes`}
        placeholder="What was decided?"
        minHeight="min-h-6"
        onChange={onChange}
        onBlur={() => flush()}
        className="min-w-0"
      />
      <div className="wl-meeting-acts">
        {!showMinutes ? (
          <button type="button" onClick={() => setShowMinutes(true)} className="wl-link-btn" aria-label={`Add minutes for ${meeting.name}`}>
            <FileText className="size-3.5" aria-hidden="true" />Minutes
          </button>
        ) : null}
        <button type="button" onClick={onSkip} disabled={busy} className="wl-link-btn" aria-label={`Skip ${meeting.name} today`}>Skip</button>
      </div>
      {showMinutes ? (
        <div className="wl-meeting-minutes">
          <MeetingMinutes meeting={meeting} dateKey={dateKey} onChange={onMinutesChange} />
        </div>
      ) : null}
    </li>
  );
}

/**
 * Step 1 — meetings as stacked one-line rows (2026-11-18; replaces the tabs).
 * Skip removes the meeting from this day only, with Undo; the Profile list of
 * default meetings is untouched, so it comes back on the next day's log.
 */
export function MeetingSection({
  workLogId,
  dateKey,
  meetings: initialMeetings,
  step,
  onProgressChange,
}: {
  workLogId: string;
  /** The log's day, YYYY-MM-DD (suggested MoM titles). */
  dateKey: string;
  meetings: EditorMeeting[];
  step: number;
  /** Done = every meeting still on the day has notes (none left also counts). */
  onProgressChange?: (done: boolean, written: number) => void;
}) {
  const [meetings, setMeetings] = useState(initialMeetings);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  /** A meeting with notes waiting for the user to confirm skipping it. */
  const [pendingSkip, setPendingSkip] = useState<EditorMeeting | null>(null);
  const [busy, startBusy] = useTransition();
  const written = meetings.filter((meeting) => meeting.notes.trim().length > 0).length;
  const done = meetings.length === 0 || written === meetings.length;

  useEffect(() => onProgressChange?.(done, written), [done, written, onProgressChange]);

  function create(name: string, onDone?: () => void) {
    startBusy(async () => {
      const result = await createMeeting({ workLogId, name, notes: "" });
      if (!result.ok) { toast.error(result.error.message); return; }
      setMeetings((current) => [...current, { id: result.data.id, name: result.data.name, notes: result.data.notes, order: result.data.order, isDefault: result.data.isDefault, minutes: [] }]);
      onDone?.();
    });
  }

  function addMeeting() {
    const name = newName.trim();
    if (!name) { setAdding(false); return; }
    create(name, () => { setNewName(""); setAdding(false); });
  }

  function skip(meeting: EditorMeeting) {
    // An empty row goes at once; one with notes asks first.
    if (meeting.notes.trim()) setPendingSkip(meeting);
    else confirmSkip(meeting);
  }

  function confirmSkip(meeting: EditorMeeting) {
    setPendingSkip(null);
    startBusy(async () => {
      const result = await deleteMeeting({ meetingId: meeting.id });
      if (!result.ok) { toast.error(result.error.message); return; }
      setMeetings((current) => current.filter((item) => item.id !== meeting.id));
      // Undo brings the row back empty — skipping a row with notes was confirmed.
      toast(`${meeting.name} skipped for today`, { action: { label: "Undo", onClick: () => create(meeting.name) } });
    });
  }

  return (
    <section aria-labelledby="meetings-heading" className="wl-card">
      <StepHeading id="meetings-heading" step={step} done={done && meetings.length > 0} title="Meetings" hint="What was decided? One line each, or Skip the ones that didn't happen." />
      {meetings.length > 0 ? (
        <ul className="wl-meetings">
          {meetings.map((meeting) => (
            <MeetingRow
              key={meeting.id}
              meeting={meeting}
              dateKey={dateKey}
              busy={busy}
              onChange={(notes) => setMeetings((current) => current.map((item) => item.id === meeting.id ? { ...item, notes } : item))}
              onMinutesChange={(minutes) => setMeetings((current) => current.map((item) => item.id === meeting.id ? { ...item, minutes } : item))}
              onSkip={() => skip(meeting)}
            />
          ))}
        </ul>
      ) : (
        <p className="wl-step-body text-sm text-text-muted">No meetings today.</p>
      )}

      <div className="wl-step-body">
        {adding ? (
          <form className="flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); addMeeting(); }}>
            <label htmlFor="new-meeting-name" className="sr-only">Meeting name</label>
            <input
              id="new-meeting-name"
              autoFocus
              value={newName}
              maxLength={120}
              disabled={busy}
              placeholder="Meeting name"
              onChange={(event) => setNewName(event.target.value)}
              onBlur={() => { if (!newName.trim()) setAdding(false); }}
              onKeyDown={(event) => { if (event.key === "Escape") { setNewName(""); setAdding(false); } }}
              className="h-10 w-56 max-w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-text focus:border-primary focus:outline-none"
            />
            {busy ? <Loader2 className="size-4 animate-spin text-text-subtle" aria-hidden="true" /> : null}
          </form>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="wl-link-btn">
            <Plus className="size-4" aria-hidden="true" />Add meeting
          </button>
        )}
      </div>

      <ConfirmationDialog
        open={pendingSkip !== null}
        title={`Skip “${pendingSkip?.name ?? ""}” today?`}
        description="Its notes for this day are deleted. Undo brings the meeting back, empty."
        confirmLabel="Skip meeting"
        destructive
        onConfirm={() => { if (pendingSkip) confirmSkip(pendingSkip); }}
        onCancel={() => setPendingSkip(null)}
      />
    </section>
  );
}

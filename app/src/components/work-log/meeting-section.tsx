"use client";

import { Check, Loader2, Plus, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";

import { createMeeting, deleteMeeting, updateMeeting } from "@/actions/worklog";
import { cn } from "@/components/cn";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { toast } from "@/components/ui/toast";
import { MarkdownEditor } from "@/components/work-log/markdown-editor";
import { useAutosave } from "@/components/work-log/save-status";
import type { EditorMeeting } from "@/components/work-log/types";

function ActiveMeetingEditor({
  meeting,
  onChange,
}: {
  meeting: EditorMeeting;
  onChange: (notes: string) => void;
}) {
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
    <div role="tabpanel" id={`meeting-panel-${meeting.id}`} aria-labelledby={`meeting-tab-${meeting.id}`} className="flex min-w-0 flex-col p-4 md:p-5">
      <MarkdownEditor
        id={`meeting-${meeting.id}`}
        value={meeting.notes}
        ariaLabel={`${meeting.name} notes`}
        onChange={onChange}
        onBlur={() => flush()}
        minHeight="min-h-44"
        className="worklog-writing-field flex-1"
      />
    </div>
  );
}

export function MeetingSection({
  workLogId,
  meetings: initialMeetings,
  onCompletedChange,
}: {
  workLogId: string;
  meetings: EditorMeeting[];
  onCompletedChange?: (count: number) => void;
}) {
  const [meetings, setMeetings] = useState(initialMeetings);
  const [activeId, setActiveId] = useState(initialMeetings[0]?.id ?? "");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  /** A meeting with notes waiting for the user to confirm its removal. */
  const [pendingRemove, setPendingRemove] = useState<EditorMeeting | null>(null);
  const [creating, startCreate] = useTransition();
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const activeMeeting = meetings.find((meeting) => meeting.id === activeId) ?? meetings[0];
  const completed = meetings.filter((meeting) => meeting.notes.trim().length > 0).length;

  useEffect(() => onCompletedChange?.(completed), [completed, onCompletedChange]);

  // One highlight that slides to the selected tab (and follows wraps/resizes).
  const activeKey = meetings.find((meeting) => meeting.id === activeId)?.id ?? meetings[0]?.id;
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || !activeKey) return;
    const measure = () => {
      const pill = tabRefs.current.get(activeKey)?.parentElement;
      if (pill) setIndicator({ left: pill.offsetLeft, top: pill.offsetTop, width: pill.offsetWidth, height: pill.offsetHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [activeKey, meetings]);

  function select(id: string, focus = false) {
    setActiveId(id);
    if (focus) tabRefs.current.get(id)?.focus();
  }

  /** Arrow keys move between tabs (WAI-ARIA tabs pattern). */
  function onTabKey(event: React.KeyboardEvent, index: number) {
    const last = meetings.length - 1;
    const next = event.key === "ArrowRight" ? (index === last ? 0 : index + 1) : event.key === "ArrowLeft" ? (index === 0 ? last : index - 1) : event.key === "Home" ? 0 : event.key === "End" ? last : -1;
    if (next < 0) return;
    event.preventDefault();
    select(meetings[next].id, true);
  }

  function addMeeting() {
    const name = newName.trim();
    if (!name) { setAdding(false); return; }
    startCreate(async () => {
      const result = await createMeeting({ workLogId, name, notes: "" });
      if (!result.ok) { toast.error(result.error.message); return; }
      const meeting = { id: result.data.id, name: result.data.name, notes: result.data.notes, order: result.data.order, isDefault: result.data.isDefault };
      setMeetings((current) => [...current, meeting]);
      setActiveId(meeting.id);
      setNewName("");
      setAdding(false);
    });
  }

  /** Only meetings the user added can be removed; the three defaults stay. */
  function removeMeeting(meeting: EditorMeeting) {
    // Empty cards go straight away; one with notes asks first.
    if (meeting.notes.trim()) setPendingRemove(meeting);
    else confirmRemove(meeting);
  }

  function confirmRemove(meeting: EditorMeeting) {
    setPendingRemove(null);
    startCreate(async () => {
      const result = await deleteMeeting({ meetingId: meeting.id });
      if (!result.ok) { toast.error(result.error.message); return; }
      const remaining = meetings.filter((item) => item.id !== meeting.id);
      setMeetings(remaining);
      if (activeId === meeting.id) setActiveId(remaining[0]?.id ?? "");
      toast.success(`${meeting.name} removed`);
    });
  }

  if (!activeMeeting) return null;

  return (
    <section aria-labelledby="meetings-heading" className="wl-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 md:px-5 md:pt-5">
        <h2 id="meetings-heading" className="flex items-center gap-2 text-lg font-semibold tracking-[-0.015em] text-text">
          Meeting notes
          <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs font-semibold text-accent-text tabular-nums">{completed} of {meetings.length}</span>
        </h2>
        <p className="text-sm text-text-subtle">Decisions, actions, anything to remember</p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 px-4 md:px-5">
        <div ref={listRef} role="tablist" aria-label="Meetings" className="relative flex flex-wrap items-center gap-1 rounded-xl border border-border bg-surface-2 p-1">
          {indicator ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-0 left-0 rounded-lg bg-sidebar shadow-sm transition-[transform,width,height] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
              // Position moves on the compositor (transform); only the size is laid out.
              style={indicator ? { width: indicator.width, height: indicator.height, transform: `translate3d(${indicator.left}px, ${indicator.top}px, 0)` } : undefined}
            />
          ) : null}
          {meetings.map((meeting, index) => {
            const active = meeting.id === activeMeeting.id;
            const filled = meeting.notes.trim().length > 0;
            return (
              <span key={meeting.id} className={cn("relative z-10 flex items-center rounded-lg transition-colors duration-200", active ? "text-sidebar-fg" : "text-text-muted hover:bg-surface-3 hover:text-text", active && !indicator && "bg-sidebar")}>
                <button
                  ref={(node) => { if (node) tabRefs.current.set(meeting.id, node); else tabRefs.current.delete(meeting.id); }}
                  id={`meeting-tab-${meeting.id}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={`meeting-panel-${meeting.id}`}
                  tabIndex={active ? 0 : -1}
                  onClick={() => select(meeting.id)}
                  onKeyDown={(event) => onTabKey(event, index)}
                  className={cn("flex h-9 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-semibold", !meeting.isDefault && active && "pr-1.5")}
                >
                  {meeting.name}
                  {filled ? <Check className={cn("size-3.5 transition-colors duration-200", active ? "text-sidebar-fg" : "text-primary")} strokeWidth={3} aria-hidden="true" /> : null}
                  <span className="sr-only">{filled ? " — notes written" : " — empty"}</span>
                </button>
                {!meeting.isDefault && active ? (
                  <button type="button" onClick={() => removeMeeting(meeting)} disabled={creating} aria-label={`Remove ${meeting.name}`} title="Remove meeting" className="mr-1 grid size-6 cursor-pointer place-items-center rounded-md text-sidebar-muted transition-colors duration-150 hover:bg-sidebar-2 hover:text-sidebar-fg">
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                ) : null}
              </span>
            );
          })}
        </div>

        {adding ? (
          <form className="flex shrink-0 items-center gap-1" onSubmit={(event) => { event.preventDefault(); addMeeting(); }}>
            <label htmlFor="new-meeting-name" className="sr-only">Meeting name</label>
            <input
              id="new-meeting-name"
              autoFocus
              value={newName}
              maxLength={120}
              disabled={creating}
              onChange={(event) => setNewName(event.target.value)}
              onBlur={() => { if (!newName.trim()) setAdding(false); }}
              onKeyDown={(event) => { if (event.key === "Escape") { setNewName(""); setAdding(false); } }}
              className="h-9 w-44 rounded-lg border border-border-strong bg-surface px-3 text-sm text-text focus:border-primary focus:outline-none"
            />
            {creating ? <Loader2 className="size-4 animate-spin text-text-subtle" aria-hidden="true" /> : null}
          </form>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-border-strong px-3 text-sm font-medium text-text-muted transition-colors duration-150 hover:border-primary hover:bg-surface-2 hover:text-text">
            <Plus className="size-4" aria-hidden="true" />
            Add meeting
          </button>
        )}
      </div>

      <ActiveMeetingEditor
        key={activeMeeting.id}
        meeting={activeMeeting}
        onChange={(notes) => setMeetings((current) => current.map((meeting) => meeting.id === activeMeeting.id ? { ...meeting, notes } : meeting))}
      />
      <ConfirmationDialog
        open={pendingRemove !== null}
        title={`Remove “${pendingRemove?.name ?? ""}”?`}
        description="Its notes for this day are deleted too."
        confirmLabel="Remove meeting"
        destructive
        onConfirm={() => { if (pendingRemove) confirmRemove(pendingRemove); }}
        onCancel={() => setPendingRemove(null)}
      />
    </section>
  );
}

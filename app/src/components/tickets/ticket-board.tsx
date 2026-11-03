"use client";

import { format } from "date-fns";
import { ArrowLeft, ArrowRight, Building2, CalendarDays, History, Loader2, Pencil, Plus, Search, ShieldCheck, Ticket as TicketIcon, Trash2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { appendTicketHistoryEntry, createTicket, deleteTicketHistoryEntry, getTicket, updateTicket } from "@/actions/tickets";
import { cn } from "@/components/cn";
import { SearchPill, UnderlineTabs } from "@/components/shell/page-head";
import { MarkdownContent, MarkdownEditor } from "@/components/work-log/markdown-editor";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ProjectInput } from "@/components/ui/project-input";
import { TICKET_STATUS_DOT, TICKET_STATUS_LABELS, TICKET_STATUS_ORDER, TicketStatusBadge } from "@/components/ui/ticket-status-badge";
import { toast } from "@/components/ui/toast";
import type { WorkflowStatus } from "@/lib/workflow-status";

export type TicketBoardItem = {
  id: string;
  ticketId: string;
  title: string;
  projectName: string | null;
  status: WorkflowStatus;
  updatedAt: string;
  createdAt: string;
  workLogCount: number;
  latestUpdate: {
    description: string;
    createdAt: string;
    workLog: { id: string; title: string; date: string } | null;
  } | null;
};

type TicketDetail = {
  historyEntries: Array<{ id: string; body: string; status: WorkflowStatus; createdAt: string }>;
  updates: Array<{
    id: string;
    description: string;
    status: WorkflowStatus;
    createdAt: string;
    workLog: { id: string; title: string; date: string } | null;
  }>;
};

type StatusFilter = "All" | WorkflowStatus;

export function TicketBoard({ initialTickets, loadError, daysOff = [] }: { initialTickets: TicketBoardItem[]; loadError?: string; daysOff?: string[] }) {
  const [tickets, setTickets] = useState(initialTickets);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  // Open on the work in flight; "All" is one click away.
  const [status, setStatus] = useState<StatusFilter>("InProgress");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newProject, setNewProject] = useState("");
  const [createError, setCreateError] = useState("");
  const [createSaving, setCreateSaving] = useState(false);
  // Under xl the open ticket covers the list full screen; Back (or Esc) returns to it.
  const [phoneOpen, setPhoneOpen] = useState(false);

  const visibleTickets = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return tickets.filter((ticket) => {
      const matchesStatus = status === "All" || ticket.status === status;
      const matchesQuery = !needle || ticket.ticketId.toLocaleLowerCase().includes(needle) || ticket.title.toLocaleLowerCase().includes(needle) || (ticket.projectName ?? "").toLocaleLowerCase().includes(needle);
      return matchesStatus && matchesQuery;
    });
  }, [query, status, tickets]);

  // `?ticket=<id>` (links from Ask) selects that ticket, whatever its status.
  const linkedId = useSearchParams().get("ticket");
  const linked = linkedId && tickets.some((ticket) => ticket.id === linkedId) ? linkedId : null;
  const [handledLink, setHandledLink] = useState<string | null>(null);
  if (linked !== handledLink) {
    setHandledLink(linked);
    if (linked) {
      setStatus("All");
      setQuery("");
      setSelectedId(linked);
      setPhoneOpen(true);
    }
  }
  useEffect(() => {
    if (linkedId) window.history.replaceState(null, "", "/tickets");
  }, [linkedId]);

  // Never open on an empty detail panel: fall back to the first ticket in the list.
  const selectedTicket = visibleTickets.find((ticket) => ticket.id === selectedId) ?? visibleTickets[0] ?? null;

  function replaceTicket(ticketId: string, patch: Partial<Pick<TicketBoardItem, "ticketId" | "title" | "projectName" | "status" | "updatedAt">>) {
    setTickets((current) => current.map((ticket) => ticket.id === ticketId ? { ...ticket, ...patch } : ticket));
  }

  const counts = useMemo(() => {
    const next = Object.fromEntries(TICKET_STATUS_ORDER.map((option) => [option, 0])) as Record<WorkflowStatus, number>;
    for (const ticket of tickets) next[ticket.status] += 1;
    return next;
  }, [tickets]);

  useEffect(() => {
    if (!phoneOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setPhoneOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phoneOpen]);

  function select(ticketId: string) {
    setSelectedId(ticketId);
    setPhoneOpen(true);
    // From xl the detail sits beside the list — bring its top into view.
    requestAnimationFrame(() => document.getElementById("ticket-drawer")?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  async function saveNewTicket() {
    if (createSaving) return;
    if (!newKey.trim() || !newTitle.trim()) {
      setCreateError(!newKey.trim() ? "Enter a ticket number." : "Enter a ticket title.");
      return;
    }
    setCreateSaving(true);
    setCreateError("");
    const result = await createTicket({ ticketKey: newKey, title: newTitle, projectName: newProject.trim(), status: "InProgress" });
    setCreateSaving(false);
    if (!result.ok) {
      setCreateError(result.error.message);
      return;
    }
    const created: TicketBoardItem = {
      id: result.data.id,
      ticketId: result.data.ticketId,
      title: result.data.title,
      projectName: result.data.projectName,
      status: result.data.status,
      createdAt: result.data.createdAt.toISOString(),
      updatedAt: result.data.updatedAt.toISOString(),
      workLogCount: 0,
      latestUpdate: null,
    };
    setTickets((current) => [created, ...current]);
    setSelectedId(created.id);
    setStatus("All");
    setQuery("");
    setNewKey(""); setNewTitle(""); setNewProject(""); setCreating(false);
    toast.success("Ticket created");
  }


  const statusTabs = [
    { key: "All", label: "All", count: tickets.length },
    ...TICKET_STATUS_ORDER.map((option) => ({ key: option, label: TICKET_STATUS_LABELS[option], count: counts[option] })),
  ];

  // Status groups in workflow order, only those with tickets after filtering.
  const groups = TICKET_STATUS_ORDER.map((option) => ({ status: option, items: visibleTickets.filter((ticket) => ticket.status === option) })).filter((group) => group.items.length);

  return (
    // Ocean v2 list + detail (2026-11-02): a filterable list grouped by status
    // beside the open ticket (status steps, add an update, history). Under xl the
    // open ticket covers the list full screen.
    <div className="tkt tk-focus flex w-full min-w-0 flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <p className="text-2xs font-semibold tracking-[0.12em] text-text-muted uppercase">{tickets.length} {tickets.length === 1 ? "ticket" : "tickets"} · your own key scheme</p>
          <h1 className="tkt-title mt-1">Tickets</h1>
        </div>
        <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
          <SearchPill id="ticket-search" label="Search tickets" value={query} placeholder="Search key, title, project" onChange={setQuery} shortcut className="w-full md:w-80" />
          <Button size="lg" onClick={() => setCreating(true)}><Plus aria-hidden="true" />New ticket</Button>
        </div>
      </header>

      {creating ? (
        <section aria-labelledby="new-ticket-heading" className="tkt-card p-4 md:p-5">
          <div className="flex items-center justify-between gap-3"><h2 id="new-ticket-heading" className="text-xl font-bold text-text">New ticket</h2><Button variant="ghost" onClick={() => setCreating(false)} disabled={createSaving}>Cancel</Button></div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Ticket number" htmlFor="new-ticket-key"><Input id="new-ticket-key" value={newKey} maxLength={64} autoFocus disabled={createSaving} onChange={(event) => { setNewKey(event.target.value); setCreateError(""); }} /></Field>
            <Field label="Title" htmlFor="new-ticket-title"><Input id="new-ticket-title" value={newTitle} maxLength={300} disabled={createSaving} onChange={(event) => { setNewTitle(event.target.value); setCreateError(""); }} /></Field>
            <Field label="Project / site" htmlFor="new-ticket-project" className="md:col-span-2"><ProjectInput id="new-ticket-project" value={newProject} disabled={createSaving} onValueChange={(value) => { setNewProject(value); setCreateError(""); }} /></Field>
          </div>
          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><p role="alert" className="text-sm font-medium text-danger">{createError}</p><Button loading={createSaving} onClick={() => void saveNewTicket()}>Create ticket</Button></div>
        </section>
      ) : null}

      {loadError ? (
        <div role="alert" className="rounded-xl border border-danger bg-danger-subtle p-4 text-md font-medium text-danger">
          Tickets could not be loaded. {loadError}
        </div>
      ) : null}

      {tickets.length === 0 && !loadError ? (
        <EmptyState
          icon={TicketIcon}
          title="No tickets yet"
          description="Create your first ticket from a work log, then manage its updates here."
          action={<Link href="/work-logs" className={buttonVariants({ variant: "primary" })}>Open work logs</Link>}
        />
      ) : tickets.length ? (
        <>
        <UnderlineTabs label="Filter by status" items={statusTabs} current={status} onSelect={(key) => setStatus(key as StatusFilter)} />
        <div className="tkt-split">
          <nav aria-label="Tickets" className="tkt-list tkt-card">
            {visibleTickets.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={Search}
                  title="No matching tickets"
                  description="Try another ticket ID, title, or status."
                  action={<Button variant="secondary" onClick={() => { setQuery(""); setStatus("All"); }}>Clear filters</Button>}
                />
              </div>
            ) : groups.map((group) => (
              <section key={group.status} aria-label={TICKET_STATUS_LABELS[group.status]}>
                <h2 className="tkt-group">
                  <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", TICKET_STATUS_DOT[group.status])} />
                  {TICKET_STATUS_LABELS[group.status]} · <span className="tabular-nums">{group.items.length}</span>
                </h2>
                <ul>
                  {group.items.map((ticket) => {
                    const selected = ticket.id === selectedTicket?.id;
                    return (
                      <li key={ticket.id}>
                        <button type="button" aria-pressed={selected} onClick={() => select(ticket.id)} className="tkt-row">
                          <span className="tkt-key">{ticket.ticketId}</span>
                          <span className="line-clamp-2 text-md leading-snug font-semibold text-text">{ticket.title}</span>
                          <span className="flex min-w-0 flex-wrap gap-x-2.5 text-xs text-text-muted">
                            <span className="truncate">{ticket.projectName ?? "No project"}</span>
                            <span>{ticket.workLogCount} {ticket.workLogCount === 1 ? "log" : "logs"}</span>
                            <time dateTime={ticket.updatedAt}>{format(new Date(ticket.updatedAt), "d MMM")}</time>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </nav>

          <div id="ticket-drawer" data-open={phoneOpen || undefined} className="tkt-detail min-w-0 scroll-mt-[calc(var(--dock-clearance)+1rem)]">
            {selectedTicket ? (
              <>
                <button type="button" onClick={() => setPhoneOpen(false)} className="tkt-back"><ArrowLeft className="size-4" aria-hidden="true" />All tickets</button>
                <TicketDetailPanel key={selectedTicket.id} ticket={selectedTicket} daysOff={daysOff} onChange={replaceTicket} />
              </>
            ) : (
              <p className="tkt-card p-8 text-center text-md text-text-muted">Pick a ticket to see its history.</p>
            )}
          </div>
        </div>
        </>
      ) : null}
    </div>
  );
}

function TicketDetailPanel({ ticket, daysOff, onChange }: {
  ticket: TicketBoardItem;
  /** Holiday / Leave days (YYYY-MM-DD) — not counted as working days. */
  daysOff: string[];
  onChange: (ticketId: string, patch: Partial<Pick<TicketBoardItem, "ticketId" | "title" | "projectName" | "status" | "updatedAt">>) => void;
}) {
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [loadError, setLoadError] = useState("");
  const [status, setStatus] = useState(ticket.status);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState<"body" | null>(null);
  const [message, setMessage] = useState("");
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [editingDetails, setEditingDetails] = useState(false);
  const [ticketKey, setTicketKey] = useState(ticket.ticketId);
  const [title, setTitle] = useState(ticket.title);
  const [projectName, setProjectName] = useState(ticket.projectName ?? "");
  const [detailsError, setDetailsError] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);
  const statusChanged = status !== ticket.status;

  useEffect(() => {
    let cancelled = false;
    void getTicket(ticket.id).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setLoadError(result.error.message);
        return;
      }
      setDetail({
        historyEntries: result.data.historyEntries.map((entry) => ({ id: entry.id, body: entry.body, status: entry.status, createdAt: entry.createdAt.toISOString() })),
        updates: result.data.updates.map((update) => ({
          id: update.id,
          description: update.description,
          status: update.status,
          createdAt: update.createdAt.toISOString(),
          workLog: update.workLog ? { id: update.workLog.id, title: update.workLog.title, date: update.workLog.date.toISOString() } : null,
        })),
      });
    });
    return () => { cancelled = true; };
  }, [ticket.id]);

  const timeline = useMemo(() => {
    if (!detail) return [];
    return [
      ...detail.historyEntries.map((entry) => ({ id: entry.id, kind: "ticket" as const, body: entry.body, status: entry.status, createdAt: entry.createdAt, workLog: null })),
      ...detail.updates.map((entry) => ({ id: entry.id, kind: "worklog" as const, body: entry.description, status: entry.status, createdAt: entry.createdAt, workLog: entry.workLog })),
    ].sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime());
  }, [detail]);

  const journey = useMemo(() => (detail ? ticketJourney(ticket, detail, new Set(daysOff)) : null), [detail, ticket, daysOff]);

  function cancelDetailsEdit() {
    setTicketKey(ticket.ticketId);
    setTitle(ticket.title);
    setProjectName(ticket.projectName ?? "");
    setDetailsError("");
    setEditingDetails(false);
  }

  async function saveDetails() {
    if (savingDetails) return;
    const nextKey = ticketKey.trim();
    const nextTitle = title.trim();
    if (!nextKey || !nextTitle) {
      setDetailsError(!nextKey ? "Enter a ticket number." : "Enter a ticket title.");
      return;
    }
    setSavingDetails(true);
    setDetailsError("");
    const result = await updateTicket({
      ticketId: ticket.id,
      ticketKey: nextKey,
      title: nextTitle,
      projectName: projectName.trim(),
    });
    setSavingDetails(false);
    if (!result.ok) {
      setDetailsError(result.error.message);
      toast.error("Ticket details were not saved", { description: result.error.message });
      return;
    }
    onChange(ticket.id, {
      ticketId: result.data.ticketId,
      title: result.data.title,
      projectName: result.data.projectName,
      updatedAt: result.data.updatedAt.toISOString(),
    });
    setTicketKey(result.data.ticketId);
    setTitle(result.data.title);
    setProjectName(result.data.projectName ?? "");
    setEditingDetails(false);
    toast.success("Ticket details updated");
  }

  /**
   * The one save: writes the update (if any) with the chosen status, or — with
   * no text — just changes the status. Adding a history entry also sets the
   * ticket's status, so the text + status case is a single call.
   */
  async function saveUpdate() {
    const nextBody = body.trim();
    if ((!nextBody && !statusChanged) || saving) return;
    setSaving("body");
    setMessage(nextBody ? "Saving update…" : "Saving status…");

    // A status-only change is still recorded in the history, so every timeline
    // (here and in work logs) shows when the status moved.
    const entryBody = nextBody || `Status changed from ${TICKET_STATUS_LABELS[ticket.status]} to ${TICKET_STATUS_LABELS[status]}.`;
    const result = await appendTicketHistoryEntry({ ticketId: ticket.id, body: entryBody, status });
    setSaving(null);
    if (!result.ok) {
      setMessage(result.error.message);
      toast.error("Ticket update was not saved", { description: result.error.message });
      return;
    }
    const entry = result.data.entry;
    setDetail((current) => current ? {
      ...current,
      historyEntries: [{ id: entry.id, body: entry.body, status: entry.status, createdAt: entry.createdAt.toISOString() }, ...current.historyEntries],
    } : current);
    setBody("");
    setStatus(result.data.ticket.status);
    onChange(ticket.id, { status: result.data.ticket.status, updatedAt: result.data.ticket.updatedAt.toISOString() });
    setMessage(nextBody ? "Update saved to ticket history. Work logs are unchanged." : "Status changed and recorded in the history.");
    toast.success(nextBody ? "Update saved" : "Status updated");
  }

  async function deleteHistoryEntry() {
    if (!deleteTargetId) return;
    const result = await deleteTicketHistoryEntry({ ticketId: ticket.id, entryId: deleteTargetId });
    if (!result.ok) {
      setMessage(result.error.message);
      toast.error("Ticket update was not deleted", { description: result.error.message });
      return;
    }
    setDetail((current) => current ? {
      ...current,
      historyEntries: current.historyEntries.filter((entry) => entry.id !== deleteTargetId),
    } : current);
    setDeleteTargetId(null);
    setMessage("Ticket update deleted. Work-log history is unchanged.");
    toast.success("Ticket update deleted");
  }

  return (
    <article aria-labelledby={`ticket-heading-${ticket.id}`} className="tkt-card min-w-0 overflow-hidden">
      <header className="px-5 pt-5 pb-4 md:px-7 md:pt-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="tkt-key">{ticket.ticketId}</span>
            <TicketStatusBadge status={ticket.status} />
            {ticket.projectName ? <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-2 py-0.5 text-xs font-semibold text-text-muted"><Building2 className="size-3.5" aria-hidden="true" />{ticket.projectName}</span> : null}
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => setEditingDetails(true)}>
              <Pencil className="size-4" aria-hidden="true" /> Edit ticket details
            </Button>
          </div>
          <h2 id={`ticket-heading-${ticket.id}`} className="tkt-detail-title mt-2.5 text-text [overflow-wrap:anywhere]">{ticket.title}</h2>
          <p className="mt-1 text-sm text-text-muted">
            {ticket.workLogCount} {ticket.workLogCount === 1 ? "work log" : "work logs"} · <time dateTime={ticket.updatedAt}>updated {formatTicketDate(ticket.updatedAt)}</time>
          </p>
        </div>
        {editingDetails ? (
          <div className="mt-6 grid gap-4 border-t border-border pt-5 md:grid-cols-2">
            <Field label="Ticket number" htmlFor={`ticket-key-${ticket.id}`}>
              <Input id={`ticket-key-${ticket.id}`} value={ticketKey} maxLength={80} disabled={savingDetails} onChange={(event) => { setTicketKey(event.target.value); setDetailsError(""); }} />
            </Field>
            <Field label="Title" htmlFor={`ticket-title-${ticket.id}`}>
              <Input id={`ticket-title-${ticket.id}`} value={title} maxLength={300} disabled={savingDetails} onChange={(event) => { setTitle(event.target.value); setDetailsError(""); }} />
            </Field>
            <Field label="Project / site" htmlFor={`ticket-project-${ticket.id}`} className="md:col-span-2">
              <ProjectInput id={`ticket-project-${ticket.id}`} value={projectName} disabled={savingDetails} onValueChange={(value) => { setProjectName(value); setDetailsError(""); }} />
            </Field>
            <div className="flex flex-col gap-3 md:col-span-2 md:flex-row md:items-center md:justify-between">
              <p role="alert" className="text-sm font-medium text-danger">{detailsError}</p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" disabled={savingDetails} onClick={cancelDetailsEdit}>Cancel</Button>
                <Button loading={savingDetails} onClick={() => void saveDetails()}>Save details</Button>
              </div>
            </div>
          </div>
        ) : null}
      </header>

      <StatusSteps current={ticket.status} picked={status} journey={journey} disabled={saving !== null} onPick={(next) => { setStatus(next); setMessage(""); }} />

      <div className="flex min-w-0 flex-col gap-7 px-5 pt-2 pb-6 md:px-7 md:pb-7">
        {timeline[0] ? (
          <section aria-labelledby={`latest-update-heading-${ticket.id}`} className="rounded-xl border border-primary/30 bg-primary-subtle p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2"><History className="size-4 text-accent-text" aria-hidden="true" /><h3 id={`latest-update-heading-${ticket.id}`} className="text-md font-bold text-text">Latest update</h3><TicketStatusBadge status={timeline[0].status} /></div>
              <time dateTime={timeline[0].createdAt} className="text-sm text-text-muted">{formatTimelineDate(timeline[0].createdAt)}</time>
            </div>
            {timeline[0].body.trim() ? <MarkdownContent value={timeline[0].body} className="mt-2 text-md leading-6 text-text" /> : <p className="mt-2 text-sm italic text-text-muted">No written update.</p>}
          </section>
        ) : null}
        <section aria-labelledby={`add-update-heading-${ticket.id}`}>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 id={`add-update-heading-${ticket.id}`} className="tkt-label">Add a ticket update</h3>
              <p className="mt-1 max-w-[62ch] text-sm leading-6 text-text-muted">
                Pick a status above, write an update, or both — then save once. Each update becomes a history entry; work-log notes stay protected.
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-2 self-start rounded-full bg-success-subtle px-3 py-1.5 text-xs font-semibold text-success">
              <ShieldCheck className="size-4" aria-hidden="true" />Protected work-log history
            </span>
          </div>
          <div className="mt-4 grid gap-4">
            <Field label="Update details" htmlFor={`ticket-body-${ticket.id}`} hint="Optional when you're only changing the status.">
              <MarkdownEditor
                id={`ticket-body-${ticket.id}`}
                value={body}
                onChange={(value) => { setBody(value); setMessage(""); }}
                ariaLabel="Ticket update details"
                minHeight="min-h-32"
              />
            </Field>
          </div>
          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p role="status" aria-live="polite" className="text-base text-text-muted">
              {message || (statusChanged ? `Status will change: ${TICKET_STATUS_LABELS[ticket.status]} → ${TICKET_STATUS_LABELS[status]}` : `Current status: ${TICKET_STATUS_LABELS[ticket.status]}`)}
            </p>
            <Button className="md:min-w-40" disabled={(!body.trim() && !statusChanged) || saving !== null} loading={saving !== null} onClick={() => void saveUpdate()}>
              Save
            </Button>
          </div>
        </section>

        <section aria-labelledby={`history-heading-${ticket.id}`} className="border-t border-border pt-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2"><History className="size-4 text-accent-text" aria-hidden="true" /><h3 id={`history-heading-${ticket.id}`} className="tkt-label">Ticket history</h3></div>
            {detail ? <span className="text-base text-text-muted">{timeline.length} {timeline.length === 1 ? "entry" : "entries"}</span> : null}
          </div>

          {loadError ? (
            <div role="alert" className="mt-4 rounded-xl border border-danger bg-danger-subtle p-4 text-sm font-medium text-danger">History could not be loaded. {loadError}</div>
          ) : !detail ? (
            <div className="mt-4 flex min-h-32 items-center justify-center rounded-xl bg-surface text-sm text-text-muted"><Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />Loading history…</div>
          ) : timeline.length === 0 ? (
            <div className="mt-4 rounded-xl bg-surface p-5 text-sm text-text-muted">No history yet. Add the first update above.</div>
          ) : (
            <ol className="mt-5 space-y-5">
              {timeline.map((entry, index) => (
                <li key={`${entry.kind}-${entry.id}`} className="relative grid grid-cols-[1rem_minmax(0,1fr)] gap-3">
                  <div className="relative flex justify-center">
                    {index < timeline.length - 1 ? <span className="absolute top-4 bottom-[-1.25rem] w-px bg-border" aria-hidden="true" /> : null}
                    <span className={cn("relative mt-1.5 size-2.5 rounded-full ring-4 ring-surface", entry.kind === "ticket" ? "bg-primary" : "bg-text-subtle")} aria-hidden="true" />
                  </div>
                  <div className="min-w-0 rounded-xl border border-border bg-surface p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">{entry.kind === "ticket" ? "Ticket update" : "Work log"}</span>
                        <TicketStatusBadge status={entry.status} />
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <time dateTime={entry.createdAt} className="text-sm text-text-muted">{formatTimelineDate(entry.createdAt)}</time>
                        {entry.kind === "ticket" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-danger hover:bg-danger-subtle hover:text-danger"
                            aria-label={`Delete ticket update from ${formatTimelineDate(entry.createdAt)}`}
                            onClick={() => setDeleteTargetId(entry.id)}
                          >
                            <Trash2 aria-hidden="true" />
                            Delete
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {entry.body.trim() ? <MarkdownContent value={entry.body} className="mt-3 text-md leading-6 text-text" /> : <p className="mt-3 text-md italic text-text-muted">No written update.</p>}
                    {entry.workLog ? (
                      <Link href={`/work-logs/${entry.workLog.id}`} className="mt-3 inline-flex min-h-11 items-center gap-2 text-md font-semibold text-accent-text hover:underline">
                        <CalendarDays className="size-4" aria-hidden="true" />
                        {entry.workLog.title} · {formatTicketDate(entry.workLog.date)}
                        <ArrowRight className="size-4" aria-hidden="true" />
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <ConfirmationDialog
        open={deleteTargetId !== null}
        title="Delete this ticket update?"
        description="This direct ticket update will be permanently removed. The current ticket status and work-log entries will not change."
        confirmLabel="Delete update"
        destructive
        onConfirm={deleteHistoryEntry}
        onCancel={() => setDeleteTargetId(null)}
      />
    </article>
  );
}

function formatTicketDate(value: string) {
  return format(new Date(value), "d MMM yyyy");
}

function formatTimelineDate(value: string) {
  return format(new Date(value), "d MMM yyyy, h:mm a");
}


// ---------------------------------------------------------------------------
// Ticket timeline — when each stage was first reached and how long it took.
// ---------------------------------------------------------------------------

type Journey = {
  stages: Array<{ status: WorkflowStatus; date: Date | null }>;
  start: Date;
  end: Date;
  done: boolean;
  workingDays: number;
  /** Holiday / Leave days inside the span that were not counted. */
  daysOffSkipped: number;
};

function dayOf(value: string | Date) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Weekdays from start to end (inclusive), minus days marked Holiday / Leave. */
function countWorkingDays(start: Date, end: Date, daysOff: Set<string>) {
  let working = 0;
  let skipped = 0;
  for (let day = new Date(start); day <= end; day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)) {
    if (day.getDay() === 0 || day.getDay() === 6) continue;
    if (daysOff.has(format(day, "yyyy-MM-dd"))) skipped += 1;
    else working += 1;
  }
  return { working, skipped };
}

/**
 * Start = the first time the ticket was In Progress (else when it was created);
 * end = the first time it reached Done (else today, still open). Work-log
 * updates count on their work log's date; direct updates on when they were written.
 */
function ticketJourney(ticket: TicketBoardItem, detail: TicketDetail, daysOff: Set<string>): Journey {
  const events = [
    ...detail.updates.map((entry) => ({ status: entry.status, date: dayOf(entry.workLog?.date ?? entry.createdAt) })),
    ...detail.historyEntries.map((entry) => ({ status: entry.status, date: dayOf(entry.createdAt) })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  const firstReached = (status: WorkflowStatus) => events.find((event) => event.status === status)?.date ?? null;
  const created = dayOf(ticket.createdAt);
  const start = firstReached("InProgress") ?? created;
  const doneAt = events.find((event) => event.status === "Done" && event.date >= start)?.date ?? null;
  const end = doneAt ?? dayOf(new Date());

  const { working, skipped } = countWorkingDays(start, end, daysOff);
  return {
    stages: TICKET_STATUS_ORDER.map((status) => ({ status, date: status === "InProgress" ? start : firstReached(status) })),
    start,
    end,
    done: doneAt !== null,
    workingDays: working,
    daysOffSkipped: skipped,
  };
}

/**
 * The status picker as six steps (2026-11-02): each shows when the ticket first
 * reached it; reached steps are tinted, the picked one is solid. Clicking a step
 * only picks the status — Save below applies it. Replaces the Status select and
 * the separate timeline strip.
 */
function StatusSteps({ current, picked, journey, disabled, onPick }: { current: WorkflowStatus; picked: WorkflowStatus; journey: Journey | null; disabled: boolean; onPick: (status: WorkflowStatus) => void }) {
  return (
    <section aria-label="Status" className="px-5 pb-4 md:px-7">
      <div role="radiogroup" aria-label="Status" className="tkt-steps">
        {TICKET_STATUS_ORDER.map((option) => {
          const date = journey?.stages.find((stage) => stage.status === option)?.date ?? null;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={picked === option}
              data-reached={date ? "" : undefined}
              data-current={current === option ? "" : undefined}
              disabled={disabled}
              onClick={() => onPick(option)}
              className="tkt-step"
            >
              <span className="flex items-center gap-1.5"><span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", TICKET_STATUS_DOT[option])} />{TICKET_STATUS_LABELS[option]}</span>
              <span className="tkt-step-date tabular-nums">{date ? format(date, "d MMM") : "—"}</span>
            </button>
          );
        })}
      </div>
      {journey ? (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", journey.done ? "bg-status-completed-bg text-status-completed-fg ring-1 ring-inset ring-status-completed/50" : "bg-status-progress-bg text-status-progress-fg ring-1 ring-inset ring-status-progress/40")}>
            {journey.done ? "Done in" : "Open for"} {journey.workingDays} {journey.workingDays === 1 ? "day" : "days"}
          </span>
          Started {format(journey.start, "EEE d MMM")} {journey.done ? `· Done ${format(journey.end, "EEE d MMM")}` : "· not done yet"}
          {journey.daysOffSkipped > 0 ? ` · ${journey.daysOffSkipped} holiday/leave ${journey.daysOffSkipped === 1 ? "day" : "days"} not counted` : ""}
        </p>
      ) : null}
    </section>
  );
}

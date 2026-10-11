"use client";

import { ChevronDown, CornerDownLeft, Loader2, Plus, Search, TicketPlus } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";

import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";

import { findTicket, listTickets } from "@/actions/tickets";
import { cn } from "@/components/cn";
import { Badge, TicketId } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ProjectInput } from "@/components/ui/project-input";
import { Select } from "@/components/ui/select";
import { MarkdownEditor } from "@/components/work-log/markdown-editor";
import {
  TICKET_STATUS_LABELS,
  TICKET_STATUS_ORDER,
  TicketStatusBadge,
} from "@/components/ui/ticket-status-badge";
import { TicketHistory } from "@/components/work-log/ticket-history";
import { toMergedHistory, type HistoryEntry } from "@/components/work-log/types";
import type { WorkflowStatus } from "@/lib/workflow-status";

/**
 * "Search or enter Ticket ID..." — spec §6, §21, §23.
 *
 * One input, no modal, no page change:
 *   type ASU-1234 -> `findTicket({ ticketKey })`
 *     found     -> ID, title, current status, expandable previous updates,
 *                  one keystroke (Enter) to attach
 *     not found -> `{ found: false }`, never an error, so we offer inline
 *                  create right there: title + initial status + Enter
 *
 * NOTE the naming trap: this component speaks `ticketKey` (the human key,
 * upper-cased server-side). `ticketId` elsewhere in the app is the cuid.
 */

type Found = {
  id: string;
  ticketKey: string;
  title: string;
  projectName: string | null;
  status: WorkflowStatus;
  history: HistoryEntry[];
};

type TicketOption = { ticketKey: string; title: string; projectName: string | null; status: WorkflowStatus };

type LookupState =
  | { kind: "empty" }
  | { kind: "typing" }
  | { kind: "searching"; ticketKey: string }
  | { kind: "found"; ticket: Found }
  | { kind: "missing"; ticketKey: string }
  | { kind: "error"; message: string };

/** Matches `ticketKeySchema` client-side so we don't round-trip junk. */
const TICKET_KEY_RE = /^[A-Z0-9][A-Z0-9_-]*$/;

function normaliseKey(raw: string) {
  return raw.replace(/\s+/g, "").toUpperCase();
}

const LOOKUP_DEBOUNCE_MS = 350;

export function TicketSearch({
  attachedKeys,
  onAttach,
  onFocusAttached,
  inputRef,
}: {
  /** Human keys already on this work log, upper-cased. */
  attachedKeys: string[];
  onAttach: (input: {
    ticketKey: string;
    title?: string;
    projectName?: string;
    status?: WorkflowStatus;
    description?: string;
  }) => Promise<boolean>;
  /** Called when the typed ticket is already on the log — scroll to its card. */
  onFocusAttached: (ticketKey: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const uid = useId();
  const localRef = useRef<HTMLInputElement>(null);
  const searchRef = inputRef ?? localRef;
  const titleRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [state, setState] = useState<LookupState>({ kind: "empty" });
  const [showHistory, setShowHistory] = useState(false);

  // New-ticket draft (only used when the key is not found).
  const [newTitle, setNewTitle] = useState("");
  const [newProject, setNewProject] = useState("");
  const [newStatus, setNewStatus] = useState<WorkflowStatus>("InProgress");
  /** Status to set when attaching an EXISTING ticket — starts at its current status. */
  const [foundStatus, setFoundStatus] = useState<WorkflowStatus>("InProgress");
  const [foundProject, setFoundProject] = useState("");
  const [workDescription, setWorkDescription] = useState("");

  const [attaching, startAttach] = useTransition();


  const generation = useRef(0);
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Autocomplete suggestions: the user's tickets, loaded once and refreshed
  // after each attach (a new ticket may have just been created).
  const [options, setOptions] = useState<TicketOption[]>([]);
  const loadOptions = useCallback(async () => {
    const result = await listTickets({ take: 200 });
    if (result.ok && aliveRef.current) {
      setOptions(result.data.items.map((t) => ({ ticketKey: t.ticketId, title: t.title, projectName: t.projectName, status: t.status })));
    }
  }, []);
  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  const key = normaliseKey(query);
  const valid = key.length > 0 && TICKET_KEY_RE.test(key);
  const alreadyAttached = valid && attachedKeys.includes(key);

  const lookup = useCallback(async (ticketKey: string) => {
    const mine = ++generation.current;
    setState({ kind: "searching", ticketKey });

    const result = await findTicket({ ticketKey });
    if (!aliveRef.current || mine !== generation.current) return; // stale

    if (!result.ok) {
      setState({ kind: "error", message: result.error.message });
      return;
    }

    if (result.data.found) {
      const t = result.data.ticket;
      setFoundStatus(t.status);
      setFoundProject(t.projectName ?? "");
      setState({
        kind: "found",
        ticket: {
          id: t.id,
          ticketKey: t.ticketId,
          title: t.title,
          projectName: t.projectName,
          status: t.status,
          history: toMergedHistory(t.updates, t.historyEntries),
        },
      });
    } else {
      setState({ kind: "missing", ticketKey: result.data.ticketKey });
      setNewTitle("");
    setNewProject("");
      setNewProject("");
      setNewStatus("InProgress");
    }
  }, []);

  // Debounced lookup — one request per pause, not per keystroke.
  useEffect(() => {
    if (!valid) {
      generation.current += 1;
      const timer = setTimeout(() => setState(key.length === 0 ? { kind: "empty" } : { kind: "typing" }), 0);
      return () => clearTimeout(timer);
    }
    if (attachedKeys.includes(key)) {
      generation.current += 1;
      const timer = setTimeout(() => setState({ kind: "typing" }), 0);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => void lookup(key), LOOKUP_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // `attachedKeys` is a fresh array each render; its contents are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, valid, lookup, attachedKeys.join(",")]);

  function reset() {
    generation.current += 1;
    setQuery("");
    setState({ kind: "empty" });
    setNewTitle("");
    setNewStatus("InProgress");
    setWorkDescription("");
    setShowHistory(false);
    searchRef.current?.focus();
  }

  function attach(input: { ticketKey: string; title?: string; projectName?: string; status?: WorkflowStatus; description?: string }) {
    startAttach(async () => {
      const ok = await onAttach(input);
      if (ok && aliveRef.current) {
        reset();
        void loadOptions();
      }
    });
  }

  function handleEnter() {
    if (!valid) return;
    if (alreadyAttached) {
      onFocusAttached(key);
      reset();
      return;
    }
    if (state.kind === "found") {
      attach({ ticketKey: state.ticket.ticketKey, description: workDescription, status: foundStatus });
      return;
    }
    if (state.kind === "missing") {
      // Give them the chance to name it; Enter again from the title field creates.
      titleRef.current?.focus();
      return;
    }
    // Still debouncing — run the lookup now instead of waiting it out.
    void lookup(key);
  }

  const busy = state.kind === "searching";

  return (
    <div className="flex flex-col gap-2">
      <Field
        label="Add a ticket"
        htmlFor={`${uid}-search`}
        hint="Type a ticket ID and press Enter. If it doesn't exist yet you can create it right here."
      >
        <Autocomplete<TicketOption, false, false, true>
          id={`${uid}-search`}
          freeSolo
          value={null}
          inputValue={query}
          options={options.filter((option) => !attachedKeys.includes(option.ticketKey))}
          getOptionLabel={(option) => (typeof option === "string" ? option : option.ticketKey)}
          filterOptions={(list, { inputValue }) => {
            const needle = inputValue.trim().toLowerCase();
            if (!needle) return list.slice(0, 8);
            return list.filter((option) => option.ticketKey.toLowerCase().includes(needle) || option.title.toLowerCase().includes(needle) || (option.projectName ?? "").toLowerCase().includes(needle)).slice(0, 8);
          }}
          onInputChange={(_event, next, reason) => {
            if (reason === "reset") return;
            setQuery(next);
            setState({ kind: "typing" });
            setShowHistory(false);
          }}
          onChange={(_event, next, reason) => {
            if (reason === "selectOption" && next && typeof next !== "string") {
              setQuery(next.ticketKey);
              setShowHistory(false);
              void lookup(next.ticketKey);
              return;
            }
            if (reason === "createOption") handleEnter();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && query) {
              event.preventDefault();
              reset();
            }
          }}
          renderOption={(props, option) => {
            const { key: optionKey, ...optionProps } = props;
            return (
              <li key={optionKey} {...optionProps}>
                <span className="flex w-full min-w-0 items-center gap-3">
                  <TicketId className="shrink-0">{option.ticketKey}</TicketId>
                  <span className="min-w-0 flex-1 truncate text-sm text-text-muted">{option.title}{option.projectName ? <span className="ml-2 text-xs font-medium text-accent-text">· {option.projectName}</span> : null}</span>
                  <TicketStatusBadge status={option.status} />
                </span>
              </li>
            );
          }}
          noOptionsText={valid ? "No match — press Enter to look it up or create it." : "Type a ticket ID or title"}
          renderInput={(params) => (
            <TextField
              {...params}
              inputRef={searchRef}
              placeholder="Search or enter a ticket ID…"
              slotProps={{
                ...params.slotProps,
                input: {
                  ...params.slotProps.input,
                  startAdornment: <Search aria-hidden="true" className="ml-1 size-4 shrink-0 text-accent-text" />,
                  endAdornment: (
                    <>
                      {busy ? <Loader2 aria-hidden="true" className="size-4 animate-spin text-accent-text" /> : <CornerDownLeft aria-hidden="true" className="size-4 text-accent-text" />}
                      {params.slotProps.input.endAdornment}
                    </>
                  ),
                },
                htmlInput: {
                  ...params.slotProps.htmlInput,
                  spellCheck: false,
                  "aria-describedby": `${uid}-search-hint`,
                  className: cn((params.slotProps.htmlInput as { className?: string }).className, "font-mono"),
                },
              }}
            />
          )}
        />
      </Field>

      <div aria-live="polite" className="empty:hidden">
        {alreadyAttached ? (
          <ResultShell tone="primary">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-base text-text">
                <TicketId>{key}</TicketId> is already on this work log.
              </p>
              <Button
                variant="secondary"
                onClick={() => {
                  onFocusAttached(key);
                  reset();
                }}
              >
                Go to its card
              </Button>
            </div>
          </ResultShell>
        ) : null}

        {!alreadyAttached && key.length > 0 && !valid ? (
          <ResultShell tone="danger">
            <p className="text-base text-text-muted">
              A ticket ID may only contain letters, numbers, <code>-</code> and <code>_</code>.
            </p>
          </ResultShell>
        ) : null}

        {state.kind === "error" ? (
          <ResultShell tone="danger">
            <p className="text-base text-danger">{state.message}</p>
          </ResultShell>
        ) : null}

        {state.kind === "found" && !alreadyAttached ? (
          <ResultShell tone="primary">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <TicketId>{state.ticket.ticketKey}</TicketId>
                  <TicketStatusBadge status={state.ticket.status} />
                  <Badge tone="neutral">
                    {state.ticket.history.length} previous{" "}
                    {state.ticket.history.length === 1 ? "update" : "updates"}
                  </Badge>
                </div>
                <p className="mt-1 max-w-[72ch] text-md text-text">{state.ticket.title}</p>
              </div>

            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_14rem] lg:items-start">
              <Field label="What did you do?" htmlFor={`${uid}-found-work`} className="min-w-0">
                <MarkdownEditor
                  id={`${uid}-found-work`}
                  value={workDescription}
                  ariaLabel="Work completed for this ticket"
                  minHeight="min-h-24"
                  onChange={setWorkDescription}
                />
              </Field>
              <div className="flex min-w-0 flex-col gap-4">
                <Field label="Status" htmlFor={`${uid}-found-status`} className="min-w-0">
                  <Select id={`${uid}-found-status`} value={foundStatus} onChange={(event) => setFoundStatus(event.target.value as WorkflowStatus)}>
                    {TICKET_STATUS_ORDER.map((option) => (
                      <option key={option} value={option}>{TICKET_STATUS_LABELS[option]}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Project / site" htmlFor={`${uid}-found-project`} className="min-w-0">
                  <ProjectInput id={`${uid}-found-project`} value={foundProject} onValueChange={setFoundProject} />
                </Field>
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <Button onClick={() => attach({ ticketKey: state.ticket.ticketKey, description: workDescription, status: foundStatus, projectName: foundProject.trim() })} loading={attaching}>
                <Plus aria-hidden="true" />
                Add ticket + work
              </Button>
            </div>

            {state.ticket.history.length > 0 ? (
              <div className="mt-4 pt-1">
                <button
                  type="button"
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-sm text-sm font-semibold",
                    "text-accent-text transition-colors duration-150 ease-standard hover:text-primary",
                  )}
                  aria-expanded={showHistory}
                  onClick={() => setShowHistory((open) => !open)}
                >
                  <ChevronDown
                    aria-hidden="true"
                    className={cn(
                      "size-3.5 transition-transform duration-200 ease-standard",
                      showHistory && "rotate-180",
                    )}
                  />
                  {showHistory ? "Hide previous updates" : "View previous updates"}
                </button>

                {showHistory ? (
                  <TicketHistory entries={state.ticket.history} className="mt-3" />
                ) : null}
              </div>
            ) : null}
          </ResultShell>
        ) : null}

        {state.kind === "missing" && !alreadyAttached ? (
          <ResultShell tone="primary">
            <div className="flex items-center gap-2">
              <TicketPlus className="size-4 shrink-0 text-primary" aria-hidden="true" />
              <p className="text-base text-text">
                No ticket <TicketId>{state.ticketKey}</TicketId> yet — create it here.
              </p>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 md:items-start">
              <Field
                label="Title / summary"
                htmlFor={`${uid}-title`}
                className="min-w-0"
                hint={`Optional — defaults to ${state.ticketKey}.`}
              >
                <Input
                  id={`${uid}-title`}
                  ref={titleRef}
                  value={newTitle}
                  placeholder="What is this ticket about?"
                  onChange={(event) => setNewTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      attach({
                        ticketKey: state.ticketKey,
                        title: newTitle.trim() || undefined,
                        projectName: newProject.trim() || undefined,
                        status: newStatus,
                        description: workDescription,
                      });
                    }
                  }}
                />
              </Field>

              <Field label="Project / site" htmlFor={`${uid}-project`} className="min-w-0" hint="Optional — which project or site this ticket is for.">
                <ProjectInput id={`${uid}-project`} value={newProject} onValueChange={setNewProject} />
              </Field>

              <Field label="Initial status" htmlFor={`${uid}-status`} className="min-w-0">
                <Select
                  id={`${uid}-status`}
                  value={newStatus}
                  onChange={(event) => setNewStatus(event.target.value as WorkflowStatus)}
                >
                  {TICKET_STATUS_ORDER.map((status) => (
                    <option key={status} value={status}>
                      {TICKET_STATUS_LABELS[status]}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="What did you do?" htmlFor={`${uid}-new-work`} className="min-w-0 md:col-span-2" hint="Optional — you can add it later on the ticket card.">
                <MarkdownEditor
                  id={`${uid}-new-work`}
                  value={workDescription}
                  ariaLabel="Initial work completed for this ticket"
                  minHeight="min-h-28"
                  onChange={setWorkDescription}
                />
              </Field>

              <Button
                className="w-full md:col-span-2 md:justify-self-end md:w-auto"
                loading={attaching}
                onClick={() =>
                  attach({
                    ticketKey: state.ticketKey,
                    title: newTitle.trim() || undefined,
                    projectName: newProject.trim() || undefined,
                    status: newStatus,
                    description: workDescription,
                  })
                }
              >
                <Plus aria-hidden="true" />
                Create &amp; add
              </Button>
            </div>
          </ResultShell>
        ) : null}
      </div>
    </div>
  );
}

/** The results panel. design.md §7: the one place a `shadow-sm` is allowed. */
function ResultShell({
  tone,
  children,
}: {
  tone: "primary" | "danger";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mt-1 rounded-lg border p-4",
        tone === "primary"
          ? "border-primary/30 bg-primary-subtle/70"
          : "border-danger/30 bg-danger-subtle",
      )}
    >
      {children}
    </div>
  );
}

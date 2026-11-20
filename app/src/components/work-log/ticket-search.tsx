"use client";

import { CornerDownLeft, Loader2, Plus, Search, TicketPlus } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";

import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";

import { findTicket, listActiveTickets, listTickets } from "@/actions/tickets";
import { cn } from "@/components/cn";
import { TicketId } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  TICKET_STATUS_LABELS,
  TICKET_STATUS_ORDER,
  TicketStatusBadge,
} from "@/components/ui/ticket-status-badge";
import { toMergedHistory, type HistoryEntry } from "@/components/work-log/types";
import type { WorkflowStatus } from "@/lib/workflow-status";

/**
 * "Search or enter Ticket ID..." — spec §6, §21, §23.
 *
 * One input, no modal, no page change:
 *   type ASU-1234 -> `findTicket({ ticketKey })`
 *     found     -> one line (ID, title, status) + Add; Enter attaches
 *   empty box      -> "Your open tickets" chips, one tap to attach (2026-11-18)
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

  // New-ticket draft (only used when the key is not found).
  const [newTitle, setNewTitle] = useState("");
  const [newStatus, setNewStatus] = useState<WorkflowStatus>("InProgress");

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

  // "Your open tickets" — the ones not Done, most recently touched first.
  const [active, setActive] = useState<TicketOption[]>([]);
  const loadActive = useCallback(async () => {
    const result = await listActiveTickets(8);
    if (result.ok && aliveRef.current) setActive(result.data.map((t) => ({ ticketKey: t.ticketId, title: t.title, projectName: t.projectName, status: t.status })));
  }, []);
  useEffect(() => {
    void loadActive();
  }, [loadActive]);
  const chips = active.filter((option) => !attachedKeys.includes(option.ticketKey)).slice(0, 6);

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
    searchRef.current?.focus();
  }

  function attach(input: { ticketKey: string; title?: string; projectName?: string; status?: WorkflowStatus; description?: string }) {
    startAttach(async () => {
      const ok = await onAttach(input);
      if (ok && aliveRef.current) {
        reset();
        void loadOptions();
        void loadActive();
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
      attach({ ticketKey: state.ticket.ticketKey });
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
        className="wl-tk-find"
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
                  }}
          onChange={(_event, next, reason) => {
            if (reason === "selectOption" && next && typeof next !== "string") {
              setQuery(next.ticketKey);
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
              placeholder="Type a ticket key or title, like ASU-1234"
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
            <div className="flex flex-wrap items-center gap-3">
              <TicketId>{state.ticket.ticketKey}</TicketId>
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-text">{state.ticket.title}</p>
              <TicketStatusBadge status={state.ticket.status} />
              <Button size="sm" onClick={() => attach({ ticketKey: state.ticket.ticketKey })} loading={attaching}>
                <Plus aria-hidden="true" />
                Add
              </Button>
            </div>
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

            <div className="mt-3 flex flex-wrap items-end gap-3">
              <Field label="Title" htmlFor={`${uid}-title`} className="min-w-0 flex-[1_1_16rem]">
                <Input
                  id={`${uid}-title`}
                  ref={titleRef}
                  value={newTitle}
                  placeholder="What is this ticket about?"
                  onChange={(event) => setNewTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      attach({ ticketKey: state.ticketKey, title: newTitle.trim() || undefined, status: newStatus });
                    }
                  }}
                />
              </Field>
              <Field label="Status" htmlFor={`${uid}-status`} className="min-w-0 flex-[0_1_12rem]">
                <Select id={`${uid}-status`} value={newStatus} onChange={(event) => setNewStatus(event.target.value as WorkflowStatus)}>
                  {TICKET_STATUS_ORDER.map((status) => (
                    <option key={status} value={status}>{TICKET_STATUS_LABELS[status]}</option>
                  ))}
                </Select>
              </Field>
              <Button loading={attaching} onClick={() => attach({ ticketKey: state.ticketKey, title: newTitle.trim() || undefined, status: newStatus })}>
                <Plus aria-hidden="true" />
                Create &amp; add
              </Button>
            </div>
          </ResultShell>
        ) : null}
      </div>

      {chips.length > 0 && !query ? (
        <div className="wl-chips" role="group" aria-label="Your open tickets">
          <span className="text-xs font-medium text-text-muted">Your open tickets:</span>
          {chips.map((option) => (
            <button key={option.ticketKey} type="button" className="wl-chip" disabled={attaching} onClick={() => attach({ ticketKey: option.ticketKey })} aria-label={`Add ${option.ticketKey}: ${option.title}`}>
              <Plus className="size-3" aria-hidden="true" />
              <span className="font-mono">{option.ticketKey}</span>
              <small>{option.title}</small>
            </button>
          ))}
        </div>
      ) : null}
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

"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { Check, CircleAlert, Loader2, PencilLine } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { cn } from "@/components/cn";

/**
 * Autosave plumbing for the work log editor — spec §22, design.md §10.
 *
 * One provider per editor. Every autosaving field registers itself under a
 * stable key so the single indicator can say what the *whole page* is doing:
 *
 *   pending (debounce running) -> "Unsaved changes"   --warning
 *   saving  (request in-flight) -> "Saving…"          --text-muted
 *   settled                     -> "Saved ✓"          --success
 *   settled > 45s ago           -> "Last saved N minutes ago"  --text-subtle
 *
 * design.md bans a toast for autosave, so this is text only, `text-xs`.
 */

export type SaveResult = { ok: true } | { ok: false; message: string };

/**
 * Two contexts on purpose. The actions object must be referentially stable —
 * it is a dependency of the debounce effect, and if it changed every time some
 * *other* field saved, it would restart this field's timer and the debounce
 * would never elapse while the page was busy.
 */
type SaveActions = {
  markPending: (key: string, on: boolean) => void;
  markSaving: (key: string, on: boolean) => void;
  reportSaved: (at: Date) => void;
  reportError: (message: string) => void;
};

type SaveState = {
  pendingCount: number;
  savingCount: number;
  lastSavedAt: Date | null;
  error: string | null;
};

const SaveActionsContext = createContext<SaveActions | null>(null);
const SaveStateContext = createContext<SaveState | null>(null);

function toggle(list: string[], key: string, on: boolean): string[] {
  const has = list.includes(key);
  if (on === has) return list; // same reference -> React bails out of the render
  return on ? [...list, key] : list.filter((k) => k !== key);
}

export function SaveStatusProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<string[]>([]);
  const [saving, setSaving] = useState<string[]>([]);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const markPending = useCallback((key: string, on: boolean) => {
    setPending((list) => toggle(list, key, on));
  }, []);
  const markSaving = useCallback((key: string, on: boolean) => {
    setSaving((list) => toggle(list, key, on));
  }, []);
  const reportSaved = useCallback((at: Date) => {
    setLastSavedAt(at);
    setError(null);
  }, []);
  const reportError = useCallback((message: string) => setError(message), []);

  const actions = useMemo<SaveActions>(
    () => ({ markPending, markSaving, reportSaved, reportError }),
    [markPending, markSaving, reportSaved, reportError],
  );

  const state = useMemo<SaveState>(
    () => ({
      pendingCount: pending.length,
      savingCount: saving.length,
      lastSavedAt,
      error,
    }),
    [pending.length, saving.length, lastSavedAt, error],
  );

  return (
    <SaveActionsContext.Provider value={actions}>
      <SaveStateContext.Provider value={state}>{children}</SaveStateContext.Provider>
    </SaveActionsContext.Provider>
  );
}

function useSaveActions(): SaveActions {
  const ctx = useContext(SaveActionsContext);
  if (!ctx) throw new Error("useAutosave must be used inside <SaveStatusProvider>");
  return ctx;
}

function useSaveState(): SaveState {
  const ctx = useContext(SaveStateContext);
  if (!ctx) throw new Error("SaveStatusIndicator must be used inside <SaveStatusProvider>");
  return ctx;
}

/** ~900ms: past a touch-typist's inter-keystroke gap, under a "did it save?" pause. */
export const AUTOSAVE_DELAY_MS = 900;

/**
 * Debounced, idempotent autosave for one field.
 *
 * - Never fires while the value equals what the server already has, so an
 *   untouched field — or one typed back to its original text — sends nothing.
 * - One timer per field; a new keystroke replaces it. No request per keystroke.
 * - On unmount the timer is cleared and any in-flight response is ignored
 *   (no state writes after unmount, and a removed ticket card cannot resurrect
 *   the row that was just detached).
 * - `flush(next?)` saves immediately — used on blur and on status changes,
 *   where waiting out the debounce feels wrong.
 */
export function useAutosave<T>({
  id,
  value,
  initial,
  save,
  delay = AUTOSAVE_DELAY_MS,
  equals,
}: {
  id: string;
  value: T;
  /** What the server already holds. The save baseline. */
  initial: T;
  save: (value: T) => Promise<SaveResult>;
  delay?: number;
  equals?: (a: T, b: T) => boolean;
}) {
  const api = useSaveActions();

  const eq = useRef(equals ?? Object.is);
  const saveRef = useRef(save);

  useEffect(() => {
    eq.current = equals ?? Object.is;
    saveRef.current = save;
  }, [equals, save]);

  /** Last value the server is known (or optimistically assumed) to hold. */
  const savedRef = useRef(initial);
  const aliveRef = useRef(true);

  const run = useCallback(
    async (next: T) => {
      const previous = savedRef.current;
      savedRef.current = next; // optimistic: stops the effect re-firing for the same value
      api.markPending(id, false);
      api.markSaving(id, true);

      let result: SaveResult;
      try {
        result = await saveRef.current(next);
      } catch {
        result = { ok: false, message: "Could not reach the server" };
      }

      if (!aliveRef.current) return; // unmounted mid-flight — drop the response
      api.markSaving(id, false);

      if (result.ok) {
        api.reportSaved(new Date());
      } else {
        savedRef.current = previous; // let the next edit retry
        api.reportError(result.message);
      }
    },
    [api, id],
  );

  useEffect(() => {
    if (eq.current(value, savedRef.current)) {
      api.markPending(id, false);
      return;
    }
    api.markPending(id, true);
    const timer = setTimeout(() => void run(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay, run, api, id]);

  // Unmount: stop owning any status, and ignore whatever is still in flight.
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      api.markPending(id, false);
      api.markSaving(id, false);
    };
  }, [api, id]);

  const flush = useCallback(
    (next?: T) => {
      const candidate = next === undefined ? value : next;
      if (eq.current(candidate, savedRef.current)) return;
      void run(candidate);
    },
    [run, value],
  );

  return { flush };
}

/** The "Saving… / Saved ✓ / Last saved N minutes ago" line (spec §22, §24). */
export function SaveStatusIndicator({ className }: { className?: string }) {
  const { pendingCount, savingCount, lastSavedAt, error } = useSaveState();

  // Re-render on a slow tick so "Last saved N minutes ago" stays honest.
  const [now, setNow] = useState(0);
  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), 20_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);

  let tone = "text-text-subtle";
  let icon = <PencilLine className="size-3.5" aria-hidden="true" />;
  let label = "All changes save automatically";

  if (error) {
    tone = "text-danger";
    icon = <CircleAlert className="size-3.5" aria-hidden="true" />;
    label = error;
  } else if (savingCount > 0) {
    tone = "text-text-muted";
    icon = <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />;
    label = "Saving…";
  } else if (pendingCount > 0) {
    tone = "text-warning";
    icon = <PencilLine className="size-3.5" aria-hidden="true" />;
    label = "Unsaved changes";
  } else if (lastSavedAt) {
    const age = now - lastSavedAt.getTime();
    if (age < 45_000) {
      tone = "text-success";
      icon = <Check className="size-3.5" aria-hidden="true" />;
      label = "Saved ✓";
    } else {
      tone = "text-text-subtle";
      icon = <Check className="size-3.5" aria-hidden="true" />;
      label = `Last saved ${formatDistanceToNowStrict(lastSavedAt, { addSuffix: true })}`;
    }
  }

  return (
    <p
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-2 text-xs font-medium whitespace-nowrap",
        "transition-colors duration-150 ease-standard",
        tone,
        className,
      )}
    >
      {icon}
      {label}
    </p>
  );
}

"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ImagePlus, Loader2, Search, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { NoteIcon } from "@/components/notes/NoteIcon";
import {
  ICON_SCOPES,
  type IconEntry,
  type IconIndex,
  type IconScope,
  type NoteIconRef,
  librariesForScope,
  loadIconIndex,
  searchIcons,
} from "@/lib/note-icons";
import { cn } from "@/components/cn";
import { Input } from "@/components/ui/input";

const pillClass = cn(
  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium",
  "transition-colors",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
);

/** Long enough to skip the keystrokes, short enough to feel instant. */
const SEARCH_DEBOUNCE_MS = 130;

export function NoteIconPicker({
  value,
  onChange,
  label = "Note icon",
  className,
  disabled,
  align = "end",
  placeholder,
  triggerClassName,
}: {
  value?: NoteIconRef | null;
  onChange: (icon: NoteIconRef | null) => void;
  /** Accessible name for the trigger; also the panel's heading. */
  label?: string;
  className?: string;
  disabled?: boolean;
  /** Which trigger edge the panel lines up with: "end" grows left (form rails), "start" grows right (list rows). */
  align?: "start" | "end";
  /** Shown in the trigger when nothing is chosen (default: an "add image" glyph). */
  placeholder?: React.ReactNode;
  triggerClassName?: string;
}) {
  const reduceMotion = useReducedMotion() ?? false;

  const [open, setOpen] = useState(false);
  // Opens upward when there isn't room for the panel below the trigger.
  const [placeAbove, setPlaceAbove] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [scope, setScope] = useState<IconScope>("all");
  const [index, setIndex] = useState<IconIndex | null>(null);
  const [indexError, setIndexError] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const panelId = useId();
  const headingId = `${panelId}-heading`;
  const statusId = `${panelId}-status`;

  /* --- opening ---------------------------------------------------------- */

  const close = useCallback(
    (returnFocus = true) => {
      setOpen(false);
      if (returnFocus) triggerRef.current?.focus();
    },
    [],
  );

  // The 7,000-icon index is fetched the first time the panel opens, never
  // before — it must not sit in the bundle of a page that only shows notes.
  useEffect(() => {
    if (!open || index) return;
    let active = true;
    loadIconIndex().then(
      (loaded) => active && setIndex(loaded),
      () => active && setIndexError(true),
    );
    return () => {
      active = false;
    };
  }, [open, index]);

  useEffect(() => {
    if (!open) return;
    // Autofocus after the panel mounts so the caret lands in the search box.
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  /* --- search ----------------------------------------------------------- */

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(query);
      // A new result set means the old cursor position is meaningless.
      setActiveIndex(0);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const results = useMemo<IconEntry[]>(
    () =>
      index ? searchIcons(index, debounced, librariesForScope(scope)) : [],
    [index, debounced, scope],
  );

  useEffect(() => {
    tileRefs.current.length = results.length;
  }, [results.length]);

  /* --- keyboard --------------------------------------------------------- */

  const focusTile = useCallback((next: number) => {
    setActiveIndex(next);
    tileRefs.current[next]?.focus();
  }, []);

  /** Read the real column count off the grid so Up/Down move by one row. */
  const columnCount = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return 1;
    const template = getComputedStyle(grid).gridTemplateColumns;
    const columns = template.split(" ").filter(Boolean).length;
    return Math.max(1, columns);
  }, []);

  const select = (entry: IconEntry) => {
    onChange({ library: entry.library, name: entry.name });
    close();
  };

  const onPanelKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
      return;
    }

    if (!results.length) return;
    const last = results.length - 1;
    const cols = columnCount();

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusTile(
          document.activeElement === inputRef.current
            ? 0
            : Math.min(last, cursor + cols),
        );
        break;
      case "ArrowUp": {
        event.preventDefault();
        const next = cursor - cols;
        if (next < 0) inputRef.current?.focus();
        else focusTile(next);
        break;
      }
      case "ArrowRight":
        if (document.activeElement === inputRef.current) return;
        event.preventDefault();
        focusTile(Math.min(last, cursor + 1));
        break;
      case "ArrowLeft":
        if (document.activeElement === inputRef.current) return;
        event.preventDefault();
        focusTile(Math.max(0, cursor - 1));
        break;
      case "Home":
        if (document.activeElement === inputRef.current) return;
        event.preventDefault();
        focusTile(0);
        break;
      case "End":
        if (document.activeElement === inputRef.current) return;
        event.preventDefault();
        focusTile(last);
        break;
      case "Enter":
        // From the search box, Enter takes the top result.
        if (document.activeElement === inputRef.current) {
          event.preventDefault();
          select(results[0]);
        }
        break;
      default:
        break;
    }
  };

  /* --- render ----------------------------------------------------------- */

  // `results` can shrink under the cursor; clamp so one tile always owns the
  // tab stop.
  const cursor = Math.min(activeIndex, Math.max(0, results.length - 1));

  const status = indexError
    ? "Icons could not be loaded."
    : !index
      ? "Loading icons…"
      : results.length === 0
        ? `No icons match “${debounced.trim()}”`
        : `${results.length} icon${results.length === 1 ? "" : "s"}${debounced.trim() ? "" : " to start with"}`;

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (open) { close(); return; }
          const rect = triggerRef.current?.getBoundingClientRect();
          const PANEL = 470; // ≈ the panel's full height
          if (rect) setPlaceAbove(window.innerHeight - rect.bottom < PANEL && rect.top > window.innerHeight - rect.bottom);
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={value ? `${label}: ${value.name}` : `${label}: none chosen`}
        className={cn(
          "inline-flex size-11 items-center justify-center rounded-[10px] border bg-surface",
          "border-border text-text-muted transition-colors duration-150",
          "[&:hover:not(:focus)]:border-border-strong hover:text-text",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          "disabled:pointer-events-none disabled:opacity-60",
          open && "border-border-strong text-text",
          triggerClassName,
        )}
      >
        {value ? (
          <NoteIcon icon={value} className="size-5 text-text" />
        ) : (
          placeholder ?? <ImagePlus aria-hidden="true" className="size-[18px]" />
        )}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="false"
            aria-labelledby={headingId}
            onKeyDown={onPanelKeyDown}
            initial={reduceMotion ? false : { opacity: 0, y: placeAbove ? 4 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: placeAbove ? 4 : -4 }}
            transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              /*
                Right-anchored by default. Most callers put this trigger in a
                form's right-hand rail, so opening a 26rem panel rightwards
                from `left-0` ran it straight off the viewport. Growing left
                from the trigger's right edge keeps it on screen at every
                width the rail itself survives. List rows pass align="start".
              */
              "absolute z-50",
              align === "start" ? "left-0" : "right-0",
              placeAbove ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+8px)]",
              "w-[min(88vw,26rem)] max-w-[26rem]",
              "rounded-[16px] bg-surface border border-border p-4",
              "shadow-[0_8px_30px_rgba(15,23,42,0.12)]",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <h2
                id={headingId}
                className="text-base font-semibold tracking-[-0.01em] text-text"
              >
                {label}
              </h2>
              <button
                type="button"
                onClick={() => close()}
                aria-label="Close icon picker"
                className={cn(
                  "-mr-1 -mt-1 inline-flex size-7 items-center justify-center rounded-full",
                  "text-text-subtle transition-colors hover:bg-surface-2 hover:text-text",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                )}
              >
                <X aria-hidden="true" className="size-[15px]" />
              </button>
            </div>

            <div className="mt-3">
              <Input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search icons — try java, k8s, db…"
                aria-label="Search icons"
                aria-controls={panelId}
                aria-describedby={statusId}
                autoComplete="off"
                spellCheck={false}
                startIcon={<Search />}
                endIcon={query ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      inputRef.current?.focus();
                    }}
                    aria-label="Clear search"
                    className="inline-flex size-6 items-center justify-center rounded-full text-text-subtle transition-colors hover:bg-surface-2 hover:text-text"
                  >
                    <X aria-hidden="true" className="size-[13px]" />
                  </button>
                ) : undefined}
              />
            </div>

            <div
              role="group"
              aria-label="Filter icon sets"
              className="mt-3 flex flex-wrap items-center gap-1.5"
            >
              {ICON_SCOPES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    setScope(option.id);
                    setActiveIndex(0);
                  }}
                  aria-pressed={scope === option.id}
                  className={cn(
                    pillClass,
                    scope === option.id
                      ? "border-border-strong bg-surface-2 text-text"
                      : "border-border bg-surface text-text-muted hover:border-border-strong hover:text-text",
                  )}
                >
                  {option.label}
                </button>
              ))}
              {value ? (
                <button
                  type="button"
                  onClick={() => {
                    onChange(null);
                    close();
                  }}
                  className={cn(
                    pillClass,
                    "ml-auto border-border bg-surface text-text-muted",
                    "hover:border-border-strong hover:text-text",
                  )}
                >
                  <X aria-hidden="true" className="size-[13px]" />
                  Remove icon
                </button>
              ) : null}
            </div>

            <p
              id={statusId}
              role="status"
              aria-live="polite"
              className="mt-3 text-xs text-text-subtle"
            >
              {status}
            </p>

            <div
              id={panelId}
              ref={gridRef}
              className={cn(
                "mt-2 grid max-h-[19rem] gap-1 overflow-y-auto overscroll-contain",
                "grid-cols-[repeat(auto-fill,minmax(5.25rem,1fr))]",
              )}
            >
              {!index && !indexError ? (
                <div className="col-span-full flex items-center justify-center gap-2 py-10 text-sm text-text-muted">
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                  Loading icons…
                </div>
              ) : null}

              {results.map((entry, i) => {
                const selected =
                  value?.library === entry.library && value?.name === entry.name;
                return (
                  <button
                    key={entry.id}
                    ref={(node) => {
                      tileRefs.current[i] = node;
                    }}
                    type="button"
                    tabIndex={i === cursor ? 0 : -1}
                    onFocus={() => setActiveIndex(i)}
                    onClick={() => select(entry)}
                    aria-pressed={selected}
                    title={`${entry.label} · ${entry.name}`}
                    className={cn(
                      "flex min-w-0 flex-col items-center gap-1.5 rounded-[10px] border",
                      "px-1.5 py-2.5 transition-colors duration-150",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      selected
                        ? "border-border-strong bg-surface-2"
                        : "border-transparent hover:border-border hover:bg-surface-2",
                    )}
                  >
                    <NoteIcon
                      icon={{ library: entry.library, name: entry.name }}
                      className="size-5 text-text"
                    />
                    <span className="w-full truncate text-center text-2xs leading-[1.3] text-text-muted">
                      {entry.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export default NoteIconPicker;

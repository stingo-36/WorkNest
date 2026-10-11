"use client";

import { Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { cn } from "@/components/cn";

export type DeckSearchDay = {
  key: string;
  /** "Wed 30 Sep" */
  label: string;
  title: string | null;
  tickets: Array<{ key: string; title: string }>;
};

/** SprintDeck listens for this and opens the day. */
export const OPEN_DAY_EVENT = "wl:open-day";

/**
 * "Jump to a day or ticket" (2026-10-09): searches the sprint's days by date,
 * title and the tickets worked on them, and opens the picked day in the deck.
 * ⌘K / Ctrl+K focuses it. Only this sprint — the page shows nothing else.
 */
export function DeckSearch({ days }: { days: DeckSearchDay[] }) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return days
      .map((day) => {
        const ticket = day.tickets.find((t) => t.key.toLowerCase().includes(q) || t.title.toLowerCase().includes(q));
        const hit = ticket || `${day.label} ${day.key} ${day.title ?? ""}`.toLowerCase().includes(q);
        return hit ? { day, ticket } : null;
      })
      .filter((result) => result !== null)
      .slice(0, 8);
  }, [days, query]);

  function pick(key: string) {
    window.dispatchEvent(new CustomEvent(OPEN_DAY_EVENT, { detail: key }));
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  }

  const showList = open && query.trim().length > 0;

  return (
    <div className="relative w-full lg:w-[26rem]">
      <label htmlFor={`${id}-input`} className="sr-only">Jump to a day or ticket</label>
      <div className="wl-search flex h-12 items-center gap-2.5 rounded-full border border-border bg-surface pr-2 pl-4">
        <Search className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
        <input
          ref={inputRef}
          id={`${id}-input`}
          role="combobox"
          aria-expanded={showList}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={showList && results[active] ? `${id}-opt-${active}` : undefined}
          autoComplete="off"
          value={query}
          placeholder="Jump to a day or ticket"
          onChange={(event) => { setQuery(event.target.value); setActive(0); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
            else if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
            else if (event.key === "Enter" && results[active]) { event.preventDefault(); pick(results[active].day.key); }
            else if (event.key === "Escape") { setQuery(""); inputRef.current?.blur(); }
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-md text-text outline-none placeholder:text-text-muted"
        />
        <kbd className="hidden shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 font-sans text-xs font-semibold text-text-muted lg:inline">⌘K</kbd>
      </div>
      {showList ? (
        <ul id={`${id}-list`} role="listbox" aria-label="Matching days" className="t-dropdown absolute top-full right-0 left-0 z-30 mt-2 max-h-80 overflow-y-auto rounded-2xl border border-border bg-surface p-1.5 shadow-md">
          {results.length ? results.map(({ day, ticket }, index) => (
            <li
              key={day.key}
              id={`${id}-opt-${index}`}
              role="option"
              aria-selected={index === active}
              // mousedown, not click: the input's blur would close the list first.
              onMouseDown={(event) => { event.preventDefault(); pick(day.key); }}
              onMouseEnter={() => setActive(index)}
              className={cn("flex cursor-pointer flex-col gap-0.5 rounded-xl px-3 py-2", index === active && "bg-surface-2")}
            >
              <span className="text-md font-semibold text-text">{day.label}{day.title ? <span className="font-normal text-text-muted"> · {day.title}</span> : null}</span>
              {ticket ? <span className="truncate text-sm text-text-muted"><span className="rounded-md bg-primary-subtle px-1.5 text-accent-text tabular-nums">{ticket.key}</span> {ticket.title}</span> : null}
            </li>
          )) : <li className="px-3 py-2 text-md text-text-subtle">Nothing in this sprint matches.</li>}
        </ul>
      ) : null}
    </div>
  );
}

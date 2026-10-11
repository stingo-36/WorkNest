"use client";

import { Briefcase, Plane, Sun } from "lucide-react";

import { cn } from "@/components/cn";
import { DAY_LABEL, type DayType } from "@/components/work-log/day-type";

const DAY_TYPES: Array<{ value: DayType; Icon: typeof Briefcase }> = [
  { value: "Work", Icon: Briefcase },
  { value: "Holiday", Icon: Sun },
  { value: "Leave", Icon: Plane },
];

/**
 * Work day / Holiday / Leave as a segmented radio group.
 * `surface="hero"` is for the navy `.wl-hero` panel: a dark recessed track with
 * a solid white selected segment. The default sits on white cards: a tinted
 * track with a navy selected segment (same fill as primary buttons).
 */
export function DayTypeToggle({
  name,
  labelledBy,
  value,
  onChange,
  disabled,
  surface = "card",
  size = "md",
  short = false,
}: {
  name: string;
  labelledBy: string;
  value: DayType;
  onChange: (next: DayType) => void;
  disabled?: boolean;
  surface?: "card" | "hero";
  size?: "md" | "lg";
  /** "Work" instead of "Work day", for narrow columns. */
  short?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className={cn(
        "grid grid-cols-3 gap-1 rounded-lg p-0.5",
        surface === "hero" ? "wl-inset" : "border border-border-strong bg-surface-2",
        disabled && "opacity-70",
      )}
    >
      {DAY_TYPES.map(({ value: option, Icon }) => {
        const selected = value === option;
        return (
          <label
            key={option}
            className={cn(
              "flex min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-md text-sm font-semibold transition-[color,background-color,box-shadow] duration-150",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-ring",
              size === "lg" ? "h-10" : "h-8",
              short ? "px-1.5" : "px-2.5",
              selected
                ? surface === "hero"
                  ? "wl-solid bg-surface text-accent-text shadow-sm"
                  : "bg-sidebar text-sidebar-fg shadow-sm"
                : "text-text-muted hover:bg-surface-3 hover:text-text",
              disabled && "cursor-wait",
            )}
          >
            <input type="radio" name={name} value={option} checked={selected} disabled={disabled} onChange={() => onChange(option)} className="sr-only" />
            {/* Icons from md: on a phone the full label ("Work day") needs the room. */}
            <Icon className="hidden size-4 shrink-0 md:block" aria-hidden="true" />
            <span className="truncate">{short && option === "Work" ? "Work" : DAY_LABEL[option]}</span>
          </label>
        );
      })}
    </div>
  );
}

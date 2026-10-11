"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/components/cn";

/**
 * The page header every workspace list page shares (2026-10-11): a display
 * title (`.page-title`, one fluid size app-wide), an optional inline meta (the
 * date) and a description under it, optional stat counts, and actions on the
 * right. Replaces the slate `PageBand`. Lives inside `.tk-focus` (globals.css),
 * which brings the teal-and-ink palette and the type classes.
 */
export function PageHead({
  title,
  meta,
  description,
  stats,
  actions,
  children,
}: {
  title: ReactNode;
  /** Short inline text beside the title, e.g. today's date. */
  meta?: ReactNode;
  description?: ReactNode;
  stats?: Array<{ value: ReactNode; label: string }>;
  actions?: ReactNode;
  /** Extra content under the description. */
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
      <div className="flex min-w-0 flex-col gap-3">
        {/* Phones: keep clear of the account avatar floating top-right. */}
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-4.5 gap-y-1.5 max-md:pr-14">
          <h1 className="page-title [overflow-wrap:anywhere]">{title}</h1>
          {meta ? <p className="tk-eyebrow text-text-muted" suppressHydrationWarning>{meta}</p> : null}
        </div>
        {description ? <p className="max-w-[65ch] text-base text-text-muted md:text-lg">{description}</p> : null}
        {children}
        {stats?.length ? (
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-text-muted md:gap-x-6 md:text-md">
            {stats.map((stat) => (
              <li key={stat.label}><b className="mr-1.5 text-lg font-bold text-text tabular-nums md:text-xl">{stat.value}</b>{stat.label}</li>
            ))}
          </ul>
        ) : null}
      </div>
      {actions ? <div className="flex w-full min-w-0 flex-wrap items-center gap-2.5 md:w-auto">{actions}</div> : null}
    </header>
  );
}

/** The ink pill for a page's main action (48px). */
export const primaryPill =
  "inline-flex h-12 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full bg-sidebar px-5 text-base font-semibold whitespace-nowrap text-sidebar-fg transition-colors duration-150 hover:bg-sidebar-3 disabled:cursor-wait disabled:opacity-60 md:px-5.5 md:text-lg [&_svg]:size-4.5";

/** The outline pill for a secondary action (44px). */
export const outlinePill =
  "inline-flex h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full border border-[var(--c-tk-rule)] bg-surface px-5 text-md font-semibold whitespace-nowrap text-text transition-colors duration-150 hover:border-text disabled:cursor-wait disabled:opacity-60 [&_svg]:size-4";

/**
 * The search pill (48px): icon, field, optional ⌘K hint. With `shortcut`,
 * ⌘K / Ctrl+K focuses it from anywhere on the page.
 */
export function SearchPill({ id, label, value, placeholder, onChange, shortcut = false, className }: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  shortcut?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!shortcut) return;
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        ref.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcut]);

  return (
    <label htmlFor={id} className={cn("tk-field flex h-12 min-w-0 items-center gap-3 rounded-full border border-border bg-surface pr-2.5 pl-4.5 text-text-muted", !shortcut && "pr-4.5", className)}>
      <Search className="size-4.5 shrink-0" strokeWidth={2} aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <input
        ref={ref}
        id={id}
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full min-w-0 flex-1 bg-transparent text-base text-text outline-none placeholder:text-text-muted md:text-lg"
      />
      {shortcut ? <kbd aria-hidden="true" className="shrink-0 rounded-lg bg-surface-2 px-2 py-0.5 font-sans text-sm font-semibold text-text-muted max-md:hidden">⌘K</kbd> : null}
    </label>
  );
}

export type UnderlineTab = { key: string; label: string; count?: number; href?: string; dim?: boolean };

/**
 * Underline tabs (Resources, Favourites, Tickets): the current one bold with an
 * ink underline, the strip ruled below; scrolls sideways when it doesn't fit.
 * Links when an item has `href`, else buttons calling `onSelect`.
 */
export function UnderlineTabs({ label, items, current, onSelect, end }: {
  label: string;
  items: UnderlineTab[];
  current: string | null;
  onSelect?: (key: string) => void;
  /** Right-hand extra, e.g. an "All types" menu. */
  end?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-end gap-6 border-b border-[var(--c-tk-rule)]">
      <nav aria-label={label} className="flex min-w-0 flex-1 gap-5 overflow-x-auto [scrollbar-width:none] md:gap-10">
        {items.map((item) => {
          const on = item.key === current;
          const className = cn(
            "relative flex min-h-11 shrink-0 cursor-pointer items-end gap-1.5 pb-3 text-base whitespace-nowrap transition-colors duration-150 md:text-xl",
            on ? "font-bold text-text after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-text" : "font-medium text-text-muted hover:text-text",
            item.dim && "opacity-50",
          );
          const inner = (
            <>
              {item.label}
              {item.count !== undefined ? <span className="pb-0.5 text-sm font-semibold text-text-muted tabular-nums">{item.count}</span> : null}
            </>
          );
          return item.href ? (
            <Link key={item.key} href={item.href} scroll={false} aria-current={on ? "page" : undefined} className={className}>{inner}</Link>
          ) : (
            <button key={item.key} type="button" aria-current={on ? "page" : undefined} onClick={() => onSelect?.(item.key)} className={className}>{inner}</button>
          );
        })}
      </nav>
      {end}
    </div>
  );
}

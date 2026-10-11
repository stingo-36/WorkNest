"use client";

import { createElement, useEffect, useReducer } from "react";

import {
  type NoteIconRef,
  resolveIcon,
  resolveIconSync,
} from "@/lib/note-icons";
import { cn } from "@/components/cn";

/**
 * Renders a stored `{ library, name }` pair.
 *
 * The icon sets are loaded on demand (see `lib/note-icons`), so the first note
 * on a page pays a chunk fetch and every later one resolves synchronously from
 * the module cache. While that fetch is in flight — and if the pairing turns
 * out not to exist at all — we hold the same box with a neutral placeholder so
 * lists never reflow.
 */
export function NoteIcon({
  icon,
  className,
  fallback,
  title,
}: {
  icon?: NoteIconRef | null;
  /** Sizing and colour come from here, e.g. "size-4 text-text-muted". */
  className?: string;
  /** Rendered instead of the placeholder when there is no icon to show. */
  fallback?: React.ReactNode;
  /** Set to give the icon an accessible name; omitted, it is decorative. */
  title?: string;
}) {
  const library = icon?.library;
  const name = icon?.name;

  // Re-render when a pending library import lands; the icon itself is always
  // read straight out of the module cache, so there is no state to fall out of
  // sync with the props.
  const [, onLibraryLoaded] = useReducer((n: number) => n + 1, 0);
  // Lowercase and rendered through createElement on purpose: this is a lookup
  // in a module cache, not a component defined during render.
  const iconType = library && name ? resolveIconSync(library, name) : null;

  useEffect(() => {
    if (!library || !name || iconType) return;
    let active = true;
    void resolveIcon(library, name).then(() => {
      if (active) onLibraryLoaded();
    });
    return () => {
      active = false;
    };
  }, [library, name, iconType]);

  if (!iconType) {
    if (fallback !== undefined) return <>{fallback}</>;
    return (
      <span
        aria-hidden="true"
        className={cn(
          "inline-block shrink-0 rounded-[4px] bg-surface-2",
          "size-4",
          className,
        )}
      />
    );
  }

  return createElement(iconType, {
    "aria-hidden": title ? undefined : true,
    role: title ? "img" : undefined,
    "aria-label": title,
    className: cn("shrink-0", className),
  });
}

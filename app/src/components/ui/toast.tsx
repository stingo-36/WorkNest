"use client";

import { Toaster as SonnerToaster } from "sonner";

/**
 * Toasts (sonner) — design.md §10: bottom-right, `shadow-md`, `rounded-lg`,
 * **max 2 stacked**. Styled from tokens via `classNames` rather than sonner's
 * own CSS variables. The site is light-only (no dark mode).
 *
 * Not for autosave — design.md §10 explicitly bans a toast there; the work-log
 * editor uses a text indicator instead.
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      visibleToasts={2}
      gap={12}
      // Above the Ask button, which owns the bottom-right corner.
      offset={{ right: 24, bottom: 88 }}
      mobileOffset={{ right: 16, bottom: 76 }}
      theme="light"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-full items-start gap-3 rounded-lg border border-border bg-surface p-4 text-base text-text shadow-md",
          title: "font-semibold text-text",
          description: "text-sm text-text-muted",
          actionButton:
            "ml-auto h-11 shrink-0 cursor-pointer rounded-md bg-primary px-3 text-sm font-semibold text-primary-fg hover:bg-primary-hover md:h-10",
          cancelButton:
            "h-11 shrink-0 cursor-pointer rounded-md border border-border-strong px-3 text-sm font-semibold text-text hover:bg-surface-2 md:h-10",
          closeButton:
            "cursor-pointer rounded-sm border border-border-strong bg-surface text-text-muted hover:bg-surface-2",
          icon: "shrink-0 [&_svg]:size-4",
          success: "text-success",
          error: "text-danger",
          warning: "text-warning",
          info: "text-info",
        },
      }}
    />
  );
}

/**
 * Re-exported so app code imports `toast` from one place and never reaches for
 * sonner directly — keeps the swap surface small.
 */
export { toast } from "sonner";

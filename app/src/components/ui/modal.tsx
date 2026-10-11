"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

import { cn } from "@/components/cn";
import { Button } from "@/components/ui/button";

/**
 * Centred popup — the native `<dialog>` (like ConfirmationDialog), so focus
 * trapping, Escape and the inert page behind it come from the platform.
 * Header (eyebrow + title + close) stays put; the body scrolls; an optional
 * footer holds the actions.
 */
export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  footer,
  size = "md",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  eyebrow?: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg";
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressedBackdrop = useRef(false);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
    // The page behind shouldn't scroll while the popup is up.
    document.documentElement.style.overflow = open ? "hidden" : "";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Escape. A nested dialog's cancel is its own business.
        if (event.target !== ref.current) return;
        event.preventDefault();
        onClose();
      }}
      onPointerDown={(event) => {
        pressedBackdrop.current = event.target === ref.current;
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself. But when a
        // press and its release hit different elements, the browser sends the
        // click to their common ancestor — the dialog — e.g. pressing a MUI
        // Select and releasing on a menu option (menus portal into the dialog).
        // So it only counts if the press started on the backdrop too.
        if (event.target === ref.current && pressedBackdrop.current) onClose();
        pressedBackdrop.current = false;
      }}
      className={cn(
        "t-modal m-auto w-[calc(100%-2rem)] overflow-hidden rounded-2xl border border-border bg-surface p-0 text-text shadow-lg backdrop:bg-overlay",
        size === "lg" ? "max-w-2xl" : "max-w-xl",
      )}
    >
      {open ? (
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <header className="flex items-start gap-3 border-b border-border px-5 py-4 md:px-6">
            <div className="min-w-0 flex-1">
              {eyebrow ? <div className="mb-1 text-sm text-text-muted">{eyebrow}</div> : null}
              <h2 id={titleId} className="text-xl font-semibold leading-snug tracking-tight text-text">
                {title}
              </h2>
            </div>
            <Button variant="ghost" size="sm" iconOnly aria-label="Close" onClick={onClose} className="-mr-1.5 shrink-0">
              <X aria-hidden="true" />
            </Button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-6">{children}</div>
          {footer ? (
            <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface-2 px-5 py-3 md:px-6">
              {footer}
            </footer>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}

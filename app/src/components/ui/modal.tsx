"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

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
  sheetOnPhone = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  eyebrow?: ReactNode;
  footer?: ReactNode;
  /** `full`: fills the screen (Quick log's composer, Ocean 2026-11-01). */
  size?: "md" | "lg" | "xl" | "full";
  /** Below md, fill the screen like a sheet (footer pinned to the bottom); a normal popup from md. */
  sheetOnPhone?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressedBackdrop = useRef(false);
  const titleId = useId();
  /**
   * Playing the close animation. Most callers unmount the Modal the moment
   * `onClose` fires, which used to cut it off mid-frame (it vanished instead of
   * easing out, 2026-11-25) — so the user's own closes (×, Escape, backdrop)
   * animate first and call `onClose` once the dialog has faded.
   */
  const [closing, setClosing] = useState(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const requestClose = useCallback(() => {
    const el = ref.current;
    if (!el || closing) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onCloseRef.current();
      return;
    }
    setClosing(true);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.removeEventListener("transitionend", onEnd);
      setClosing(false);
      onCloseRef.current();
    };
    const onEnd = (event: TransitionEvent) => {
      if (event.target === el && event.propertyName === "opacity") finish();
    };
    el.addEventListener("transitionend", onEnd);
    // the floor, should no transition run (or its end event get lost)
    window.setTimeout(finish, 320);
  }, [closing]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
    // The page behind shouldn't scroll while the popup is up — and keeping the
    // scrollbar's gutter stops the page shifting sideways as it opens/closes.
    const root = document.documentElement.style;
    root.overflow = open ? "hidden" : "";
    root.scrollbarGutter = open ? "stable" : "";
    return () => {
      root.overflow = "";
      root.scrollbarGutter = "";
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      data-closing={closing ? "" : undefined}
      onCancel={(event) => {
        // Escape. A nested dialog's cancel is its own business.
        if (event.target !== ref.current) return;
        event.preventDefault();
        requestClose();
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
        if (event.target === ref.current && pressedBackdrop.current) requestClose();
        pressedBackdrop.current = false;
      }}
      className={cn(
        "t-modal m-auto overflow-hidden border-border bg-surface p-0 text-text shadow-lg backdrop:bg-overlay",
        size === "full" ? "modal-full h-dvh max-h-none w-full max-w-none rounded-none border-0" : "w-[calc(100%-2rem)] rounded-2xl border",
        size === "xl" ? "max-w-5xl" : size === "lg" ? "max-w-2xl" : size === "md" ? "max-w-xl" : null,
        sheetOnPhone && "max-md:h-dvh max-md:max-h-none max-md:w-full max-md:max-w-none max-md:rounded-none max-md:border-0",
      )}
    >
      {open ? (
        <div className={cn("flex flex-col", size === "full" ? "h-dvh" : "max-h-[calc(100dvh-2rem)]", sheetOnPhone && "max-md:h-dvh max-md:max-h-none")}>
          <header className="flex items-start gap-3 border-b border-border px-5 py-4 md:px-6">
            <div className="min-w-0 flex-1">
              {eyebrow ? <div className="mb-1 text-sm text-text-muted">{eyebrow}</div> : null}
              <h2 id={titleId} className="text-xl font-semibold leading-snug tracking-tight text-text">
                {title}
              </h2>
            </div>
            <Button variant="ghost" size="sm" iconOnly aria-label="Close" onClick={requestClose} className="-mr-1.5 shrink-0">
              <X aria-hidden="true" />
            </Button>
          </header>
          <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-6", size === "full" && "md:px-10 md:py-8")}>{children}</div>
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

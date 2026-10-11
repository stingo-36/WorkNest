"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/components/cn";
import { Button } from "@/components/ui/button";

/**
 * Confirmation dialog — built on the native `<dialog>` element, so focus
 * trapping, Escape-to-close, inertness of the page behind it and the top layer
 * all come from the platform instead of from hand-rolled JS.
 *
 * design.md: `shadow-lg` + `rounded-xl` (§7) — a dialog is one of the few
 * things allowed to float.
 */
export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** May return a promise — the confirm button shows a loading state until it settles. */
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  async function handleConfirm() {
    try {
      setBusy(true);
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      aria-describedby={description ? "confirm-description" : undefined}
      onCancel={(event) => {
        // Escape key. Let the parent own `open`.
        event.preventDefault();
        if (!busy) onCancel();
      }}
      onClick={(event) => {
        // Clicking the backdrop: the click target is the dialog itself.
        if (event.target === ref.current && !busy) onCancel();
      }}
      className={cn(
        "t-modal m-auto w-[calc(100%-2rem)] max-w-96 rounded-2xl border border-border bg-surface p-6 text-text shadow-lg",
        "backdrop:bg-overlay",
      )}
    >
      <h2 id="confirm-title" className="text-lg font-semibold text-text">
        {title}
      </h2>

      {description ? (
        <p id="confirm-description" className="mt-2 text-md text-text-muted">
          {description}
        </p>
      ) : null}

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button
          variant={destructive ? "danger" : "primary"}
          onClick={handleConfirm}
          loading={busy}
        >
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}

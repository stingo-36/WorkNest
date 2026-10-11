"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { cn } from "@/components/cn";

/**
 * Minimal dropdown menu: click to open, Escape or an outside click to close,
 * focus returns to the trigger. Deliberately small — the app needs two of these
 * (Quick Create, user menu), not a headless-UI dependency.
 *
 * `shadow-md` + `rounded-lg` per design.md §7 (dropdowns are allowed to float).
 */
export function Menu({
  trigger,
  children,
  align = "end",
  side = "bottom",
  label,
  className,
}: {
  /** Receives the props that must land on the trigger element. */
  trigger: (props: {
    "aria-expanded": boolean;
    "aria-haspopup": "menu";
    "aria-controls": string;
    onClick: () => void;
    ref: React.Ref<HTMLButtonElement>;
  }) => ReactNode;
  children: ReactNode;
  align?: "start" | "end";
  /** Which side of the trigger the panel opens on — "top" for the bottom dock. */
  side?: "top" | "bottom";
  label: string;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  return (
    <div className={cn("relative", className)}>
      {trigger({
        "aria-expanded": open,
        "aria-haspopup": "menu",
        "aria-controls": id,
        onClick: () => setOpen((prev) => !prev),
        ref: triggerRef,
      })}

      {open ? (
        <div
          id={id}
          ref={panelRef}
          role="menu"
          aria-label={label}
          onClick={(event) => {
            // Closing unmounts the panel. A `<form action={...}>` button inside
            // it must survive long enough for its submit event to fire, so it
            // closes itself by navigating instead.
            if ((event.target as HTMLElement).closest('button[type="submit"]')) {
              return;
            }
            setOpen(false);
          }}
          data-origin={`${side === "top" ? "bottom" : "top"}-${align === "end" ? "right" : "left"}`}
          className={cn(
            "t-dropdown absolute z-50 min-w-52 rounded-xl border border-border bg-surface p-1.5 shadow-md",
            side === "top" ? "bottom-full mb-3" : "top-full mt-2",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** A row inside `<Menu>`. 32px tall, 16px icon — design.md §9. */
export const menuItemClass = cn(
  "flex h-11 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-text-muted md:h-10",
  "transition-colors duration-150 ease-standard",
  "hover:bg-surface-2 hover:text-text active:bg-surface-3",
  "[&_svg]:size-4 [&_svg]:shrink-0",
);

export function MenuSeparator() {
  return <hr className="my-1 border-t border-border" role="separator" />;
}

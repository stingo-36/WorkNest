import * as React from "react";
import { AlertCircle } from "lucide-react";

import { cn } from "@/components/cn";

/**
 * Auth-scoped field + input. These are deliberately NOT the dense `ui/`
 * primitives: the app runs at 32-36px control heights, and a sign-in screen
 * wants 44px targets and 15px type. `ui/field.tsx` and `ui/input.tsx` are
 * untouched and still own every in-app form.
 *
 * Rules applied:
 *   ux-guidelines #54  visible label, never placeholder-only
 *   ux-guidelines #55  inline error below the field, wired with aria-describedby
 *   ux-guidelines #37  error is never colour-only — icon + text as well
 *   ux-guidelines #44  error containers are role="alert"
 *   ux-guidelines #19  the message slot is reserved, so showing an error does
 *                      not shove the submit button down the page
 *   ux-guidelines #62  distinct border + fill so the input reads interactive
 *   ux-guidelines #104 targets are 44px tall, well clear of the 24px minimum
 */

export function AuthField({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <label htmlFor={htmlFor} className="text-base font-semibold text-text">
        {label}
      </label>

      {children}

      {/* One reserved slot for hint OR error — no layout shift either way. */}
      <div className="min-h-5">
        {error ? (
          <p
            id={`${htmlFor}-error`}
            role="alert"
            className="auth-reveal flex items-start gap-2 text-xs font-semibold text-danger"
          >
            <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        ) : hint ? (
          <p id={`${htmlFor}-hint`} className="text-xs text-text-subtle">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Form-level error banner — wrong credentials, server unreachable, or a
 * validation failure with no single owning field.
 *
 * ux-guidelines #109 (Focusable Error Summary): it sits at the top of the form,
 * is `role="alert"`, and takes `tabIndex={-1}` so the form can move focus here
 * after a failed submit without it becoming a tab stop afterwards. Inline field
 * errors are kept as well — this never replaces them.
 */
export function AuthFormError({
  ref,
  children,
}: {
  ref?: React.Ref<HTMLDivElement>;
  children?: React.ReactNode;
}) {
  if (!children) return null;
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className={cn(
        "auth-reveal flex items-start gap-2 rounded-lg border border-danger",
        "bg-danger-subtle px-3 py-2 text-base font-semibold text-danger",
      )}
    >
      <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/** Shared input shell. Focus moves the edge to brand blue over 150ms; the 2px
 *  brand-blue `:focus-visible` outline from globals.css sits on top of it. */
export const authInputBase = cn(
  "h-11 w-full rounded-md border border-border-strong bg-surface",
  "text-md font-medium text-text placeholder:text-text-subtle",
  "transition-[border-color,background-color] duration-150 ease-standard",
  "hover:border-primary/60",
  "focus:border-primary focus:bg-primary-subtle/40",
  "aria-invalid:border-danger",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

export type AuthInputProps = React.ComponentProps<"input"> & {
  /** Leading Lucide icon. Decorative — the visible `<label>` is the name. */
  icon?: React.ComponentType<{ className?: string }>;
  /** Rendered at the right edge (e.g. the password visibility toggle). */
  trailing?: React.ReactNode;
};

export function AuthInput({
  className,
  icon: Icon,
  trailing,
  type = "text",
  ...props
}: AuthInputProps) {
  return (
    <div className="group relative min-w-0">
      {Icon ? (
        <Icon
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2",
            "text-text-subtle transition-colors duration-150 ease-standard",
            "group-focus-within:text-accent-text",
          )}
        />
      ) : null}

      <input
        type={type}
        className={cn(
          authInputBase,
          Icon ? "pl-10" : "px-3",
          trailing ? "pr-12" : Icon ? "pr-3" : undefined,
          className,
        )}
        {...props}
      />

      {trailing ? (
        <div className="absolute top-1/2 right-1 -translate-y-1/2">
          {trailing}
        </div>
      ) : null}
    </div>
  );
}

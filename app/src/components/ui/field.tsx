import * as React from "react";

import { cn } from "@/components/cn";

/**
 * Label + control + inline error. Labels are always visible — never
 * placeholder-only (design.md §12 / a11y).
 *
 * Usage:
 *   <Field label="Email" htmlFor="email" error={errors.email}>
 *     <Input id="email" name="email" aria-invalid={!!errors.email}
 *            aria-describedby={errors.email ? "email-error" : undefined} />
 *   </Field>
 *
 * The error node's id is `${htmlFor}-error`, and the hint's `${htmlFor}-hint`.
 */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label
        id={`${htmlFor}-label`}
        htmlFor={htmlFor}
        className="text-sm font-semibold text-text"
      >
        {label}
        {required ? (
          <span className="ml-1 text-danger" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      {children}

      {hint && !error ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-text-subtle">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p
          id={`${htmlFor}-error`}
          role="alert"
          className="text-xs font-medium text-danger"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Form-level error banner (wrong password, server unreachable, …). */
export function FormError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-sm font-medium text-danger"
    >
      {children}
    </div>
  );
}

import type { ReactNode } from "react";

import { cn } from "@/components/cn";
import { inputBase } from "@/components/ui/input";

/**
 * Field adapter for the ported Nexa notes editor.
 *
 * The editor was written against Nexa's `Field` (plural `errors`, an `optional`
 * tag), while this app's `ui/field` takes a single `error` and a `required`
 * marker. Rather than rewrite ~1,500 lines of editor to the other contract,
 * this keeps Nexa's shape and renders it with THIS app's design tokens — so the
 * editor looks native here and stays easy to re-sync with Nexa later.
 */
export const inputClass = cn(inputBase, "h-9 px-3 text-base");

export function Field({
  label,
  hint,
  optional,
  htmlFor,
  errors,
  children,
  className,
}: {
  label: string;
  hint?: string;
  /** A quiet "optional" tag, rather than shouting it in the label. */
  optional?: boolean;
  htmlFor?: string;
  errors?: string[];
  children: ReactNode;
  className?: string;
}) {
  const errorId = errors?.length && htmlFor ? `${htmlFor}-error` : undefined;

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <label htmlFor={htmlFor} className="text-sm font-medium text-text">
          {label}
        </label>
        {optional ? (
          <span className="text-2xs font-normal text-text-subtle">optional</span>
        ) : null}
        {hint ? (
          <span className="text-xs text-text-subtle">{hint}</span>
        ) : null}
      </div>

      {children}

      {errors?.length ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-danger">
          {errors[0]}
        </p>
      ) : null}
    </div>
  );
}

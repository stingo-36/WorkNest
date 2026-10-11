"use client";

import { Check, X } from "lucide-react";
import * as React from "react";

import { cn } from "@/components/cn";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation";

/**
 * Live password strength + a "passwords match" check for the register form.
 *
 * ux-guidelines #37: never colour alone — the meter always carries a written
 * label ("Fair", "Strong") next to it.
 * ux-guidelines #118: one atomic contextual status ("Password strength: Fair"),
 * announced with role="status", never a bare number and never moving focus.
 * design.md §7 / motion.csv performance notes: the meter fill animates with
 * `transform: scaleX()`, never `width`.
 */

const LABELS = ["Too short", "Weak", "Fair", "Good", "Strong"] as const;

/** 0-4. Length gets two of the points because length is what actually helps. */
export function passwordScore(value: string): number {
  if (!value) return 0;
  if (value.length < PASSWORD_MIN_LENGTH) return 1;

  let score = 2;
  if (value.length >= 12) score += 1;

  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) =>
    pattern.test(value),
  ).length;
  if (classes >= 3) score += 1;

  return Math.min(score, 4);
}

const FILL_TONE = [
  "bg-surface-3",
  "bg-danger",
  "bg-warning",
  "bg-primary",
  "bg-success",
] as const;

const TEXT_TONE = [
  "text-text-subtle",
  "text-danger",
  "text-warning",
  "text-accent-text",
  "text-success",
] as const;

export function PasswordStrength({ value }: { value: string }) {
  const score = passwordScore(value);
  const label = LABELS[score];

  // The row keeps its height whether or not the meter is showing, so the first
  // keystroke doesn't shove the confirm field down (ux-guidelines #19).
  return (
    <div className="flex min-h-5 items-center gap-3">
      {value ? (
        <>
          <div
            aria-hidden="true"
            className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-3"
          >
            <div
              className={cn(
                "password-strength-fill h-full rounded-full",
                FILL_TONE[score],
              )}
              style={{ "--auth-strength": score / 4 } as React.CSSProperties}
            />
          </div>

          <p
            role="status"
            className={cn(
              "w-20 shrink-0 text-right text-xs font-semibold",
              TEXT_TONE[score],
            )}
          >
            {label}
            <span className="sr-only"> password strength</span>
          </p>
        </>
      ) : null}
    </div>
  );
}

/**
 * Confirm-password feedback.
 *
 * app-interface.csv #16 / ux-guidelines #56 say validate on blur, not on every
 * keystroke. The user asked for an instant match check, so this splits the
 * difference: the positive "Passwords match" appears the moment it is true
 * (reassurance, never scolding), while the negative only appears once the field
 * has been blurred — so nobody is told they are wrong mid-word.
 */
export function PasswordMatch({
  password,
  confirmation,
  touched,
}: {
  password: string;
  confirmation: string;
  touched: boolean;
}) {
  const matches = password === confirmation;
  const show = Boolean(confirmation) && (matches || touched);

  // Same reserved-slot trick as the strength meter: the row exists either way.
  return (
    <div className="min-h-5">
      {show ? (
        <p
          role="status"
          className={cn(
            "auth-reveal flex items-center gap-2 text-xs font-semibold",
            matches ? "text-success" : "text-danger",
          )}
        >
          {matches ? (
            <Check aria-hidden="true" className="size-4 shrink-0" />
          ) : (
            <X aria-hidden="true" className="size-4 shrink-0" />
          )}
          {matches ? "Passwords match" : "Passwords do not match"}
        </p>
      ) : null}
    </div>
  );
}

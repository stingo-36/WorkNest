"use client";

import { Eye, EyeOff, Lock } from "lucide-react";
import * as React from "react";

import { AuthInput, type AuthInputProps } from "@/components/auth/auth-field";

/**
 * Password input with a visibility toggle.
 *
 * app-interface.csv #19 (Password Visibility) and ux-guidelines #60: never make
 * the user type blind. app-interface.csv #32 / ux-guidelines #107 (Accessible
 * Authentication, Critical): `autocomplete` is always set and paste is never
 * blocked, so password managers and passkeys keep working.
 *
 * The toggle is a real `<button type="button">` with an `aria-label` that
 * describes the action and `aria-pressed` reflecting the current state
 * (ux-guidelines #40, #117). It is 40x40, past the 24px WCAG 2.2 minimum
 * (#104), expands to 44x44 on phones, and sits after the input in DOM order so tab order matches reading
 * order (#41).
 */
export function PasswordInput({
  fieldName = "password",
  ...props
}: Omit<AuthInputProps, "type" | "trailing" | "icon"> & {
  /** Names the field inside the toggle's `aria-label`, so two toggles on the
   *  same page ("password", "password confirmation") aren't indistinguishable
   *  in a screen reader's list of buttons. */
  fieldName?: string;
}) {
  const [visible, setVisible] = React.useState(false);

  return (
    <AuthInput
      {...props}
      icon={Lock}
      type={visible ? "text" : "password"}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={`${visible ? "Hide" : "Show"} ${fieldName}`}
          aria-pressed={visible}
          className="grid size-11 cursor-pointer place-items-center rounded-lg text-text-subtle transition-colors duration-150 ease-standard hover:bg-surface-2 hover:text-text md:size-10"
        >
          {visible ? (
            <EyeOff aria-hidden="true" className="size-4" />
          ) : (
            <Eye aria-hidden="true" className="size-4" />
          )}
        </button>
      }
    />
  );
}

"use client";

import Link from "next/link";
import { ArrowRight, Mail, User } from "lucide-react";
import * as React from "react";

import { AuthField, AuthFormError, AuthInput } from "@/components/auth/auth-field";
import { PasswordInput } from "@/components/auth/password-input";
import {
  PasswordMatch,
  PasswordStrength,
} from "@/components/auth/password-strength";
import { Button } from "@/components/ui/button";
import { login, register } from "@/actions/auth";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation";
import type { ActionError } from "@/lib/result";

/**
 * Register — Name / Email / Password / Confirm Password (spec §1).
 *
 * `register` deliberately does not create a session, so on success this calls
 * `login` with the same credentials; that server action throws a Next redirect,
 * which navigates. The whole thing runs inside one transition, so the button
 * stays in its loading state across both calls.
 *
 * Per-field messages come back in `error.fields`, keyed by the form field name
 * — including `confirmPassword` for the mismatch refinement. Those are still
 * the authority; the live strength meter and match check are guidance on top,
 * not a replacement for server validation.
 */
export function RegisterForm() {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<ActionError | null>(null);

  const [email, setEmail] = React.useState("");
  const [emailTouched, setEmailTouched] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [confirmation, setConfirmation] = React.useState("");
  const [confirmTouched, setConfirmTouched] = React.useState(false);

  const bannerRef = React.useRef<HTMLDivElement>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  const serverFields = error?.fields ?? {};

  const localEmailError =
    emailTouched && email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
      ? "Enter a valid email address"
      : undefined;

  const nameError = serverFields.name;
  const emailError = serverFields.email ?? localEmailError;
  const passwordError = serverFields.password;
  // The live `PasswordMatch` line below owns mismatch feedback, so the field's
  // own error slot only carries what the server said — otherwise a failed
  // submit prints "Passwords do not match" twice, one line apart.
  const confirmError = serverFields.confirmPassword;
  const formError = error && !error.fields ? error.message : undefined;

  // ux-guidelines #109 — focus the first invalid field, else the summary.
  React.useEffect(() => {
    if (!error) return;
    const invalid = formRef.current?.querySelector<HTMLElement>(
      '[aria-invalid="true"]',
    );
    (invalid ?? bannerRef.current)?.focus();
  }, [error]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);

    startTransition(async () => {
      const created = await register({
        name: String(data.get("name") ?? ""),
        email,
        password,
        confirmPassword: confirmation,
      });

      if (!created.ok) {
        setError(created.error);
        return;
      }

      const signedIn = await login({ email, password }, "/tracker");
      if (!signedIn.ok) {
        // The account exists; only the session failed. Send them to sign in.
        setError({
          code: signedIn.error.code,
          message: "Account created, but sign-in failed. Try signing in.",
        });
      }
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      method="post"
      noValidate
      className="auth-rise flex min-w-0 flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-extrabold tracking-[-0.035em] text-text md:text-5xl">
          Make it yours.
        </h1>
        <p className="text-md text-text-muted">
          Create your private workspace and write the first entry.
        </p>
      </div>

      <AuthFormError ref={bannerRef}>{formError}</AuthFormError>

      <div className="flex flex-col gap-2">
        <div>
          <AuthField label="Name" htmlFor="name" error={nameError}>
            <AuthInput
              id="name"
              name="name"
              icon={User}
              autoComplete="name"
              placeholder="Alex Morgan"
              required
              autoFocus
              aria-invalid={Boolean(nameError) || undefined}
              aria-describedby={nameError ? "name-error" : undefined}
            />
          </AuthField>
        </div>

        <div>
          <AuthField label="Email" htmlFor="email" error={emailError}>
            <AuthInput
              id="email"
              name="email"
              type="email"
              inputMode="email"
              icon={Mail}
              autoComplete="email"
              placeholder="you@company.com"
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (serverFields.email) setError(null);
              }}
              onBlur={() => setEmailTouched(true)}
              aria-invalid={Boolean(emailError) || undefined}
              aria-describedby={emailError ? "email-error" : undefined}
            />
          </AuthField>
        </div>

        <div className="flex flex-col gap-3">
          <AuthField
            label="Password"
            htmlFor="password"
            error={passwordError}
            hint={`At least ${PASSWORD_MIN_LENGTH} characters. Mix cases, numbers or symbols.`}
          >
            <PasswordInput
              id="password"
              name="password"
              autoComplete="new-password"
              placeholder="Create a password"
              minLength={PASSWORD_MIN_LENGTH}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={Boolean(passwordError) || undefined}
              aria-describedby={
                passwordError ? "password-error" : "password-hint"
              }
            />
          </AuthField>

          <PasswordStrength value={password} />
        </div>

        <div>
          <AuthField
            label="Confirm password"
            htmlFor="confirmPassword"
            error={confirmError}
          >
            <PasswordInput
              id="confirmPassword"
              name="confirmPassword"
              fieldName="password confirmation"
              autoComplete="new-password"
              placeholder="Repeat your password"
              required
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              onBlur={() => setConfirmTouched(true)}
              aria-invalid={Boolean(confirmError) || undefined}
              aria-describedby={
                confirmError ? "confirmPassword-error" : undefined
              }
            />
          </AuthField>

          {/* Live match feedback, suppressed while the server's own message for
              this field is on screen so the same sentence never appears twice. */}
          {confirmError ? null : (
            <PasswordMatch
              password={password}
              confirmation={confirmation}
              touched={confirmTouched}
            />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Button
          type="submit"
          loading={pending}
          className="auth-cta h-11 w-full rounded-xl bg-primary-strong text-md hover:bg-primary-active"
        >
          {pending ? "Creating account…" : "Create account"}
          {pending ? null : <ArrowRight aria-hidden="true" className="size-4" />}
        </Button>

        <p className="text-center text-base text-text-muted">
          Already have an account?{" "}
          <Link
            href="/login"
            className="rounded-sm font-semibold text-accent-text underline-offset-2 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </form>
  );
}

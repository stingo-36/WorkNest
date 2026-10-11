"use client";

import Link from "next/link";
import { ArrowRight, Mail } from "lucide-react";
import * as React from "react";

import { AuthField, AuthFormError, AuthInput } from "@/components/auth/auth-field";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { login } from "@/actions/auth";
import type { ActionError } from "@/lib/result";

/**
 * Login. Calls the `login` server action directly — on success it throws a
 * Next redirect on the server, which the action call turns into a navigation,
 * so there is no success branch to handle here.
 *
 * The form enters once as a single block. Reduced-motion users get the final
 * state immediately from `(auth)/auth-motion.css`.
 */
export function LoginForm({ callbackUrl, notice }: { callbackUrl?: string; notice?: string }) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<ActionError | null>(null);
  const [emailTouched, setEmailTouched] = React.useState(false);
  const [email, setEmail] = React.useState("");

  const bannerRef = React.useRef<HTMLDivElement>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  const serverFields = error?.fields ?? {};

  // Client-side email check, on blur only (app-interface.csv #16,
  // ux-guidelines #56 — validating every keystroke is noise).
  const localEmailError =
    emailTouched && email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
      ? "Enter a valid email address"
      : undefined;

  const emailError = serverFields.email ?? localEmailError;
  const passwordError = serverFields.password;
  const formError = error && !error.fields ? error.message : undefined;

  // ux-guidelines #109: after a failed submit, move focus to the first invalid
  // field, or to the summary banner when the failure has no owning field.
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
      const result = await login(
        {
          email: String(data.get("email") ?? ""),
          password: String(data.get("password") ?? ""),
        },
        callbackUrl,
      );
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      method="post"
      noValidate
      className="auth-rise flex min-w-0 flex-col gap-4 md:gap-6"
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-extrabold tracking-[-0.035em] text-text md:text-5xl">
          Pick up your day.
        </h1>
        <p className="text-md text-text-muted">
          Your latest work log and its full context are waiting.
        </p>
      </div>

      {/* Credential failures are form-level on purpose — saying which half was
          wrong would let the form be used to enumerate registered emails. */}
      <AuthFormError ref={bannerRef}>{formError}</AuthFormError>
      {notice && !formError ? (
        <div role="status" className="rounded-xl border border-success bg-success-subtle px-3 py-2 text-sm font-semibold text-success">
          {notice}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
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
              autoFocus
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

        <div>
          <AuthField label="Password" htmlFor="password" error={passwordError}>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="current-password"
              placeholder="Your password"
              required
              aria-invalid={Boolean(passwordError) || undefined}
              aria-describedby={passwordError ? "password-error" : undefined}
            />
          </AuthField>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Button
          type="submit"
          loading={pending}
          className="auth-cta h-11 w-full rounded-xl bg-primary-strong text-md hover:bg-primary-active"
        >
          {pending ? "Signing in…" : "Sign in"}
          {pending ? null : <ArrowRight aria-hidden="true" className="size-4" />}
        </Button>

        <p className="text-center text-base text-text-muted">
          New here?{" "}
          <Link
            href="/register"
            className="rounded-sm font-semibold text-accent-text underline-offset-2 hover:underline"
          >
            Create an account
          </Link>
        </p>
      </div>
    </form>
  );
}

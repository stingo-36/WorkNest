"use client";

import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { changePassword } from "@/actions/profile";
import { PasswordMatch, PasswordStrength } from "@/components/auth/password-strength";
import { Button } from "@/components/ui/button";
import { Field, FormError } from "@/components/ui/field";
import { PasswordField } from "@/components/ui/password-field";
import type { ActionError } from "@/lib/result";

export function PasswordSettings() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();
  const fields = error?.fields ?? {};

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await changePassword({ currentPassword, newPassword, confirmPassword });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // authVersion changed, so this JWT is intentionally no longer valid.
      router.replace("/login?passwordChanged=1");
    });
  }

  return (
    <section aria-labelledby="password-settings-title" className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex items-start gap-3 border-b border-border px-5 py-4 md:px-6">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-subtle text-accent-text">
          <KeyRound className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 id="password-settings-title" className="text-xl font-semibold text-text">Password</h2>
          <p className="mt-0.5 text-sm text-text-muted">After saving, every signed-in device must sign in again.</p>
        </div>
      </div>
      <form onSubmit={submit} noValidate className="grid gap-5 px-5 py-5 md:grid-cols-2 md:px-6">
        <div className="md:col-span-2"><FormError>{error && !error.fields ? error.message : undefined}</FormError></div>
        <Field label="Current password" htmlFor="current-password" error={fields.currentPassword} required>
          <PasswordField
            id="current-password"
            fieldLabel="current password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            aria-invalid={Boolean(fields.currentPassword) || undefined}
            aria-describedby={fields.currentPassword ? "current-password-error" : undefined}
            required
          />
        </Field>
        <div className="hidden md:block" aria-hidden="true" />
        <Field label="New password" htmlFor="new-password" error={fields.newPassword} hint="At least 8 characters." required>
          <PasswordField
            id="new-password"
            fieldLabel="new password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            aria-invalid={Boolean(fields.newPassword) || undefined}
            aria-describedby={fields.newPassword ? "new-password-error" : "new-password-hint"}
            required
          />
          <PasswordStrength value={newPassword} />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm-password" error={fields.confirmPassword} required>
          <PasswordField
            id="confirm-password"
            fieldLabel="new password confirmation"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            onBlur={() => setConfirmTouched(true)}
            aria-invalid={Boolean(fields.confirmPassword) || undefined}
            aria-describedby={fields.confirmPassword ? "confirm-password-error" : undefined}
            required
          />
          <PasswordMatch password={newPassword} confirmation={confirmPassword} touched={confirmTouched} />
        </Field>
        <div className="flex justify-end md:col-span-2">
          <Button type="submit" size="lg" loading={pending} disabled={!currentPassword || !newPassword || !confirmPassword}>
            Change password
          </Button>
        </div>
      </form>
    </section>
  );
}

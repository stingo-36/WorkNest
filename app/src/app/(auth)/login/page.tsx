import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { safeCallbackUrl } from "@/components/auth/safe-callback-url";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; passwordChanged?: string }>;
}) {
  // `src/proxy.ts` bounces protected routes here with the original path.
  const [{ callbackUrl, passwordChanged }, user] = await Promise.all([
    searchParams,
    getCurrentUser(),
  ]);
  if (user) redirect(user.role === "Admin" ? "/admin" : "/tracker");

  return (
    <AuthShell variant="login">
      <LoginForm
        callbackUrl={callbackUrl ? safeCallbackUrl(callbackUrl) : undefined}
        notice={passwordChanged === "1" ? "Password changed. Sign in with your new password." : undefined}
      />
    </AuthShell>
  );
}

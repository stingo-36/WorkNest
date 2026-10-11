"use server";

import { AuthError } from "next-auth";

import { prisma } from "@/lib/prisma";
import { hashPassword, signIn, signOut } from "@/lib/auth";
import { loginSchema, registerSchema } from "@/lib/validation";
import { ActionResult, fail, ok, parseOrFail } from "@/lib/result";

/**
 * `redirect()` works by throwing. Detect it by digest rather than deep-importing
 * `next/dist/...`, so a Next patch release can't silently break sign-in.
 */
function isRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

/**
 * Server-side redirect boundary. The callback URL originates in the browser,
 * so the action must not rely on client-side sanitisation alone.
 */
function safeRedirectPath(raw: string, fallback: string): string {
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  return raw;
}

/**
 * Register. Name / Email / Password / Confirm Password, Zod-validated,
 * duplicate email rejected, password bcrypt-hashed at cost 12.
 *
 * Does not sign the user in — the UI should call `login` afterwards (or
 * redirect to /login) so there is exactly one place that creates a session.
 */
export async function register(
  input: unknown,
): Promise<ActionResult<{ id: string; email: string }>> {
  const parsed = parseOrFail(registerSchema, input);
  if (!parsed.ok) return parsed;

  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    return fail("CONFLICT", "An account with that email already exists", {
      email: "An account with that email already exists",
    });
  }

  try {
    const user = await prisma.user.create({
      data: { name, email, passwordHash: await hashPassword(password) },
      select: { id: true, email: true },
    });
    return ok(user);
  } catch {
    // Unique index race — someone registered the same email in between.
    return fail("CONFLICT", "An account with that email already exists", {
      email: "An account with that email already exists",
    });
  }
}

/**
 * Sign in with credentials. On success NextAuth redirects to `redirectTo`,
 * which throws a Next redirect — we let that propagate.
 */
export async function login(
  input: unknown,
  redirectTo?: string,
): Promise<ActionResult<never>> {
  const parsed = parseOrFail(loginSchema, input);
  if (!parsed.ok) return parsed;

  // A direct sign-in lands administrators in their control centre. Explicit
  // same-origin callback URLs still win (for example, after auth expiry).
  const account = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { role: true },
  });
  const defaultDestination = account?.role === "Admin" ? "/admin" : "/tracker";
  const destination = redirectTo
    ? safeRedirectPath(redirectTo, defaultDestination)
    : defaultDestination;

  try {
    await signIn("credentials", {
      ...parsed.data,
      redirectTo: destination,
    });
    return ok(undefined as never);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof AuthError) {
      return fail("UNAUTHORIZED", "Incorrect email or password");
    }
    throw error;
  }
}

export async function logout(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}

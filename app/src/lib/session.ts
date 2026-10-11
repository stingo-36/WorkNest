import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";

import type { Session } from "next-auth";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type SessionUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: "User" | "Admin";
};

/**
 * The session user, or null. Memoised per request so a page that calls it from
 * five different server components still hits the session once.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  // `auth()` THROWS when the session cookie cannot be decrypted — e.g. it was
  // encrypted with a different AUTH_SECRET, or it is truncated/corrupt. That is
  // not an error condition for us: it means "not signed in". Letting it throw
  // bricks the browser permanently, because the thrown error escapes the layout
  // that called it, so the user cannot even reach /login to get a fresh cookie.
  // Treat a bad cookie as no cookie; signing in overwrites it and self-heals.
  let session: Session | null = null;
  try {
    session = await auth();
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[session] ignoring unreadable session cookie:",
        error instanceof Error ? error.message : error,
      );
    }
    return null;
  }
  const sessionUser = session?.user;
  if (!sessionUser?.id) return null;
  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      authVersion: true,
    },
  });
  // Account deletion and administrator password resets invalidate the JWT on
  // its next request. Older JWTs predate authVersion and represent version 0.
  if (!user || user.authVersion !== (sessionUser.authVersion ?? 0)) return null;
  return {
    id: user.id,
    name: user.name ?? null,
    email: user.email ?? null,
    image: user.image ?? null,
    role: user.role,
  };
});

/**
 * The gate. EVERY server action and every query must start here.
 * Redirects to /login when there is no session, so callers can assume a user.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Same as requireUser but returns just the id — the common case. */
export async function requireUserId(): Promise<string> {
  return (await requireUser()).id;
}

import NextAuth from "next-auth";
import type { DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";
import { loginSchema } from "@/lib/validation";

/** bcrypt cost factor. */
export const BCRYPT_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

declare module "next-auth" {
  interface Session {
    user: { id: string; authVersion: number } & DefaultSession["user"];
  }

  interface User {
    authVersion?: number;
  }
}

/**
 * A pre-computed hash we compare against when the email is unknown, so a
 * missing account costs the same wall-clock time as a wrong password and the
 * login form cannot be used to enumerate registered emails.
 */
const DUMMY_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEeO1SDKzmQ2t0gVcgdYeLHzmtE4jQ2Nz9C";

/**
 * Email + password → the account, or null. Shared by the web sign-in and the
 * phone link (`/api/mobile/connect`), so both get the same timing protection.
 */
export async function checkCredentials(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      passwordHash: true,
      authVersion: true,
    },
  });

  if (!user?.passwordHash) {
    await bcrypt.compare(password, DUMMY_HASH);
    return null;
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    authVersion: user.authVersion,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(rawCredentials) {
        const parsed = loginSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;
        return checkCredentials(parsed.data.email, parsed.data.password);
      },
    }),
  ],
});

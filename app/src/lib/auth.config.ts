import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe half of the auth config.
 *
 * `middleware.ts` runs on the edge runtime, where Prisma and bcrypt cannot
 * load. So the route-protection logic lives here with NO providers and NO
 * adapter; `src/lib/auth.ts` spreads this and adds the Node-only pieces.
 */

/**
 * Routes reachable without a session. Everything else is protected.
 *
 * `"/"` is the PUBLIC MARKETING HOMEPAGE (`app/(marketing)/page.tsx`), not the
 * workspace. Signed-in visitors are NOT bounced off `/`; they see the
 * marketing page and click through to Work Logs themselves.
 *
 * Note the matcher below is safe for `"/"`: it matches `pathname === "/"`
 * exactly, and the subtree test becomes `startsWith("//")`, which no real
 * pathname satisfies.
 */
/** `/banner` is a public design page (`app/banner/page.tsx`) — no session data. */
export const PUBLIC_ROUTES = ["/", "/login", "/register"] as const;

export function isPublicPath(pathname: string): boolean {
  if (pathname.startsWith("/api/auth")) return true;
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export const authConfig = {
  pages: {
    signIn: "/login",
    newUser: "/register",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  trustHost: true,
  providers: [],
  callbacks: {
    /**
     * Used by `middleware.ts`. Returning false sends the visitor to
     * `pages.signIn` with a callbackUrl; returning a Response redirects.
     */
    authorized({ auth, request }) {
      const loggedIn = Boolean(auth?.user?.id);
      const { pathname } = request.nextUrl;

      if (isPublicPath(pathname)) return true;

      return loggedIn;
    },

    jwt({ token, user }) {
      if (user) {
        const versionedToken = token as typeof token & { userId?: string; authVersion?: number };
        versionedToken.userId = user.id as string;
        token.name = user.name ?? null;
        token.email = user.email ?? null;
        versionedToken.authVersion = (user as { authVersion?: number }).authVersion ?? 0;
      }
      return token;
    },

    session({ session, token }) {
      if (session.user) {
        const versionedToken = token as typeof token & { userId?: string; authVersion?: number };
        session.user.id = versionedToken.userId ?? token.sub ?? "";
        session.user.authVersion = versionedToken.authVersion ?? 0;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

export default authConfig;

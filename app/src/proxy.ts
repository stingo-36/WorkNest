import NextAuth from "next-auth";
import type { NextRequest } from "next/server";

import { authConfig } from "@/lib/auth.config";

/**
 * Route protection. Next 16 renamed `middleware.ts` to `proxy.ts` (nodejs
 * runtime, no longer edge).
 *
 * It uses the Prisma-free half of the auth config: sessions are JWTs, so the
 * cookie alone answers "is this request signed in?" without a DB round trip on
 * every navigation.
 *
 * The `authorized` callback in auth.config.ts decides what is public — see
 * `PUBLIC_ROUTES` there: `/` (marketing), `/login`, `/register` and
 * `/api/auth/*`. Everything else, `/dashboard` included, requires a session.
 */
const { auth } = NextAuth(authConfig);

/** Cookie names Auth.js v5 uses for the session token. */
const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

/**
 * Wraps the auth middleware to CLEAR an unreadable session cookie.
 *
 * Auth.js throws `JWTSessionError: no matching decryption secret` when the
 * cookie cannot be decrypted — typically because it was encrypted with a
 * different AUTH_SECRET, or it is truncated. It then degrades to "signed out",
 * which is correct, but the browser keeps sending the same dead cookie on
 * every request: the error repeats forever and the log fills with stack traces.
 *
 * If we end up treating the request as signed out while a session cookie is
 * still present, that cookie is useless — so delete it. The next request is
 * clean and signing in issues a fresh one. Without this, a user whose cookie
 * predates a secret change has to clear site data by hand to recover.
 */
export default async function proxy(request: NextRequest) {
  const response = await (auth as unknown as (
    req: NextRequest,
  ) => Promise<Response | undefined>)(request);

  const res = response ?? new Response(null, { status: 200 });
  const hadCookie = SESSION_COOKIES.some((name) => request.cookies.has(name));

  if (hadCookie) {
    // `auth` already ran; if the cookie were valid the request would carry a
    // usable session. A redirect to /login here means it did not.
    const location = res.headers.get("location") ?? "";
    const bouncedToLogin = location.includes("/login");
    if (bouncedToLogin) {
      const cleared = new Response(res.body, res);
      for (const name of SESSION_COOKIES) {
        cleared.headers.append(
          "set-cookie",
          `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
        );
      }
      return cleared;
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except:
     *  - /api/auth/*   sign in / sign out / session endpoints
     *  - _next/*       build output and HMR
     *  - static asset file extensions and favicon
     *  - the installable-app files (manifest, service worker, offline page):
     *    the browser fetches them signed out too, e.g. installing from /login
     */
    "/((?!api/auth|_next/static|_next/image|_next/webpack-hmr|favicon.ico|manifest.webmanifest|sw.js|offline.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|woff2?)$).*)",
  ],
};

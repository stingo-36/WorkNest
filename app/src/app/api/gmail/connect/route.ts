import { randomBytes } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { gmailAuthUrl, gmailConfigured } from "@/lib/gmail";
import { getCurrentUser } from "@/lib/session";

// Route files may only export handlers; callback/route.ts repeats this name.
const STATE_COOKIE = "wn_gmail_state";

/** Profile → Connect Gmail: send the signed-in user to Google's consent screen (read-only Gmail). */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (!gmailConfigured()) return NextResponse.redirect(new URL("/profile?section=gmail&gmail=not-configured", request.url));

  // A random state, echoed back by Google and checked against this cookie, blocks forged callbacks.
  const state = randomBytes(24).toString("base64url");
  const response = NextResponse.redirect(gmailAuthUrl(state, new URL("/api/gmail/callback", request.url).toString()));
  response.cookies.set(STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", path: "/api/gmail", maxAge: 600 });
  return response;
}

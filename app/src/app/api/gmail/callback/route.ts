import { NextResponse, type NextRequest } from "next/server";

import { connectGmail, syncGmail } from "@/lib/gmail";
import { getCurrentUser } from "@/lib/session";

const STATE_COOKIE = "wn_gmail_state";

/** Google sends the user back here after consent. Stores the connection, runs a first import. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const back = (result: string) => {
    const response = NextResponse.redirect(new URL(`/profile?section=gmail&gmail=${result}`, request.url));
    response.cookies.delete({ name: STATE_COOKIE, path: "/api/gmail" });
    return response;
  };

  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (searchParams.get("error") || !code) return back("cancelled");
  if (!state || state !== request.cookies.get(STATE_COOKIE)?.value) return back("failed");

  try {
    await connectGmail(user.id, code, new URL("/api/gmail/callback", request.url).toString());
  } catch {
    return back("failed");
  }
  // First import right away, so the Drupal type fills without waiting a day. A failure here is shown on the card.
  await syncGmail(user.id).catch(() => undefined);
  return back("connected");
}

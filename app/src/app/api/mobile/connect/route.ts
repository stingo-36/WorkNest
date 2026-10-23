import { checkCredentials } from "@/lib/auth";
import { createMobileToken, mobileJson, preflight } from "@/lib/mobile-api";
import { loginSchema } from "@/lib/validation";

/**
 * Link the Pulse mobile app to a WorkNest account. Takes the email and
 * password once and returns a phone token for the Tracker and Resources; the
 * phone stores the token, never the password. Sets no cookie, so the phone
 * gets the phone API and nothing more.
 */
export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return mobileJson({ error: "Enter your WorkNest email and password" }, 400);

  let user;
  try {
    user = await checkCredentials(parsed.data.email, parsed.data.password);
  } catch {
    return mobileJson({ error: "WorkNest is unavailable right now. Try again shortly." }, 503);
  }
  if (!user) return mobileJson({ error: "Wrong WorkNest email or password" }, 401);

  return mobileJson({ token: createMobileToken(user.id, user.authVersion), email: user.email, name: user.name });
}

export function OPTIONS() {
  return preflight();
}

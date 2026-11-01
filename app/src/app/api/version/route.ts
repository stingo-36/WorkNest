/**
 * The deploy id this server was built with. The installed app compares it with
 * the id in its own bundle and refreshes when they differ (pwa-provider.tsx).
 * Public on purpose — it carries no user data — and never cached.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { version: process.env.NEXT_PUBLIC_APP_VERSION ?? "local" },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

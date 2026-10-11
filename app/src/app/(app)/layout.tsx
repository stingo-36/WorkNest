
import { AppShell } from "@/components/shell/app-shell";
import { MuiProvider } from "@/components/ui/mui-provider";
import { requireUser } from "@/lib/session";
import { getUserSettings } from "@/lib/user-settings";

/**
 * Authenticated layout. `requireUser()` redirects to /login when there is no
 * session, so everything below this can assume a user.
 *
 * Navigation is the pill across the top (`shell/app-nav.tsx`). There is no
 * sidebar and therefore no collapsed-rail cookie to read any more.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  // Name and feature switches come from the Profile page (the session only
  // carries what was true at sign-in).
  const settings = await getUserSettings(user.id);

  return (
    <MuiProvider>
    <AppShell
      user={{
        id: user.id,
        name: settings.name ?? user.name,
        email: user.email,
        ticketsEnabled: settings.ticketsEnabled,
        isAdmin: settings.isAdmin,
      }}
    >
      {children}
    </AppShell>
    </MuiProvider>
  );
}

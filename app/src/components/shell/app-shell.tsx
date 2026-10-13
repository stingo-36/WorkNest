import type { ReactNode } from "react";

import { InstallAppDialog } from "@/components/pwa/install-app";
import { QuickLogProvider } from "@/components/quick-log/quick-log";
import { AppNav, type ShellUser } from "@/components/shell/app-nav";
import { PageMotion } from "@/components/shell/page-motion";
/**
 * The authenticated frame: a full-width top navigation bar and content well.
 *
 * Layout contract (design.md §8):
 *   360   five nav items: icon over label; Favourites moves into the account menu
 *   768   nav items: icon beside label, account at the bar's end
 *   1440  content capped at 1360px, the extra width becomes gutter
 */
export function AppShell({
  user,
  children,
}: {
  user: ShellUser;
  children: ReactNode;
}) {
  return (
    <>
      <a
        href="#main"
        className="sr-only rounded-md bg-primary-strong px-3 py-2 text-sm font-semibold text-primary-fg focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to content
      </a>

      {/* `min-w-0` so a wide table inside can scroll itself instead of
          stretching the page — design.md §8 forbids horizontal body scroll. */}
      <div className="app-shell flex min-h-dvh w-full min-w-0 flex-col overflow-x-clip bg-bg text-text">
        {/* Inside .app-shell so the dialog gets the workspace palette. */}
        <QuickLogProvider ticketsEnabled={user.ticketsEnabled}>
          <AppNav user={user} />

          <main
            id="main"
            className="min-w-0 flex-1 overflow-x-clip px-4 py-5 md:px-5 md:py-6 lg:px-8"
          >
            <div className="mx-auto w-full max-w-[85rem]">
              <PageMotion>{children}</PageMotion>
            </div>
          </main>
          <InstallAppDialog />
        </QuickLogProvider>
      </div>
    </>
  );
}

export type { ShellUser };

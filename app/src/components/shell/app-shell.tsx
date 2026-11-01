import type { ReactNode } from "react";

import { AskWidget } from "@/components/ask/ask-widget";
import { InstallAppDialog } from "@/components/pwa/install-app";
import { QuickLogProvider } from "@/components/quick-log/quick-log";
import { AppDeskBar, AppNav, type ShellUser } from "@/components/shell/app-nav";
import { PageMotion } from "@/components/shell/page-motion";
/**
 * The authenticated frame (Ocean shell, 2026-11-01): sidebar + content well.
 *
 * Layout contract (Design-System.md §6):
 *   < 1024  slim top header, content, fixed bottom tab bar (five sections max;
 *           Favourites moves into the account menu)
 *   ≥ 1024  sticky 15.5rem sidebar beside the content
 *   1440+   content capped at 1360px, the extra width becomes gutter
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
      <div className="app-shell flex min-h-dvh w-full min-w-0 flex-col overflow-x-clip bg-bg text-text lg:flex-row">
        {/* Inside .app-shell so the dialog gets the workspace palette. */}
        <QuickLogProvider ticketsEnabled={user.ticketsEnabled}>
          <AppNav user={user} />

          <div className="flex min-w-0 flex-1 flex-col">
            <AppDeskBar user={user} />
            <main
              id="main"
              className="min-w-0 flex-1 overflow-x-clip px-4 py-5 md:px-6 md:py-6 lg:px-10"
            >
              <div className="mx-auto w-full max-w-[85rem]">
                <PageMotion>{children}</PageMotion>
              </div>
            </main>
          </div>
          <InstallAppDialog />
          <AskWidget userId={user.id} />
        </QuickLogProvider>
      </div>
    </>
  );
}

export type { ShellUser };

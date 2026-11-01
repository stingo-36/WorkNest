"use client";

import { Award, ChevronRight, ChevronsUpDown, FileText, LibraryBig, ListChecks, LogOut, NotebookPen, Plus, ShieldCheck, Sparkles, Star, Ticket, UserRound, Zap } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { logout } from "@/actions/auth";
import { cn } from "@/components/cn";
import { openAsk } from "@/components/ask/ask-widget";
import { InstallAppMenuItem } from "@/components/pwa/install-app";
import { useQuickLog } from "@/components/quick-log/quick-log";
import { Menu, MenuSeparator, menuItemClass } from "@/components/shell/menu";
import { isActivePath, navFor, type NavItem } from "@/components/shell/nav-items";

export type ShellUser = {
  id: string;
  name: string | null;
  email: string | null;
  /** Profile setting: hides the Tickets section when off. */
  ticketsEnabled: boolean;
  /** Account role: exposes the separately guarded admin dashboard link. */
  isAdmin: boolean;
};

/** Account pages, listed under "You" in the sidebar (Ocean shell, 2026-11-01). */
const ACCOUNT_NAV: NavItem[] = [
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/achievements", label: "Achievements", icon: Award },
  { href: "/profile", label: "Profile & settings", icon: UserRound },
];
const ADMIN_NAV: NavItem = { href: "/admin", label: "Admin", icon: ShieldCheck };

/**
 * The authenticated navigation (Ocean shell, 2026-11-01).
 *
 *   < 1024  a slim top header (brand, account menu — which also lists Tickets,
 *           Resources, Favourites and the account pages) + a bottom tab bar:
 *           Tracker · Work Logs · Quick log (raised) · Notes · Ask
 *   ≥ 1024  a sticky left sidebar (brand, Quick log, Workspace, You, account)
 *           and a top bar over the content (`AppDeskBar`: where you are, Ask)
 */
export function AppNav({ user }: { user: ShellUser }) {
  const pathname = usePathname();
  const sections = navFor(user.ticketsEnabled);
  const account = user.isAdmin ? [...ACCOUNT_NAV, ADMIN_NAV] : ACCOUNT_NAV;

  return (
    <>
      <aside id="app-dock" aria-label="Sidebar" className="app-side max-lg:hidden">
        <Link href="/tracker" className="app-brand px-2">
          <span className="app-mark" aria-hidden="true">W</span>
          WorkNest
        </Link>
        <QuickLogSideButton />
        <nav aria-label="Sections" className="flex flex-col gap-5">
          <SideGroup label="Workspace" items={sections} pathname={pathname} />
          <SideGroup label="You" items={account} pathname={pathname} />
        </nav>
        <div className="mt-auto">
          <AccountMenu user={user} side="top" variant="card" />
        </div>
      </aside>

      <header className="app-topbar lg:hidden">
        <Link href="/tracker" className="app-brand">
          <span className="app-mark" aria-hidden="true">W</span>
          <span className="max-xs:sr-only">WorkNest</span>
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <AccountMenu user={user} side="bottom" variant="avatar" />
        </div>
      </header>

      <nav aria-label="Sections" className="app-tabbar lg:hidden">
        <ul className="mx-auto flex w-full max-w-xl items-stretch">
          <TabLink item={TAB_TRACKER} pathname={pathname} />
          <TabLink item={TAB_LOGS} pathname={pathname} />
          <li className="min-w-0 flex-1"><QuickLogTab /></li>
          <TabLink item={TAB_NOTES} pathname={pathname} />
          <li className="min-w-0 flex-1">
            <button type="button" onClick={openAsk} className="app-tab w-full">
              <Sparkles aria-hidden="true" />
              <span>Ask</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}

const TAB_TRACKER: NavItem = { href: "/tracker", label: "Tracker", icon: ListChecks };
const TAB_LOGS: NavItem = { href: "/work-logs", label: "Logs", icon: NotebookPen };
const TAB_NOTES: NavItem = { href: "/notes", label: "Notes", icon: FileText };

function TabLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActivePath(pathname, item);
  return (
    <li className="min-w-0 flex-1">
      <Link href={item.href} aria-current={active ? "page" : undefined} className="app-tab">
        <item.icon aria-hidden="true" />
        <span className="max-w-full truncate">{item.label}</span>
      </Link>
    </li>
  );
}

/** The raised + in the middle of the phone tab bar. */
function QuickLogTab() {
  const { open } = useQuickLog();
  return (
    <button type="button" onClick={() => open()} aria-label="Quick log" title="Quick log — paste your notes" className="app-tab app-tab-raise w-full">
      <span className="app-tab-plus"><Plus aria-hidden="true" /></span>
    </button>
  );
}

/** Where the open page sits in the app, for the desktop top bar. */
const PAGE_LABELS: Array<[RegExp, string]> = [
  [/^\/work-logs\/[^/]+\/edit$/, "Edit log"],
  [/^\/work-logs\/[^/]+$/, "Log"],
  [/^\/notes\/new$/, "New notebook"],
  [/^\/notes\/[^/]+\/edit$/, "Edit notebook"],
  [/^\/notes\/[^/]+$/, "Notebook"],
];

/** The desktop top bar (≥ 1024): where you are on the left, Ask on the right. */
export function AppDeskBar({ user }: { user: ShellUser }) {
  const pathname = usePathname();
  const all = [...navFor(user.ticketsEnabled), ...ACCOUNT_NAV, ADMIN_NAV];
  const section = all.find((item) => isActivePath(pathname, item));
  const sub = PAGE_LABELS.find(([pattern]) => pattern.test(pathname))?.[1];

  return (
    <div className="app-deskbar">
      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-2 text-sm">
        {section ? (
          <>
            {sub ? <Link href={section.href} className="truncate text-text-muted hover:text-text">{section.label}</Link> : <span className="truncate font-semibold text-text" aria-current="page">{section.label}</span>}
            {sub ? <><ChevronRight className="size-3.5 shrink-0 text-text-subtle" aria-hidden="true" /><span className="truncate font-semibold text-text" aria-current="page">{sub}</span></> : null}
          </>
        ) : null}
      </nav>
      <button type="button" onClick={openAsk} className="app-desk-ask">
        <Sparkles aria-hidden="true" />
        Ask
      </button>
    </div>
  );
}

function SideGroup({ label, items, pathname }: { label: string; items: NavItem[]; pathname: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="app-side-label">{label}</p>
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => {
          const active = isActivePath(pathname, item);
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={active ? "page" : undefined} className="app-side-link">
                <item.icon aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function QuickLogSideButton() {
  const { open } = useQuickLog();
  return (
    <button type="button" onClick={() => open()} className="app-quicklog" title="Quick log — paste your notes">
      <Zap aria-hidden="true" />
      Quick log
    </button>
  );
}

function AccountMenu({ user, side, variant }: { user: ShellUser; side: "top" | "bottom"; variant: "card" | "avatar" }) {
  return (
    <Menu
      label="Account"
      side={side}
      align={variant === "card" ? "start" : "end"}
      className={variant === "card" ? "w-full" : undefined}
      trigger={(props) =>
        variant === "card" ? (
          <button {...props} type="button" aria-label="Account menu" className="app-account-card">
            <Avatar name={user.name} email={user.email} />
            <span className="flex min-w-0 flex-1 flex-col text-left">
              <span className="truncate text-sm font-semibold text-text">{user.name ?? "Signed in"}</span>
              {user.email ? <span className="truncate text-xs text-text-subtle">{user.email}</span> : null}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-text-subtle" aria-hidden="true" />
          </button>
        ) : (
          <button {...props} type="button" aria-label="Account menu" className="app-icon-btn">
            <Avatar name={user.name} email={user.email} />
          </button>
        )
      }
    >
      <div className="px-2 pt-1 pb-2">
        <p className="truncate text-sm font-semibold text-text">{user.name ?? "Signed in"}</p>
        {user.email ? <p className="truncate text-xs text-text-subtle">{user.email}</p> : null}
      </div>

      <MenuSeparator />

      {/* The sidebar already lists these on desktop; the phone/tablet header needs them here. */}
      <div className={cn(variant === "card" && "hidden")}>
        {user.isAdmin ? (
          <Link href="/admin" role="menuitem" className={menuItemClass}>
            <ShieldCheck aria-hidden="true" />
            Admin dashboard
          </Link>
        ) : null}
        <Link href="/profile" role="menuitem" className={menuItemClass}>
          <UserRound aria-hidden="true" />
          Profile &amp; settings
        </Link>
        <Link href="/reports" role="menuitem" className={menuItemClass}>
          <FileText aria-hidden="true" />
          Reports
        </Link>
        {user.ticketsEnabled ? (
          <Link href="/tickets" role="menuitem" className={menuItemClass}>
            <Ticket aria-hidden="true" />
            Tickets
          </Link>
        ) : null}
        <Link href="/resources" role="menuitem" className={menuItemClass}>
          <LibraryBig aria-hidden="true" />
          Resources
        </Link>
        <Link href="/favourites" role="menuitem" className={menuItemClass}>
          <Star aria-hidden="true" />
          Favourites
        </Link>
        <Link href="/achievements" role="menuitem" className={menuItemClass}>
          <Award aria-hidden="true" />
          Achievements
        </Link>
      </div>

      <InstallAppMenuItem />

      <form action={logout}>
        <button type="submit" role="menuitem" className={menuItemClass}>
          <LogOut aria-hidden="true" />
          Log out
        </button>
      </form>
    </Menu>
  );
}

/** Initials avatar. No image uploads in this build, so no `<img>` fallback dance. */
function Avatar({ name, email }: { name: string | null; email: string | null }) {
  const source = (name ?? email ?? "?").trim();
  const initials =
    source
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "?";

  return (
    <span aria-hidden="true" className="app-avatar">
      {initials}
    </span>
  );
}

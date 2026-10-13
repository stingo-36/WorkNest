"use client";

import { Award, FileText, LogOut, ShieldCheck, Star, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { logout } from "@/actions/auth";
import { cn } from "@/components/cn";
import { InstallAppMenuItem } from "@/components/pwa/install-app";
import { Menu, MenuSeparator, menuItemClass } from "@/components/shell/menu";
import { isActivePath, navFor } from "@/components/shell/nav-items";

export type ShellUser = {
  id: string;
  name: string | null;
  email: string | null;
  /** Profile setting: hides the Tickets section when off. */
  ticketsEnabled: boolean;
  /** Account role: exposes the separately guarded admin dashboard link. */
  isAdmin: boolean;
};

/** The authenticated navigation: a full-width sticky bar above every screen. */
export function AppNav({ user }: { user: ShellUser }) {
  const pathname = usePathname();
  const sections = navFor(user.ticketsEnabled);

  return (
    <nav id="app-dock" aria-label="Sections" className="app-dock">
      <div className="mx-auto flex w-full max-w-[85rem] items-center gap-1 px-1 md:px-4 lg:px-8">
        <ul className="flex min-w-0 flex-1 items-center md:gap-1">
          {sections.map((item) => {
            const active = isActivePath(pathname, item);
            return (
              <li key={item.href} className={cn("min-w-0 flex-auto md:flex-none", item.href === "/favourites" && "max-md:hidden")}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "app-dock-link flex h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-full px-0.5 whitespace-nowrap md:h-12 md:flex-row md:gap-2 md:px-4 md:text-md",
                    "transition-[background-color,color,transform] duration-200 ease-smooth-out active:scale-[0.97]",
                    active
                      ? "bg-sidebar-accent-bg font-semibold text-sidebar-accent"
                      : "font-medium text-sidebar-muted hover:bg-sidebar-2 hover:text-sidebar-fg",
                  )}
                >
                  <item.icon className="size-5 shrink-0 md:size-4" aria-hidden="true" />
                  <span className="max-w-full truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <span aria-hidden="true" className="h-7 w-px shrink-0 bg-sidebar-border" />
        <AccountMenu user={user} side="bottom" />
      </div>
    </nav>
  );
}

function AccountMenu({ user, side }: { user: ShellUser; side: "top" | "bottom" }) {
  return (
    <Menu
      label="Account"
      side={side}
      trigger={(props) => (
        <button
          {...props}
          type="button"
          aria-label="Account menu"
          className="grid size-12 cursor-pointer place-items-center rounded-full transition-colors duration-150 ease-standard hover:bg-sidebar-2 active:bg-sidebar-3"
        >
          <Avatar name={user.name} email={user.email} />
          
        </button>
      )}
    >
      <div className="px-2 pt-1 pb-2">
        <p className="truncate text-sm font-semibold text-text">
          {user.name ?? "Signed in"}
        </p>
        {user.email ? (
          <p className="truncate text-xs text-text-subtle">{user.email}</p>
        ) : null}
      </div>

      <MenuSeparator />

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

      <Link href="/favourites" role="menuitem" className={cn(menuItemClass, "md:hidden")}>
        <Star aria-hidden="true" />
        Favourites
      </Link>

      <Link href="/achievements" role="menuitem" className={menuItemClass}>
        <Award aria-hidden="true" />
        Achievements
      </Link>

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
    <span
      aria-hidden="true"
      className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-fg ring-2 ring-sidebar-border"
    >
      {initials}
    </span>
  );
}

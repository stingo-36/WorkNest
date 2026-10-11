import {
  LibraryBig,
  FileText,
  ListChecks,
  NotebookPen,
  Star,
  Ticket,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Exact items match only their own route; subtree items match detail pages too. */
  exact?: boolean;
};

/** The focused build exposes only the active workspace tools. */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/work-logs", label: "Work Logs", icon: NotebookPen },
  { href: "/tickets", label: "Tickets", icon: Ticket },
  { href: "/tracker", label: "Tracker", icon: ListChecks },
  { href: "/notes", label: "Notes", icon: FileText },
  { href: "/resources", label: "Resources", icon: LibraryBig },
  { href: "/favourites", label: "Favourites", icon: Star },
];

/** Sections for this user: Tickets only when tickets are switched on in Profile. */
export function navFor(ticketsEnabled: boolean): NavItem[] {
  return ticketsEnabled ? PRIMARY_NAV : PRIMARY_NAV.filter((item) => item.href !== "/tickets");
}

export function isActivePath(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

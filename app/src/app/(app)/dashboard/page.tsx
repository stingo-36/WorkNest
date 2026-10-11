import { redirect } from "next/navigation";

/** The dashboard was retired (2026-09-25); old links and bookmarks land on the Tracker. */
export default function DashboardPage() {
  redirect("/tracker");
}

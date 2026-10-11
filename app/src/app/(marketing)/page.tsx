import type { Metadata } from "next";

import { HomePage } from "@/components/home/home-page";

import "../brand-art.css";
import "./home.css";

export const metadata: Metadata = {
  title: { absolute: "WorkNest — Keep it all in one place" },
  description: "Work logs, to-dos, notes and resources in one quiet workspace, with AI summaries of your days and 5-15 reports for your sprints.",
};

export default function Page() {
  return <HomePage />;
}

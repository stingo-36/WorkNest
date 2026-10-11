import { format } from "date-fns";

import { ReportView } from "@/components/reports/report-view";
import { getAiSettings } from "@/lib/ai-settings";
import { getSprintReport, listReportSprints, resolveSprint } from "@/lib/reports";
import { requireUser } from "@/lib/session";
import { getUserSettings } from "@/lib/user-settings";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ sprint?: string }> }) {
  const [{ sprint: sprintParam }, user] = await Promise.all([searchParams, requireUser()]);
  const settings = await getUserSettings(user.id);
  const sprint = resolveSprint(sprintParam, settings.sprint);
  const [sprints, { report, stale }, ai] = await Promise.all([
    listReportSprints(user.id, settings.sprint),
    getSprintReport(user.id, sprint.start, sprint.end),
    getAiSettings(user.id),
  ]);

  return (
    <ReportView
      sprintKey={sprint.key}
      sprints={sprints.map((s) => ({
        key: s.key,
        label: `${format(s.start, "d MMM")} – ${format(s.end, "d MMM yyyy")}${s.current ? " (current)" : ""}`,
        logCount: s.logCount,
        hasReport: s.hasReport,
      }))}
      report={report ? { content: report.content, model: report.model, generatedAt: report.generatedAt.toISOString() } : null}
      stale={stale}
      aiOn={ai.keySource !== null}
    />
  );
}

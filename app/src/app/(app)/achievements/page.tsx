import { AchievementsBoard } from "@/components/achievements/achievements-board";
import { listAchievements } from "@/lib/achievements";
import { requireUserId } from "@/lib/session";
import { formatDateKey } from "@/lib/worklogs";

export const metadata = { title: "Achievements" };

export default async function AchievementsPage() {
  const userId = await requireUserId();
  const achievements = await listAchievements(userId);

  return (
    <AchievementsBoard
      initial={achievements.map((item) => ({
        ...item,
        startDate: item.startDate ? formatDateKey(item.startDate) : "",
        endDate: item.endDate ? formatDateKey(item.endDate) : "",
        files: item.files.map(({ id, name, size }) => ({ id, name, size })),
      }))}
    />
  );
}

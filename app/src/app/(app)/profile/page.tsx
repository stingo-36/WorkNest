import { format } from "date-fns";

import { ProfileForm } from "@/components/profile/profile-form";
import { getAiSettings } from "@/lib/ai-settings";
import { requireUser } from "@/lib/session";
import { SPRINT_CYCLE_ANCHOR } from "@/lib/sprint";
import { getOrderedListState, getResourceTypeIcons, listProjectOptions, listTagUsage } from "@/lib/user-lists";
import { getUserSettings } from "@/lib/user-settings";

export const metadata = { title: "Profile" };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const [{ section }, user] = await Promise.all([searchParams, requireUser()]);
  const [settings, channels, resourceTypes, meetings, projects, noteTags, resourceTags, resourceTypeIcons, ai] = await Promise.all([
    getUserSettings(user.id),
    getOrderedListState(user.id, "FollowUpChannel"),
    getOrderedListState(user.id, "ResourceType"),
    getOrderedListState(user.id, "DefaultMeeting"),
    listProjectOptions(user.id),
    listTagUsage(user.id, "NoteTag"),
    listTagUsage(user.id, "ResourceTag"),
    getResourceTypeIcons(user.id),
    getAiSettings(user.id),
  ]);

  return (
    <ProfileForm
      email={user.email ?? ""}
      initial={{
        name: settings.name ?? "",
        sprintStartDate: settings.sprintStartKey ?? format(SPRINT_CYCLE_ANCHOR, "yyyy-MM-dd"),
        sprintLengthDays: settings.sprint.days,
        ticketsEnabled: settings.ticketsEnabled,
      }}
      lists={{ channels, resourceTypes, resourceTypeIcons, meetings, projects, noteTags, resourceTags }}
      ai={ai}
      initialSection={section}
    />
  );
}

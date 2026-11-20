import { after } from "next/server";

import { listResources } from "@/actions/content";
import { ResourceLibrary } from "@/components/resources/resource-library";
import { getGmailStatus, latestGmailImport, syncGmail } from "@/lib/gmail";
import { requireUserId } from "@/lib/session";
import { getOrderedList, getResourceTypeIcons, getSavedTags } from "@/lib/user-lists";

export const metadata = { title: "Resources" };

export default async function ResourcesPage() {
  const userId = await requireUserId();
  const [result, types, typeIcons, savedTags, gmail] = await Promise.all([
    listResources(),
    getOrderedList(userId, "ResourceType"),
    getResourceTypeIcons(userId),
    getSavedTags(userId, "ResourceTag"),
    getGmailStatus(userId),
  ]);
  // Gmail import runs after the page is sent (at most every six hours), so the page
  // never waits on Google; what it adds shows on the next visit.
  if (gmail.email) after(() => syncGmail(userId, { onlyIfStale: true }).catch(() => undefined));
  const latest = gmail.email ? await latestGmailImport(userId) : null;

  return (
    <ResourceLibrary
      resources={result.ok ? result.data.map(toItem) : []}
      types={types}
      typeIcons={typeIcons}
      savedTags={savedTags}
      gmailType={gmail.email ? gmail.resourceType : null}
      gmailLatest={latest ? { messageId: latest.messageId, added: latest.added } : null}
      loadError={result.ok ? undefined : result.error.message}
    />
  );
}

function toItem<T extends { createdAt: Date; updatedAt: Date }>(resource: T) {
  return { ...resource, createdAt: resource.createdAt.toISOString(), updatedAt: resource.updatedAt.toISOString() };
}

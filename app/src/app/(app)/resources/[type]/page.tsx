import { notFound } from "next/navigation";
import { after } from "next/server";

import { ResourceTypeView } from "@/components/resources/resource-type-view";
import { listResources } from "@/lib/content";
import { getGmailStatus, latestGmailImport, syncGmail } from "@/lib/gmail";
import { orderTypes, resourceTypeKey, typeMeta } from "@/lib/resource-types";
import { requireUserId } from "@/lib/session";
import { getOrderedList, getResourceTypeIcons, getSavedTags } from "@/lib/user-lists";

type Props = { params: Promise<{ type: string }>; searchParams: Promise<{ q?: string }> };

export async function generateMetadata({ params }: Props) {
  const { type } = await params;
  // The slug is lower-case ("drupal"); capitalise it for the tab.
  const name = decodeURIComponent(type);
  return { title: `${typeMeta(name.charAt(0).toUpperCase() + name.slice(1)).plural} · Resources` };
}

/** One resource type. The slug is the type's key, so "Website" and "Websites" land on one page. */
export default async function ResourceTypePage({ params, searchParams }: Props) {
  const [{ type: slug }, { q }, userId] = await Promise.all([params, searchParams, requireUserId()]);
  const key = decodeURIComponent(slug).toLowerCase();
  const [all, typeList, typeIcons, savedTags, gmail] = await Promise.all([
    listResources(userId, undefined, undefined, 1000),
    getOrderedList(userId, "ResourceType"),
    getResourceTypeIcons(userId),
    getSavedTags(userId, "ResourceTag"),
    getGmailStatus(userId),
  ]);
  const items = all.map((resource) => ({ ...resource, createdAt: resource.createdAt.toISOString(), updatedAt: resource.updatedAt.toISOString() }));
  const type = orderTypes(typeList, items).find((candidate) => resourceTypeKey(candidate) === key);
  if (!type) notFound();

  const fillsThisType = Boolean(gmail.email) && resourceTypeKey(gmail.resourceType) === key;
  if (fillsThisType) after(() => syncGmail(userId, { onlyIfStale: true }).catch(() => undefined));

  return (
    <ResourceTypeView
      type={type}
      resources={items.filter((resource) => resourceTypeKey(resource.type) === key).sort((a, b) => b.createdAt.localeCompare(a.createdAt))}
      typeList={typeList}
      typeIcons={typeIcons}
      savedTags={savedTags}
      gmail={fillsThisType ? { label: gmail.label, lastSyncAt: gmail.lastSyncAt, latest: await latestGmailImport(userId) } : null}
      initialQuery={q ?? ""}
    />
  );
}

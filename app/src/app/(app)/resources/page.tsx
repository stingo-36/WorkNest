import { listResources } from "@/actions/content";
import { ResourceLibrary } from "@/components/resources/resource-library";
import { requireUserId } from "@/lib/session";
import { getOrderedList, getResourceTypeIcons, getSavedTags } from "@/lib/user-lists";

export const metadata = { title: "Resources" };

export default async function ResourcesPage() {
  const userId = await requireUserId();
  const [result, types, typeIcons, savedTags] = await Promise.all([
    listResources(),
    getOrderedList(userId, "ResourceType"),
    getResourceTypeIcons(userId),
    getSavedTags(userId, "ResourceTag"),
  ]);

  return (
    <ResourceLibrary
      resources={result.ok ? result.data.map((resource) => ({
        ...resource,
        createdAt: resource.createdAt.toISOString(),
        updatedAt: resource.updatedAt.toISOString(),
      })) : []}
      types={types}
      typeIcons={typeIcons}
      savedTags={savedTags}
      loadError={result.ok ? undefined : result.error.message}
    />
  );
}

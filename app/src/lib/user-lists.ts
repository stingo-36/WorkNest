import "server-only";

import { EntryKind, UserListKind } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

/**
 * The lists a user edits on the Profile page — every dropdown's options plus
 * the two tag vocabularies. One `UserList` row per (user, kind).
 *
 * Two shapes:
 *  - **Ordered option lists** (channels, resource types, default meetings):
 *    no row → the built-in defaults below; a row (even an empty one) wins.
 *  - **Derived lists** (projects, note tags, resource tags): what's in use on
 *    tickets / notes / resources, plus `values` added ahead of use. Projects
 *    also keep `hidden` — names still on tickets but no longer suggested.
 *
 * Removing an option never rewrites records that already use it, except tags,
 * where "delete" explicitly means "strip it everywhere".
 */

export const DEFAULT_LISTS = {
  FollowUpChannel: ["Slack", "Email", "Call", "Meeting", "Teams", "In person", "Other"],
  ResourceType: ["Website", "App", "Link", "Tool", "Command", "Documentation", "Snippet", "Reference", "Learning", "Other"],
  DefaultMeeting: ["ASU Sync-up", "Veritech Sync-up", "Client Sync-up"],
} as const satisfies Partial<Record<UserListKind, readonly string[]>>;

export type OrderedListKind = keyof typeof DEFAULT_LISTS;
export type TagListKind = typeof UserListKind.NoteTag | typeof UserListKind.ResourceTag;

/** Trim, collapse spaces, drop blanks and case-insensitive duplicates. */
export function cleanValues(values: string[], max = 50) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim().replace(/\s+/g, " ").slice(0, 60);
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    out.push(value);
  }
  return out.slice(0, max);
}

/** Same rule as resource/note tags: lowercase, no "#", spaces → dashes. */
export function normalizeTag(raw: string) {
  return raw.trim().replace(/^#+/, "").trim().toLowerCase().replace(/\s+/g, "-").slice(0, 40);
}

async function getRow(userId: string, kind: UserListKind) {
  return prisma.userList.findUnique({ where: { userId_kind: { userId, kind } } });
}

async function saveRow(userId: string, kind: UserListKind, data: { values?: string[]; hidden?: string[] }) {
  return prisma.userList.upsert({
    where: { userId_kind: { userId, kind } },
    create: { userId, kind, values: data.values ?? [], hidden: data.hidden ?? [] },
    update: data,
  });
}

// --- ordered option lists ------------------------------------------------------

export async function getOrderedList(userId: string, kind: OrderedListKind): Promise<string[]> {
  const row = await getRow(userId, kind);
  return row ? row.values : [...DEFAULT_LISTS[kind]];
}

/** For Profile: the list plus whether the user has changed it from the defaults. */
export async function getOrderedListState(userId: string, kind: OrderedListKind) {
  const row = await getRow(userId, kind);
  const defaults: readonly string[] = DEFAULT_LISTS[kind];
  // A row can exist only to hold resource-type icons; that alone isn't "customised".
  const same = row !== null && row.values.length === defaults.length && row.values.every((value, i) => value === defaults[i]);
  return { values: row ? row.values : [...defaults], customized: Boolean(row) && !same };
}

export async function setOrderedList(userId: string, kind: OrderedListKind, values: string[]) {
  const row = await saveRow(userId, kind, { values: cleanValues(values) });
  return row.values;
}

/** Back to the built-in defaults: deleting the row is exactly that. */
export async function resetOrderedList(userId: string, kind: OrderedListKind) {
  // Back to the built-in options, but keep any icons picked for them.
  await prisma.userList.updateMany({ where: { userId, kind }, data: { values: [...DEFAULT_LISTS[kind]] } });
  return [...DEFAULT_LISTS[kind]];
}

// --- projects --------------------------------------------------------------------

export type ProjectOption = { name: string; tickets: number; saved: boolean };

/** Everything the Profile shows: in-use names (with counts) and saved ones, minus hidden. */
export async function listProjectOptions(userId: string): Promise<ProjectOption[]> {
  const [row, counts] = await Promise.all([
    getRow(userId, UserListKind.Project),
    prisma.ticket.groupBy({ by: ["projectName"], where: { userId, projectName: { not: null } }, _count: true }),
  ]);
  const hidden = new Set((row?.hidden ?? []).map((name) => name.toLowerCase()));
  const byName = new Map<string, ProjectOption>();
  for (const { projectName, _count } of counts) {
    const name = projectName?.trim();
    if (!name || hidden.has(name.toLowerCase())) continue;
    const key = name.toLowerCase();
    const current = byName.get(key);
    byName.set(key, { name: current?.name ?? name, tickets: (current?.tickets ?? 0) + _count, saved: false });
  }
  for (const name of row?.values ?? []) {
    const key = name.toLowerCase();
    const current = byName.get(key);
    byName.set(key, { name: current?.name ?? name, tickets: current?.tickets ?? 0, saved: true });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** What the project autocomplete suggests. */
export async function listProjectSuggestions(userId: string) {
  return (await listProjectOptions(userId)).map((option) => option.name);
}

export async function addProject(userId: string, name: string) {
  const row = await getRow(userId, UserListKind.Project);
  const key = name.toLowerCase();
  await saveRow(userId, UserListKind.Project, {
    values: cleanValues([...(row?.values ?? []), name], 500),
    hidden: (row?.hidden ?? []).filter((item) => item.toLowerCase() !== key),
  });
}

/** Stop suggesting a project. Tickets keep their project name. */
export async function removeProject(userId: string, name: string) {
  const row = await getRow(userId, UserListKind.Project);
  const key = name.toLowerCase();
  await saveRow(userId, UserListKind.Project, {
    values: (row?.values ?? []).filter((item) => item.toLowerCase() !== key),
    hidden: cleanValues([...(row?.hidden ?? []), name], 500),
  });
}

// --- tags --------------------------------------------------------------------------

export type TagUsage = { tag: string; count: number };

/** Every tag in use (with how many items carry it) plus saved-but-unused ones. */
export async function listTagUsage(userId: string, kind: TagListKind): Promise<TagUsage[]> {
  const [row, items] = await Promise.all([
    getRow(userId, kind),
    kind === UserListKind.NoteTag
      ? prisma.followUp.findMany({ where: { userId, kind: EntryKind.Note }, select: { tags: true } })
      : prisma.resource.findMany({ where: { userId }, select: { tags: true } }),
  ]);
  const counts = new Map<string, number>();
  for (const { tags } of items) for (const tag of tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  for (const tag of row?.values ?? []) if (!counts.has(tag)) counts.set(tag, 0);
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Saved tags only — merged into the tag field's suggestions. */
export async function getSavedTags(userId: string, kind: TagListKind) {
  return (await getRow(userId, kind))?.values ?? [];
}

export async function addTag(userId: string, kind: TagListKind, raw: string) {
  const tag = normalizeTag(raw);
  if (!tag) return;
  const row = await getRow(userId, kind);
  await saveRow(userId, kind, { values: Array.from(new Set([...(row?.values ?? []), tag])).slice(0, 200) });
}

/**
 * Rename everywhere. If an item already has `to`, it ends up with one copy.
 * Raw SQL so it's one statement per table, always scoped by userId.
 */
export async function renameTag(userId: string, kind: TagListKind, fromRaw: string, toRaw: string) {
  const from = normalizeTag(fromRaw);
  const to = normalizeTag(toRaw);
  if (!from || !to || from === to) return;
  if (kind === UserListKind.NoteTag) {
    await prisma.$executeRaw`
      UPDATE "FollowUp"
      SET "tags" = array_replace("tags", ${from}, ${to})
      WHERE "userId" = ${userId} AND "kind" = 'Note' AND ${from} = ANY("tags")`;
    await prisma.$executeRaw`
      UPDATE "FollowUp" SET "tags" = ARRAY(SELECT DISTINCT unnest("tags"))
      WHERE "userId" = ${userId} AND "kind" = 'Note' AND ${to} = ANY("tags")`;
  } else {
    await prisma.$executeRaw`
      UPDATE "Resource"
      SET "tags" = array_replace("tags", ${from}, ${to})
      WHERE "userId" = ${userId} AND ${from} = ANY("tags")`;
    await prisma.$executeRaw`
      UPDATE "Resource" SET "tags" = ARRAY(SELECT DISTINCT unnest("tags"))
      WHERE "userId" = ${userId} AND ${to} = ANY("tags")`;
  }
  const row = await getRow(userId, kind);
  if (row) {
    await saveRow(userId, kind, {
      values: Array.from(new Set(row.values.map((tag) => (tag === from ? to : tag)))),
    });
  }
}

/** Remove a tag from every note / resource that has it, and from the saved list. */
export async function deleteTag(userId: string, kind: TagListKind, raw: string) {
  const tag = normalizeTag(raw);
  if (!tag) return;
  if (kind === UserListKind.NoteTag) {
    await prisma.$executeRaw`
      UPDATE "FollowUp" SET "tags" = array_remove("tags", ${tag})
      WHERE "userId" = ${userId} AND "kind" = 'Note' AND ${tag} = ANY("tags")`;
  } else {
    await prisma.$executeRaw`
      UPDATE "Resource" SET "tags" = array_remove("tags", ${tag})
      WHERE "userId" = ${userId} AND ${tag} = ANY("tags")`;
  }
  const row = await getRow(userId, kind);
  if (row) await saveRow(userId, kind, { values: row.values.filter((item) => item !== tag) });
}

/** Profile → Resource types: the icon picked for each type, as "library:Name". */
export async function getResourceTypeIcons(userId: string): Promise<Record<string, string>> {
  const row = await getRow(userId, UserListKind.ResourceType);
  const icons = row?.icons;
  if (!icons || typeof icons !== "object" || Array.isArray(icons)) return {};
  return Object.fromEntries(Object.entries(icons).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

/**
 * Pick (or clear, with null) one type's icon. Creating the row would freeze
 * the built-in type list as "customised", so with no row yet the current
 * defaults are written alongside — the list itself doesn't change.
 */
export async function setResourceTypeIcon(userId: string, type: string, icon: string | null) {
  const current = await getResourceTypeIcons(userId);
  const next = { ...current };
  if (icon) next[type] = icon;
  else delete next[type];
  await prisma.userList.upsert({
    where: { userId_kind: { userId, kind: UserListKind.ResourceType } },
    create: { userId, kind: UserListKind.ResourceType, values: [...DEFAULT_LISTS.ResourceType], icons: next },
    update: { icons: next },
  });
  return next;
}

/** Strips every tag of this kind from every note / resource, and drops the saved suggestions. */
export async function deleteAllTags(userId: string, kind: TagListKind) {
  if (kind === UserListKind.NoteTag) {
    await prisma.$executeRaw`
      UPDATE "FollowUp" SET "tags" = '{}'
      WHERE "userId" = ${userId} AND "kind" = 'Note' AND cardinality("tags") > 0`;
  } else {
    await prisma.$executeRaw`
      UPDATE "Resource" SET "tags" = '{}'
      WHERE "userId" = ${userId} AND cardinality("tags") > 0`;
  }
  const row = await getRow(userId, kind);
  if (row) await saveRow(userId, kind, { values: [] });
}

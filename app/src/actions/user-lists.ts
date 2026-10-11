"use server";

import { revalidatePath } from "next/cache";

import { ok, parseOrFail } from "@/lib/result";
import { requireUserId } from "@/lib/session";
import * as lists from "@/lib/user-lists";
import {
  projectNameSchema,
  renameTagSchema,
  resetOrderedListSchema,
  setOrderedListSchema,
  setResourceTypeIconSchema,
  tagKindSchema,
  tagSchema,
} from "@/lib/validation";

/**
 * Profile → Dropdown lists and Tags. Every list saves immediately (no Save
 * button), so each action revalidates the pages that read that list.
 */

const PAGES_FOR = {
  FollowUpChannel: ["/tracker"],
  ResourceType: ["/resources"],
  DefaultMeeting: ["/work-logs"],
  Project: ["/tickets", "/work-logs"],
  NoteTag: ["/tracker"],
  ResourceTag: ["/resources"],
} as const;

function revalidate(kind: keyof typeof PAGES_FOR) {
  revalidatePath("/profile");
  for (const path of PAGES_FOR[kind]) revalidatePath(path);
}

export async function setOrderedList(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(setOrderedListSchema, input);
  if (!parsed.ok) return parsed;
  const values = await lists.setOrderedList(userId, parsed.data.kind, parsed.data.values);
  revalidate(parsed.data.kind);
  return ok(values);
}

export async function resetOrderedList(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(resetOrderedListSchema, input);
  if (!parsed.ok) return parsed;
  const values = await lists.resetOrderedList(userId, parsed.data.kind);
  revalidate(parsed.data.kind);
  return ok(values);
}

export async function addProject(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(projectNameSchema, input);
  if (!parsed.ok) return parsed;
  await lists.addProject(userId, parsed.data.name);
  revalidate("Project");
  return ok(await lists.listProjectOptions(userId));
}

/** Stops suggesting a project; tickets keep their project name. */
export async function removeProject(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(projectNameSchema, input);
  if (!parsed.ok) return parsed;
  await lists.removeProject(userId, parsed.data.name);
  revalidate("Project");
  return ok(await lists.listProjectOptions(userId));
}

export async function addTag(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(tagSchema, input);
  if (!parsed.ok) return parsed;
  await lists.addTag(userId, parsed.data.kind, parsed.data.tag);
  revalidate(parsed.data.kind);
  return ok(await lists.listTagUsage(userId, parsed.data.kind));
}

export async function renameTag(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(renameTagSchema, input);
  if (!parsed.ok) return parsed;
  await lists.renameTag(userId, parsed.data.kind, parsed.data.from, parsed.data.to);
  revalidate(parsed.data.kind);
  return ok(await lists.listTagUsage(userId, parsed.data.kind));
}

/** Removes the tag from every note / resource that has it. */
export async function deleteTag(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(tagSchema, input);
  if (!parsed.ok) return parsed;
  await lists.deleteTag(userId, parsed.data.kind, parsed.data.tag);
  revalidate(parsed.data.kind);
  return ok(await lists.listTagUsage(userId, parsed.data.kind));
}

/** Profile → Resource types: set or clear the icon for one type. */
export async function setResourceTypeIcon(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(setResourceTypeIconSchema, input);
  if (!parsed.ok) return parsed;
  const icons = await lists.setResourceTypeIcon(userId, parsed.data.type, parsed.data.icon);
  revalidate("ResourceType");
  return ok(icons);
}

/** Removes every tag of this kind from every note / resource that has one. */
export async function deleteAllTags(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(tagKindSchema, input);
  if (!parsed.ok) return parsed;
  await lists.deleteAllTags(userId, parsed.data.kind);
  revalidate(parsed.data.kind);
  return ok(await lists.listTagUsage(userId, parsed.data.kind));
}

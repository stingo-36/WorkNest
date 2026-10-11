"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { notFound, ok, parseOrFail } from "@/lib/result";
import * as content from "@/lib/content";
import {
  createLinkSchema,
  createResourceSchema,
  createTaskSchema,
  deleteLinkSchema,
  deleteResourceSchema,
  deleteTaskSchema,
  toggleResourceFavoriteSchema,
  updateLinkSchema,
  updateResourceSchema,
  updateTaskSchema,
} from "@/lib/validation";

/**
 * Tasks / Notes / Links / Resources server actions.
 * Lean on purpose — the work log + ticket flow is where the logic lives.
 */

// --- tasks ------------------------------------------------------------------

export async function createTask(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(createTaskSchema, input);
  if (!parsed.ok) return parsed;

  const task = await content.createTask(userId, parsed.data);
  revalidatePath("/tasks");
  return ok(task);
}

export async function updateTask(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(updateTaskSchema, input);
  if (!parsed.ok) return parsed;

  const { taskId, ...data } = parsed.data;
  const task = await content.updateTask(userId, taskId, data);
  if (!task) return notFound("Task not found");

  revalidatePath("/tasks");
  return ok(task);
}

export async function deleteTask(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(deleteTaskSchema, input);
  if (!parsed.ok) return parsed;

  const removed = await content.deleteTask(userId, parsed.data.taskId);
  if (!removed) return notFound("Task not found");

  revalidatePath("/tasks");
  return ok({ deleted: true });
}

export async function listTasks(view: content.TaskView = "all") {
  const userId = await requireUserId();
  return ok(await content.listTasks(userId, view));
}

// --- links ------------------------------------------------------------------

export async function createLink(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(createLinkSchema, input);
  if (!parsed.ok) return parsed;

  const link = await content.createLink(userId, parsed.data);
  revalidatePath("/links");
  return ok(link);
}

export async function updateLink(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(updateLinkSchema, input);
  if (!parsed.ok) return parsed;

  const { linkId, ...data } = parsed.data;
  const link = await content.updateLink(userId, linkId, data);
  if (!link) return notFound("Link not found");

  revalidatePath("/links");
  return ok(link);
}

export async function deleteLink(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(deleteLinkSchema, input);
  if (!parsed.ok) return parsed;

  const removed = await content.deleteLink(userId, parsed.data.linkId);
  if (!removed) return notFound("Link not found");

  revalidatePath("/links");
  return ok({ deleted: true });
}

export async function listLinks(search?: string) {
  const userId = await requireUserId();
  return ok(await content.listLinks(userId, search?.trim() || undefined));
}

// --- resources --------------------------------------------------------------

export async function createResource(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(createResourceSchema, input);
  if (!parsed.ok) return parsed;

  const resource = await content.createResource(userId, parsed.data);
  revalidatePath("/resources");
  return ok(resource);
}

export async function updateResource(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(updateResourceSchema, input);
  if (!parsed.ok) return parsed;

  const { resourceId, ...data } = parsed.data;
  const resource = await content.updateResource(userId, resourceId, data);
  if (!resource) return notFound("Resource not found");

  revalidatePath("/resources");
  return ok(resource);
}

export async function deleteResource(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(deleteResourceSchema, input);
  if (!parsed.ok) return parsed;

  const removed = await content.deleteResource(userId, parsed.data.resourceId);
  if (!removed) return notFound("Resource not found");

  revalidatePath("/resources");
  return ok({ deleted: true });
}

/** Star / unstar a resource — starred ones appear on the Favourites page. */
export async function toggleResourceFavorite(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(toggleResourceFavoriteSchema, input);
  if (!parsed.ok) return parsed;

  const result = await prisma.resource.updateMany({
    where: { id: parsed.data.resourceId, userId },
    data: { favorite: parsed.data.favorite },
  });
  if (result.count === 0) return notFound("Resource not found");

  revalidatePath("/resources");
  revalidatePath("/favourites");
  return ok({ favorite: parsed.data.favorite });
}

export async function listResources(search?: string, type?: string) {
  const userId = await requireUserId();
  return ok(
    await content.listResources(userId, search?.trim() || undefined, type),
  );
}

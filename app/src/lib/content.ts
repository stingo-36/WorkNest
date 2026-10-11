import "server-only";

import { prisma } from "@/lib/prisma";
import {
  TaskPriority,
  TaskStatus,
} from "@/generated/prisma/enums";

/**
 * Tasks / Notes / Links / Resources — deliberately lean CRUD.
 * The work log + ticket flow is the interesting part; this is scaffolding.
 *
 * Same rule as everywhere else: userId is in every WHERE clause, and writes
 * use `updateMany`/`deleteMany` with `{ id, userId }` so a hostile id from the
 * client silently matches zero rows instead of touching someone else's data.
 */

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export type TaskInput = {
  title: string;
  description?: string;
  notes?: string;
  dueDate?: Date | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  /** Ticket.id (cuid) or null. Verified to belong to this user. */
  ticketId?: string | null;
};

/** Returns the ticket id only if this user owns it; otherwise null. */
async function safeTicketId(userId: string, ticketId?: string | null) {
  if (!ticketId) return null;
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, userId },
    select: { id: true },
  });
  return ticket?.id ?? null;
}

export async function createTask(userId: string, input: TaskInput) {
  return prisma.task.create({
    data: {
      userId,
      title: input.title,
      description: input.description ?? "",
      notes: input.notes ?? "",
      dueDate: input.dueDate ?? null,
      priority: input.priority ?? TaskPriority.Medium,
      status: input.status ?? TaskStatus.Todo,
      completedAt: input.status === TaskStatus.Completed ? new Date() : null,
      ticketId: await safeTicketId(userId, input.ticketId),
    },
  });
}

export async function updateTask(
  userId: string,
  taskId: string,
  input: Partial<TaskInput>,
) {
  const existing = await prisma.task.findFirst({
    where: { id: taskId, userId },
    select: { id: true, status: true },
  });
  if (!existing) return null;

  const nextStatus = input.status ?? existing.status;
  const completedAt =
    nextStatus === TaskStatus.Completed
      ? existing.status === TaskStatus.Completed
        ? undefined // already complete — keep the original timestamp
        : new Date()
      : null;

  return prisma.task.update({
    where: { id: taskId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(completedAt !== undefined ? { completedAt } : {}),
      ...(input.ticketId !== undefined
        ? { ticketId: await safeTicketId(userId, input.ticketId) }
        : {}),
    },
  });
}

export async function deleteTask(userId: string, taskId: string) {
  const result = await prisma.task.deleteMany({ where: { id: taskId, userId } });
  return result.count > 0;
}

export type TaskView = "today" | "upcoming" | "completed" | "all";

export async function listTasks(
  userId: string,
  view: TaskView = "all",
  take = 100,
) {
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const where =
    view === "today"
      ? {
          userId,
          status: { not: TaskStatus.Completed },
          dueDate: { lte: endOfToday },
        }
      : view === "upcoming"
        ? {
            userId,
            status: { not: TaskStatus.Completed },
            dueDate: { gt: endOfToday },
          }
        : view === "completed"
          ? { userId, status: TaskStatus.Completed }
          : { userId };

  return prisma.task.findMany({
    where,
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    take,
    include: {
      ticket: { select: { id: true, ticketId: true, title: true, status: true } },
    },
  });
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

export type LinkInput = {
  title: string;
  url: string;
  description?: string;
  category?: string;
  tags?: string[];
};

export async function createLink(userId: string, input: LinkInput) {
  return prisma.link.create({
    data: {
      userId,
      title: input.title,
      url: input.url,
      description: input.description ?? "",
      category: input.category ?? "Other",
      tags: input.tags ?? [],
    },
  });
}

export async function updateLink(
  userId: string,
  linkId: string,
  input: Partial<LinkInput>,
) {
  const result = await prisma.link.updateMany({
    where: { id: linkId, userId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.url !== undefined ? { url: input.url } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
    },
  });
  if (result.count === 0) return null;
  return prisma.link.findFirst({ where: { id: linkId, userId } });
}

export async function deleteLink(userId: string, linkId: string) {
  const result = await prisma.link.deleteMany({ where: { id: linkId, userId } });
  return result.count > 0;
}

export async function listLinks(userId: string, search?: string, take = 200) {
  return prisma.link.findMany({
    where: {
      userId,
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" as const } },
              { description: { contains: search, mode: "insensitive" as const } },
              { category: { contains: search, mode: "insensitive" as const } },
              { tags: { has: search } },
            ],
          }
        : {}),
    },
    orderBy: [{ category: "asc" }, { createdAt: "desc" }],
    take,
  });
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

export type ResourceInput = {
  title: string;
  description?: string;
  type?: string;
  url?: string | null;
  content?: string;
  tags?: string[];
};

export async function createResource(userId: string, input: ResourceInput) {
  return prisma.resource.create({
    data: {
      userId,
      title: input.title,
      description: input.description ?? "",
      type: input.type ?? "Other",
      url: input.url || null,
      content: input.content ?? "",
      tags: input.tags ?? [],
    },
  });
}

export async function updateResource(
  userId: string,
  resourceId: string,
  input: Partial<ResourceInput>,
) {
  const result = await prisma.resource.updateMany({
    where: { id: resourceId, userId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.url !== undefined ? { url: input.url || null } : {}),
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
    },
  });
  if (result.count === 0) return null;
  return prisma.resource.findFirst({ where: { id: resourceId, userId } });
}

export async function deleteResource(userId: string, resourceId: string) {
  const result = await prisma.resource.deleteMany({
    where: { id: resourceId, userId },
  });
  return result.count > 0;
}

export async function listResources(
  userId: string,
  search?: string,
  type?: string,
  take = 200,
) {
  return prisma.resource.findMany({
    where: {
      userId,
      ...(type ? { type } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" as const } },
              { description: { contains: search, mode: "insensitive" as const } },
              { content: { contains: search, mode: "insensitive" as const } },
              { tags: { has: search } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    take,
  });
}


import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { NoteDetail, NoteInput, NoteSummary } from "@/lib/notes";

/**
 * Notes data layer — Note -> Section -> Page (see `lib/notes.ts`).
 *
 * Same house rule as everywhere else: `userId` is in every WHERE clause, and a
 * write scoped by an id from the client is additionally checked against the
 * ids that really belong to that note, so a hostile id matches nothing rather
 * than moving someone else's page into your notebook.
 */

const asJson = (content: unknown) => content as Prisma.InputJsonValue;

const TREE_SELECT = {
  id: true,
  title: true,
  description: true,
  iconName: true,
  iconLibrary: true,
  favorite: true,
  createdAt: true,
  updatedAt: true,
  sections: {
    orderBy: { order: "asc" },
    select: {
      id: true,
      title: true,
      order: true,
      pages: {
        orderBy: { order: "asc" },
        select: { id: true, title: true, content: true, order: true },
      },
    },
  },
} satisfies Prisma.NoteSelect;

/** The list view. Page bodies are never loaded here — they can be huge. */
export async function listNotes(userId: string): Promise<NoteSummary[]> {
  const notes = await prisma.note.findMany({
    where: { userId, deletedAt: null },
    // Favourites first, then most recently touched.
    orderBy: [{ favorite: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      title: true,
      description: true,
      iconName: true,
      iconLibrary: true,
      favorite: true,
      createdAt: true,
      updatedAt: true,
      sections: { orderBy: { order: "asc" }, select: { title: true, _count: { select: { pages: true } } } },
    },
  });

  return notes.map(({ sections, ...note }) => ({
    ...note,
    sectionTitles: sections.map((section) => section.title),
    pageCount: sections.reduce((sum, section) => sum + section._count.pages, 0),
  }));
}

export async function getNote(
  userId: string,
  noteId: string,
): Promise<NoteDetail | null> {
  return prisma.note.findFirst({
    where: { id: noteId, userId, deletedAt: null },
    select: TREE_SELECT,
  });
}

/** Creates the note and its whole tree in one transaction. */
export async function createNote(userId: string, data: NoteInput) {
  return prisma.$transaction(async (tx) => {
    const note = await tx.note.create({
      data: {
        userId,
        title: data.title,
        description: data.description || null,
        iconName: data.iconName || null,
        iconLibrary: data.iconLibrary || null,
      },
      select: { id: true },
    });

    for (const section of data.sections) {
      const created = await tx.noteSection.create({
        data: { noteId: note.id, title: section.title, order: section.order },
        select: { id: true },
      });

      if (section.pages.length === 0) continue;

      await tx.notePage.createMany({
        data: section.pages.map((page) => ({
          sectionId: created.id,
          title: page.title,
          content: asJson(page.content),
          order: page.order,
        })),
      });
    }

    return note.id;
  });
}

/**
 * Replaces the note's tree with what the editor posted.
 *
 * Returns `false` when the note is not this user's. Sections and pages the
 * editor dropped are deleted for good — pages cascade with their section.
 */
export async function updateNote(
  userId: string,
  noteId: string,
  data: NoteInput,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.note.findFirst({
      where: { id: noteId, userId, deletedAt: null },
      select: { id: true, sections: { select: { id: true, pages: { select: { id: true } } } } },
    });
    if (!existing) return false;

    await tx.note.update({
      where: { id: existing.id },
      data: {
        title: data.title,
        description: data.description || null,
        iconName: data.iconName || null,
        iconLibrary: data.iconLibrary || null,
      },
    });

    // Ids the client sent are only honoured if they really belong to this note.
    const ownedSectionIds = new Set(existing.sections.map((s) => s.id));
    const ownedPageIds = new Set(
      existing.sections.flatMap((s) => s.pages.map((p) => p.id)),
    );

    const keptSectionIds = data.sections
      .map((section) => section.id)
      .filter((id): id is string => Boolean(id && ownedSectionIds.has(id)));

    await tx.noteSection.deleteMany({
      where: { noteId: existing.id, id: { notIn: keptSectionIds } },
    });

    for (const section of data.sections) {
      const sectionId =
        section.id && ownedSectionIds.has(section.id) ? section.id : null;

      const saved = sectionId
        ? await tx.noteSection.update({
            where: { id: sectionId },
            data: { title: section.title, order: section.order },
            select: { id: true },
          })
        : await tx.noteSection.create({
            data: {
              noteId: existing.id,
              title: section.title,
              order: section.order,
            },
            select: { id: true },
          });

      const keptPageIds = section.pages
        .map((page) => page.id)
        .filter((id): id is string => Boolean(id && ownedPageIds.has(id)));

      await tx.notePage.deleteMany({
        where: { sectionId: saved.id, id: { notIn: keptPageIds } },
      });

      for (const page of section.pages) {
        const pageId = page.id && ownedPageIds.has(page.id) ? page.id : null;

        if (pageId) {
          // `updateMany` scopes to this section, so a page cannot be stolen.
          const moved = await tx.notePage.updateMany({
            where: { id: pageId, sectionId: saved.id },
            data: {
              title: page.title,
              content: asJson(page.content),
              order: page.order,
            },
          });
          if (moved.count > 0) continue;
        }

        await tx.notePage.create({
          data: {
            sectionId: saved.id,
            title: page.title,
            content: asJson(page.content),
            order: page.order,
          },
        });
      }
    }

    return true;
  });
}

/** Move to trash. Nothing leaves the database here. */
export async function trashNote(userId: string, noteId: string) {
  const result = await prisma.note.updateMany({
    where: { id: noteId, userId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return result.count > 0;
}

export async function restoreNote(userId: string, noteId: string) {
  const result = await prisma.note.updateMany({
    where: { id: noteId, userId, deletedAt: { not: null } },
    data: { deletedAt: null },
  });
  return result.count > 0;
}

export async function toggleFavorite(userId: string, noteId: string) {
  const note = await prisma.note.findFirst({
    where: { id: noteId, userId },
    select: { favorite: true },
  });
  if (!note) return null;

  await prisma.note.updateMany({
    where: { id: noteId, userId },
    data: { favorite: !note.favorite },
  });
  return !note.favorite;
}

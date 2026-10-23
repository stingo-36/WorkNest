import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { FollowUpStatus } from "@/generated/prisma/enums";
import { listResources } from "@/lib/content";
import { getFollowUp, listFollowUpPeople } from "@/lib/follow-ups";
import { prisma } from "@/lib/prisma";
import { isStatusNote } from "@/lib/rich-text";
import { getOrderedList, getSavedTags } from "@/lib/user-lists";

/**
 * The phone link: the Kaizen mobile app reads and adds Tracker entries and
 * Resources through `/api/mobile/*`, and nothing else in WorkNest.
 *
 * Connecting trades the WorkNest email and password for a token once; the
 * phone keeps only the token. It is stateless (an HMAC keyed off AUTH_SECRET)
 * and carries the account's `authVersion`, so an administrator password reset
 * or account deletion cuts the phone off exactly like it ends web sessions.
 * Rotating AUTH_SECRET revokes every phone.
 *
 * Format: `wn1.<userId>.<authVersion>.<base64url signature>`.
 */
// The signed scope keeps its original name so phones linked before Resources joined stay linked.
const SCOPE = "mobile-tracker";

function sign(userId: string, authVersion: number) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required to sign phone tokens");
  return createHmac("sha256", secret).update(`${SCOPE}:${userId}:${authVersion}`).digest("base64url");
}

export function createMobileToken(userId: string, authVersion: number) {
  return `wn1.${userId}.${authVersion}.${sign(userId, authVersion)}`;
}

/** The userId a bearer token belongs to, or null when it is forged, stale or the account is gone. */
export async function verifyMobileToken(request: Request): Promise<string | null> {
  const match = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(\S+)$/i);
  const parts = match?.[1].split(".");
  if (!parts || parts.length !== 4 || parts[0] !== "wn1") return null;
  const [, userId, rawVersion, got] = parts;
  const version = Number(rawVersion);
  if (!userId || !Number.isInteger(version)) return null;

  // Constant-time: these tokens can be guessed at over the network.
  const expected = Buffer.from(sign(userId, version));
  const given = Buffer.from(got);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { authVersion: true } });
  return user && user.authVersion === version ? userId : null;
}

/*
 * Bearer token or a password in the body, never a cookie — so any origin is
 * safe, and the app's web preview (its own origin) needs it.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function mobileJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { ...CORS, "Cache-Control": "no-store" } });
}

export function preflight() {
  return new Response(null, { status: 204, headers: CORS });
}

/** Recently ticked entries stay in the payload a while so a tap on the phone can be undone. */
const KEEP_DONE_MS = 48 * 60 * 60 * 1000;

/**
 * What the phone shows: open to-dos, follow-ups and notes, plus anything
 * completed in the last two days. Dates go out as plain `YYYY-MM-DD`; the
 * phone works out today/upcoming against its own clock.
 */
export async function listMobileTracker(userId: string) {
  const rows = await prisma.followUp.findMany({
    where: {
      userId,
      OR: [
        { status: FollowUpStatus.Open },
        { completedAt: { gte: new Date(Date.now() - KEEP_DONE_MS) } },
      ],
    },
    orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      kind: true,
      person: true,
      subject: true,
      status: true,
      pinned: true,
      personal: true,
      tags: true,
      dueDate: true,
      completedAt: true,
      updatedAt: true,
      updates: {
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        select: { note: true, doc: true, fromThem: true, occurredAt: true },
        take: 5,
      },
    },
  });

  return rows.map(({ updates, dueDate, completedAt, updatedAt, ...entry }) => {
    // "Marked done" / "Reopened" rows are bookkeeping, not something you said.
    const last = updates.find((update) => !isStatusNote(update));
    return {
      ...entry,
      dueDate: dueDate ? dueDate.toISOString().slice(0, 10) : null,
      completedAt: completedAt?.toISOString() ?? null,
      updatedAt: updatedAt.toISOString(),
      lastUpdate: last
        ? { note: last.note.slice(0, 500), fromThem: last.fromThem, occurredAt: last.occurredAt.toISOString() }
        : null,
    };
  });
}

export type MobileEntry = Awaited<ReturnType<typeof listMobileTracker>>[number];

/** How many resources the phone gets; newest first, like the Resources page's default sort. */
const MOBILE_RESOURCES = 200;

/** The phone's Resources: the library plus the user's type list, so saves from the phone use the same types. */
export async function listMobileResources(userId: string) {
  const [rows, types] = await Promise.all([listResources(userId, undefined, undefined, MOBILE_RESOURCES), getOrderedList(userId, "ResourceType")]);
  const resources = rows
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map(({ id, title, description, type, url, tags, favorite, createdAt, updatedAt }) => ({
      id,
      title,
      description,
      type,
      url,
      tags,
      favorite,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    }));
  return { resources, types };
}

export type MobileResource = Awaited<ReturnType<typeof listMobileResources>>["resources"][number];

/** What the phone's add forms offer, same as the Tracker page: channels, people already logged, saved note tags. */
export async function listMobileOptions(userId: string) {
  const [channels, people, noteTags] = await Promise.all([
    getOrderedList(userId, "FollowUpChannel"),
    listFollowUpPeople(userId),
    getSavedTags(userId, "NoteTag"),
  ]);
  return { channels, people, noteTags };
}

/** One entry with its whole history (newest first), for the phone's detail page. Status bookkeeping rows are left out. */
export async function getMobileEntry(userId: string, followUpId: string) {
  const entry = await getFollowUp(userId, followUpId);
  if (!entry) return null;
  const { updates, dueDate, completedAt, createdAt, updatedAt, ...rest } = entry;
  return {
    ...rest,
    dueDate: dueDate ? dueDate.toISOString().slice(0, 10) : null,
    completedAt: completedAt?.toISOString() ?? null,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    updates: updates
      .filter((update) => !isStatusNote(update))
      .map((update) => ({
        id: update.id,
        note: update.note,
        channel: update.channel,
        fromThem: update.fromThem,
        occurredAt: update.occurredAt.toISOString(),
      })),
  };
}

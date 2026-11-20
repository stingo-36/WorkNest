import "server-only";

import { prisma } from "@/lib/prisma";
import { parseDrupalDigest } from "@/lib/drupal-digest";
import { open, seal } from "@/lib/secret-box";

/**
 * Profile → Gmail import. One read-only Gmail account per user; every email
 * under the chosen label (default "Drupal Daily") is read once and each module
 * in it becomes a resource of the chosen type (default "Drupal").
 *
 * Plain fetch against Google's OAuth and Gmail REST endpoints — no SDK. Needs
 * GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (a Google Cloud OAuth "Web" client
 * with the Gmail API enabled); without them the Profile card says it's off.
 */

const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
/** Pages load at most this often trigger a background check. */
const STALE_MS = 6 * 60 * 60 * 1000;
/** Only recent mail; older digests were either imported already or are old news. */
const LOOKBACK = "newer_than:14d";

export function gmailConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function gmailAuthUrl(state: string, redirectUri: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    // offline + consent: Google only returns a refresh token on a fresh consent.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function tokenRequest(body: Record<string, string>) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      ...body,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; error?: string; error_description?: string };
  if (!response.ok || !data.access_token) throw new Error(data.error_description ?? data.error ?? `Google token request failed (${response.status})`);
  return data;
}

async function gmailGet<T>(accessToken: string, path: string): Promise<T> {
  const response = await fetch(`${GMAIL}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Gmail request failed (${response.status})`);
  return response.json() as Promise<T>;
}

/** OAuth callback: swap the code for tokens and store the connection. */
export async function connectGmail(userId: string, code: string, redirectUri: string) {
  const tokens = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri });
  if (!tokens.refresh_token) throw new Error("Google didn't return a refresh token. Remove WorkNest from your Google account's third-party access and connect again.");
  const profile = await gmailGet<{ emailAddress: string }>(tokens.access_token!, "/profile");
  await prisma.gmailConnection.upsert({
    where: { userId },
    create: { userId, email: profile.emailAddress, refreshToken: seal(tokens.refresh_token) },
    update: { email: profile.emailAddress, refreshToken: seal(tokens.refresh_token), lastSyncError: null },
  });
}

export type GmailStatus = {
  configured: boolean;
  email: string | null;
  label: string;
  resourceType: string;
  lastSyncAt: string | null;
  lastSyncError: string | null;
};

export async function getGmailStatus(userId: string): Promise<GmailStatus> {
  const connection = await prisma.gmailConnection.findUnique({ where: { userId } });
  return {
    configured: gmailConfigured(),
    email: connection?.email ?? null,
    label: connection?.label ?? "Drupal Daily",
    resourceType: connection?.resourceType ?? "Drupal",
    lastSyncAt: connection?.lastSyncAt?.toISOString() ?? null,
    lastSyncError: connection?.lastSyncError ?? null,
  };
}

export async function saveGmailRule(userId: string, rule: { label: string; resourceType: string }) {
  const result = await prisma.gmailConnection.updateMany({ where: { userId }, data: rule });
  return result.count > 0;
}

export async function disconnectGmail(userId: string) {
  const connection = await prisma.gmailConnection.findUnique({ where: { userId } });
  if (!connection) return;
  const token = open(connection.refreshToken);
  // Best effort: also revoke on Google's side so the grant doesn't linger.
  if (token) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => undefined);
  await prisma.gmailConnection.delete({ where: { userId } });
}

type GmailPart = { mimeType?: string; body?: { data?: string }; parts?: GmailPart[] };
type GmailMessage = { id: string; payload?: GmailPart & { headers?: Array<{ name: string; value: string }> } };

/** The HTML body (or the plain text if there's no HTML) of a message. */
function messageBody(part: GmailPart | undefined): string {
  const find = (node: GmailPart | undefined, type: string): string | null => {
    if (!node) return null;
    if (node.mimeType === type && node.body?.data) return Buffer.from(node.body.data, "base64url").toString("utf8");
    for (const child of node.parts ?? []) {
      const hit = find(child, type);
      if (hit) return hit;
    }
    return null;
  };
  return find(part, "text/html") ?? find(part, "text/plain")?.replace(/\n/g, "<br>") ?? "";
}

/** Gmail's search names a label with spaces as hyphens: "Drupal Daily" → label:drupal-daily. */
const labelQuery = (label: string) => `label:${label.trim().toLowerCase().replace(/[\s/]+/g, "-")}`;

export type SyncResult = { checked: number; added: number };

/**
 * Read new emails under the label and add their modules. Skips emails already
 * read (GmailImport) and modules already in the library (same URL). With
 * `onlyIfStale`, does nothing when the last check was under six hours ago.
 */
export async function syncGmail(userId: string, { onlyIfStale = false } = {}): Promise<SyncResult | null> {
  if (!gmailConfigured()) return null;
  const connection = await prisma.gmailConnection.findUnique({ where: { userId } });
  if (!connection) return null;
  if (onlyIfStale && connection.lastSyncAt && Date.now() - connection.lastSyncAt.getTime() < STALE_MS) return null;

  try {
    const refreshToken = open(connection.refreshToken);
    if (!refreshToken) throw new Error("The saved Gmail connection can't be read any more. Connect Gmail again.");
    const { access_token: accessToken } = await tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });

    const list = await gmailGet<{ messages?: Array<{ id: string }> }>(accessToken!, `/messages?maxResults=20&q=${encodeURIComponent(`${labelQuery(connection.label)} ${LOOKBACK}`)}`);
    const ids = (list.messages ?? []).map((message) => message.id);
    const seen = new Set((await prisma.gmailImport.findMany({ where: { userId, messageId: { in: ids } }, select: { messageId: true } })).map((row) => row.messageId));

    let added = 0;
    // Oldest first, so the newest email's modules are the newest resources.
    for (const id of ids.filter((messageId) => !seen.has(messageId)).reverse()) {
      const message = await gmailGet<GmailMessage>(accessToken!, `/messages/${id}?format=full`);
      const subject = message.payload?.headers?.find((header) => header.name.toLowerCase() === "subject")?.value ?? "";
      const modules = parseDrupalDigest(messageBody(message.payload));
      const existing = new Set(
        (await prisma.resource.findMany({ where: { userId, url: { in: modules.map((module) => module.url) } }, select: { url: true } })).map((row) => row.url),
      );
      const fresh = modules.filter((module) => !existing.has(module.url));
      await prisma.$transaction([
        ...fresh.map((module) => prisma.resource.create({
          data: {
            userId,
            type: connection.resourceType,
            title: module.title.slice(0, 200),
            url: module.url,
            description: module.description,
            tags: ["drupal"],
            favorite: module.moduleOfTheDay,
            source: "gmail",
            sourceMessageId: id,
          },
        })),
        prisma.gmailImport.create({ data: { userId, messageId: id, subject: subject.slice(0, 300), added: fresh.length } }),
      ]);
      added += fresh.length;
    }

    await prisma.gmailConnection.update({ where: { userId }, data: { lastSyncAt: new Date(), lastSyncError: null } });
    return { checked: ids.length - seen.size, added };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gmail import failed";
    await prisma.gmailConnection.update({ where: { userId }, data: { lastSyncAt: new Date(), lastSyncError: message.slice(0, 300) } });
    throw error;
  }
}

/** The most recent import that added something and wasn't undone — for the "N added · Undo" line. */
export async function latestGmailImport(userId: string) {
  const row = await prisma.gmailImport.findFirst({ where: { userId, undone: false, added: { gt: 0 } }, orderBy: { importedAt: "desc" } });
  return row ? { messageId: row.messageId, added: row.added, importedAt: row.importedAt.toISOString() } : null;
}

/** Remove what one email added. The email stays marked as read, so it isn't imported again. */
export async function undoGmailImport(userId: string, messageId: string) {
  const [removed] = await prisma.$transaction([
    prisma.resource.deleteMany({ where: { userId, source: "gmail", sourceMessageId: messageId } }),
    prisma.gmailImport.updateMany({ where: { userId, messageId }, data: { undone: true } }),
  ]);
  return removed.count;
}

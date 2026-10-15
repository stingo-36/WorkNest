import "server-only";

import { notFound } from "next/navigation";

import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, type ActionResult } from "@/lib/result";
import { requireUser } from "@/lib/session";

export type AdminUserStats = {
  id: string;
  name: string | null;
  email: string;
  role: "User" | "Admin";
  createdAt: Date;
  lastActivityAt: Date | null;
  workLogs: number;
  tickets: number;
  trackerEntries: number;
  openTracker: number;
  notes: number;
  resources: number;
  achievements: number;
  reports: number;
};

export type AdminDashboardData = {
  viewerId: string;
  totals: {
    accounts: number;
    admins: number;
    activeAccounts: number;
    workLogs: number;
    tickets: number;
    trackerEntries: number;
    openTracker: number;
    notes: number;
    resources: number;
    achievements: number;
    reports: number;
  };
  users: AdminUserStats[];
};

/**
 * Admin boundary for cross-account reads. A missing/normal account gets the
 * same response as an unknown route so the privileged surface is not exposed.
 */
export async function requireAdmin() {
  const sessionUser = await requireUser();
  if (sessionUser.role !== "Admin") notFound();
  return sessionUser;
}

/**
 * Cross-account statistics for the admin dashboard. This is the only current
 * application query intentionally not scoped to one userId, and it is guarded
 * by requireAdmin() before any aggregate data is read.
 */
export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const viewer = await requireAdmin();

  const [accounts, openTrackerCounts] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ createdAt: "asc" }, { email: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        _count: {
          select: {
            workLogs: true,
            tickets: true,
            followUps: true,
            notes: { where: { deletedAt: null } },
            resources: true,
            achievements: true,
            sprintReports: true,
          },
        },
        workLogs: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: { updatedAt: true },
        },
        tickets: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: { updatedAt: true },
        },
        followUps: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: { updatedAt: true },
        },
        notes: {
          where: { deletedAt: null },
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: { updatedAt: true },
        },
        resources: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: { updatedAt: true },
        },
        achievements: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: { updatedAt: true },
        },
      },
    }),
    prisma.followUp.groupBy({
      by: ["userId"],
      where: { status: "Open" },
      _count: { _all: true },
    }),
  ]);

  const openTrackerByUser = new Map(
    openTrackerCounts.map((row) => [row.userId, row._count._all]),
  );

  const users = accounts.map<AdminUserStats>((account) => {
    const counts = account._count;
    const latest = [
      account.workLogs[0]?.updatedAt,
      account.tickets[0]?.updatedAt,
      account.followUps[0]?.updatedAt,
      account.notes[0]?.updatedAt,
      account.resources[0]?.updatedAt,
      account.achievements[0]?.updatedAt,
    ].filter((value): value is Date => Boolean(value));

    return {
      id: account.id,
      name: account.name,
      email: account.email,
      role: account.role,
      createdAt: account.createdAt,
      lastActivityAt: latest.length
        ? new Date(Math.max(...latest.map((value) => value.getTime())))
        : null,
      workLogs: counts.workLogs,
      tickets: counts.tickets,
      trackerEntries: counts.followUps,
      openTracker: openTrackerByUser.get(account.id) ?? 0,
      notes: counts.notes,
      resources: counts.resources,
      achievements: counts.achievements,
      reports: counts.sprintReports,
    };
  });

  const sum = (field: keyof Pick<
    AdminUserStats,
    | "workLogs"
    | "tickets"
    | "trackerEntries"
    | "openTracker"
    | "notes"
    | "resources"
    | "achievements"
    | "reports"
  >) => users.reduce((total, user) => total + user[field], 0);

  return {
    viewerId: viewer.id,
    totals: {
      accounts: users.length,
      admins: users.filter((user) => user.role === "Admin").length,
      activeAccounts: users.filter(
        (user) =>
          user.workLogs +
            user.tickets +
            user.trackerEntries +
            user.notes +
            user.resources +
            user.achievements +
            user.reports >
          0,
      ).length,
      workLogs: sum("workLogs"),
      tickets: sum("tickets"),
      trackerEntries: sum("trackerEntries"),
      openTracker: sum("openTracker"),
      notes: sum("notes"),
      resources: sum("resources"),
      achievements: sum("achievements"),
      reports: sum("reports"),
    },
    users,
  };
}

async function confirmedTarget(userId: string, confirmationEmail: string) {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true },
  });
  if (!target) return fail("NOT_FOUND", "That account no longer exists");
  if (target.email.toLowerCase() !== confirmationEmail.toLowerCase()) {
    return fail("VALIDATION_ERROR", "The email does not match this account", {
      confirmationEmail: "Type the account email exactly",
    });
  }
  return ok(target);
}

/** Set a new password for another account and revoke every existing JWT. */
export async function resetAccountPassword(
  adminId: string,
  userId: string,
  newPassword: string,
): Promise<ActionResult<{ reset: true }>> {
  if (adminId === userId) {
    return fail("CONFLICT", "Change your own password from Profile & settings");
  }
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!target) return fail("NOT_FOUND", "That account no longer exists");
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(newPassword),
      authVersion: { increment: 1 },
    },
  });
  return ok({ reset: true });
}

/** Delete all workspace content while retaining the account and its settings. */
export async function deleteAccountRecords(
  userId: string,
  confirmationEmail: string,
): Promise<ActionResult<{ deleted: true }>> {
  const confirmed = await confirmedTarget(userId, confirmationEmail);
  if (!confirmed.ok) return confirmed;

  await prisma.$transaction([
    prisma.sprintReport.deleteMany({ where: { userId } }),
    prisma.achievement.deleteMany({ where: { userId } }),
    prisma.resource.deleteMany({ where: { userId } }),
    prisma.link.deleteMany({ where: { userId } }),
    prisma.task.deleteMany({ where: { userId } }),
    prisma.followUp.deleteMany({ where: { userId } }),
    // Uploads not yet in a saved update have no entry to cascade from.
    prisma.followUpFile.deleteMany({ where: { userId } }),
    prisma.note.deleteMany({ where: { userId } }),
    prisma.ticket.deleteMany({ where: { userId } }),
    prisma.workLog.deleteMany({ where: { userId } }),
  ]);
  return ok({ deleted: true });
}

/** Delete one account; cascading relations remove every record and auth row. */
export async function deleteAccount(
  adminId: string,
  userId: string,
  confirmationEmail: string,
): Promise<ActionResult<{ deleted: true }>> {
  if (adminId === userId) {
    return fail("CONFLICT", "You cannot delete the account you are currently using");
  }
  const confirmed = await confirmedTarget(userId, confirmationEmail);
  if (!confirmed.ok) return confirmed;

  if (confirmed.data.role === "Admin") {
    const adminCount = await prisma.user.count({ where: { role: "Admin" } });
    if (adminCount <= 1) return fail("CONFLICT", "WorkNest must keep at least one administrator");
  }

  await prisma.user.delete({ where: { id: userId } });
  return ok({ deleted: true });
}

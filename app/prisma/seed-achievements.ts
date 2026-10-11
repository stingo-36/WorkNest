import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import type { AchievementStatus } from "../src/generated/prisma/enums";

/**
 * Fill ONE account's Achievements with a realistic mix (certifications, courses,
 * an award, a hackathon; completed and in progress), dated relative to today.
 *
 *   npm run db:seed:achievements                      -> tariboi36@gmail.com
 *   npm run db:seed:achievements -- someone@mail.com  -> another existing account
 *
 * Re-runnable: it replaces only its own achievements (matched by title) for that
 * account and leaves everything else alone. No files are attached.
 */

const DEFAULT_EMAIL = "tariboi36@gmail.com";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

type Seed = {
  title: string;
  type: string;
  status: AchievementStatus;
  assignedBy?: string;
  /** Days ago; negative = in the future (a target end date). */
  startDaysAgo?: number;
  endDaysAgo?: number;
  description: string;
};

const ACHIEVEMENTS: Seed[] = [
  {
    title: "Acquia Certified Drupal 10 Developer",
    type: "Certification",
    status: "Completed",
    assignedBy: "Engineering manager",
    startDaysAgo: 120,
    endDaysAgo: 95,
    description: "Passed with 82%. Covered site building, theming, module development and Drupal 10 APIs.",
  },
  {
    title: "AWS Certified Cloud Practitioner",
    type: "Certification",
    status: "Completed",
    startDaysAgo: 210,
    endDaysAgo: 180,
    description: "Foundational AWS exam — core services, billing, shared responsibility model.",
  },
  {
    title: "AWS Certified Developer – Associate",
    type: "Certification",
    status: "InProgress",
    assignedBy: "Tech lead",
    startDaysAgo: 30,
    endDaysAgo: -45,
    description: "Studying Lambda, DynamoDB, API Gateway and CI/CD with CodePipeline. Practice tests at ~70%.",
  },
  {
    title: "Drupal 11 Upgrade Path",
    type: "Course",
    status: "InProgress",
    startDaysAgo: 14,
    endDaysAgo: -16,
    description: "Upgrade Status, Rector and deprecation fixes for custom modules and themes.",
  },
  {
    title: "Modern JavaScript (ES2024) Deep Dive",
    type: "Course",
    status: "Completed",
    startDaysAgo: 75,
    endDaysAgo: 50,
    description: "Async patterns, modules, iterators and the newer array/object APIs.",
  },
  {
    title: "Spot Award — Q3 Release",
    type: "Award",
    status: "Completed",
    assignedBy: "Delivery head",
    endDaysAgo: 40,
    description: "Recognised for shipping the multi-site upload limit and bulk operations work ahead of the release.",
  },
  {
    title: "Internal AI Hackathon",
    type: "Hackathon",
    status: "Completed",
    startDaysAgo: 62,
    endDaysAgo: 61,
    description: "Built a prototype that drafts Drupal content summaries with an LLM. Team placed second.",
  },
];

/** UTC midnight of the LOCAL calendar day, n days ago (matches WorkLog.date). */
function dayAgo(n: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - n));
}

async function main() {
  const email = (process.argv[2] ?? DEFAULT_EMAIL).toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error(`No account for ${email}`);

  const removed = await prisma.achievement.deleteMany({
    where: { userId: user.id, title: { in: ACHIEVEMENTS.map((seed) => seed.title) } },
  });

  for (const seed of ACHIEVEMENTS) {
    await prisma.achievement.create({
      data: {
        userId: user.id,
        title: seed.title,
        type: seed.type,
        status: seed.status,
        assignedBy: seed.assignedBy ?? null,
        startDate: seed.startDaysAgo === undefined ? null : dayAgo(seed.startDaysAgo),
        endDate: seed.endDaysAgo === undefined ? null : dayAgo(seed.endDaysAgo),
        description: seed.description,
      },
    });
  }

  console.log(`Seeded ${ACHIEVEMENTS.length} achievements for ${email} — replaced ${removed.count}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

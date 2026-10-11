-- Ideas and notes were the same thing in practice: fold every Idea into Note
-- before the enum value disappears, so no row is lost.
UPDATE "FollowUp" SET "kind" = 'Note' WHERE "kind" = 'Idea';

-- AlterEnum
BEGIN;
CREATE TYPE "EntryKind_new" AS ENUM ('FollowUp', 'Task', 'Note');
ALTER TABLE "public"."FollowUp" ALTER COLUMN "kind" DROP DEFAULT;
ALTER TABLE "FollowUp" ALTER COLUMN "kind" TYPE "EntryKind_new" USING ("kind"::text::"EntryKind_new");
ALTER TYPE "EntryKind" RENAME TO "EntryKind_old";
ALTER TYPE "EntryKind_new" RENAME TO "EntryKind";
DROP TYPE "public"."EntryKind_old";
ALTER TABLE "FollowUp" ALTER COLUMN "kind" SET DEFAULT 'FollowUp';
COMMIT;

-- A follow-up update can now record THEIR reply, not only what you said.
ALTER TABLE "FollowUpUpdate" ADD COLUMN     "fromThem" BOOLEAN NOT NULL DEFAULT false;

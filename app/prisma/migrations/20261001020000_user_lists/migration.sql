-- Lists the user edits on the Profile page.
CREATE TYPE "UserListKind" AS ENUM ('FollowUpChannel', 'ResourceType', 'DefaultMeeting', 'Project', 'NoteTag', 'ResourceTag');

-- Follow-up channel and resource type become free text so users can add their
-- own options. Converted IN PLACE (not drop/add) so existing values survive.
ALTER TABLE "FollowUpUpdate" ALTER COLUMN "channel" DROP DEFAULT;
ALTER TABLE "FollowUpUpdate" ALTER COLUMN "channel" TYPE TEXT USING "channel"::text;
ALTER TABLE "FollowUpUpdate" ALTER COLUMN "channel" SET DEFAULT 'Slack';
-- The enum's only non-display key; the list now stores what the user sees.
UPDATE "FollowUpUpdate" SET "channel" = 'In person' WHERE "channel" = 'InPerson';

ALTER TABLE "Resource" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "Resource" ALTER COLUMN "type" TYPE TEXT USING "type"::text;
ALTER TABLE "Resource" ALTER COLUMN "type" SET DEFAULT 'Other';

DROP TYPE "FollowUpChannel";
DROP TYPE "ResourceType";

CREATE TABLE "UserList" (
    "userId" TEXT NOT NULL,
    "kind" "UserListKind" NOT NULL,
    "values" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hidden" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserList_pkey" PRIMARY KEY ("userId","kind")
);

ALTER TABLE "UserList" ADD CONSTRAINT "UserList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

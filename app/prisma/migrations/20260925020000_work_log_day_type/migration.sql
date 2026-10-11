-- Work logs can mark a day as a Holiday or Leave instead of a work day.
CREATE TYPE "DayType" AS ENUM ('Work', 'Holiday', 'Leave');

ALTER TABLE "WorkLog" ADD COLUMN "dayType" "DayType" NOT NULL DEFAULT 'Work';

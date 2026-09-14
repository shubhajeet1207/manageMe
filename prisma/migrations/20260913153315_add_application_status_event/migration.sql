-- CreateEnum
CREATE TYPE "StatusEventSource" AS ENUM ('CREATE', 'BOARD_DRAG', 'EDIT_FORM', 'BACKFILL');

-- CreateTable
CREATE TABLE "ApplicationStatusEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "fromStatus" "ApplicationStatus",
    "toStatus" "ApplicationStatus" NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "StatusEventSource" NOT NULL,

    CONSTRAINT "ApplicationStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApplicationStatusEvent_userId_applicationId_changedAt_idx" ON "ApplicationStatusEvent"("userId", "applicationId", "changedAt");

-- CreateIndex
CREATE INDEX "ApplicationStatusEvent_userId_changedAt_idx" ON "ApplicationStatusEvent"("userId", "changedAt");

-- CreateIndex
CREATE INDEX "ApplicationStatusEvent_userId_toStatus_idx" ON "ApplicationStatusEvent"("userId", "toStatus");

-- CreateIndex
CREATE INDEX "Task_userId_completedAt_idx" ON "Task"("userId", "completedAt");

-- AddForeignKey
ALTER TABLE "ApplicationStatusEvent" ADD CONSTRAINT "ApplicationStatusEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationStatusEvent" ADD CONSTRAINT "ApplicationStatusEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill (§8.1). Runs in the same migration as the CREATE TABLE so there is
-- no window in which the table exists and the existing rows have no genesis
-- event -- a window in which the funnel would render, look plausible, and be
-- wrong about every pre-existing application.
--
-- fromStatus is NULL because this is a genesis row. toStatus is the current
-- status, the only status fact that exists. changedAt is updatedAt, which is
-- Prisma's @updatedAt and therefore fires on ANY column write: it is an upper
-- bound on the last status change, not the change itself, which is why
-- source = 'BACKFILL' excludes these rows from every duration, conversion and
-- funnel figure (§8.2, §8.3).
--
-- gen_random_uuid()::text, because SQL has no cuid generator. The id column is
-- opaque and nothing parses it, so a uuid in a cuid-defaulted column is inert.
-- It is NOT the marker of synthetic-ness: source = 'BACKFILL' is, and no code
-- may infer provenance from an id's shape.
--
-- The NOT EXISTS clause makes this idempotent, because a re-run is exactly what
-- happens when a migration is applied to a database restored from a backup
-- taken mid-deploy.
INSERT INTO "ApplicationStatusEvent"
  ("id", "userId", "applicationId", "fromStatus", "toStatus", "changedAt", "source")
SELECT
  gen_random_uuid()::text,
  a."userId",
  a."id",
  NULL,
  a."status",
  a."updatedAt",
  'BACKFILL'
FROM "Application" a
WHERE NOT EXISTS (
  SELECT 1 FROM "ApplicationStatusEvent" e WHERE e."applicationId" = a."id"
);

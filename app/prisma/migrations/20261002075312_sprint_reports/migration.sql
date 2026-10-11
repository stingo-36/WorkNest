-- CreateTable
CREATE TABLE "SprintReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sprintStart" DATE NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SprintReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SprintReport_userId_idx" ON "SprintReport"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SprintReport_userId_sprintStart_key" ON "SprintReport"("userId", "sprintStart");

-- AddForeignKey
ALTER TABLE "SprintReport" ADD CONSTRAINT "SprintReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

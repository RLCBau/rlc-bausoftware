-- CreateEnum
CREATE TYPE "SubmissionSource" AS ENUM ('MOBILE', 'WEB', 'CLOUD', 'SYSTEM');

-- AlterTable
ALTER TABLE "CompanySubscription" ADD COLUMN     "cloudEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ProjectSubmission" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT,
    "source" "SubmissionSource" NOT NULL,
    "kind" TEXT NOT NULL,
    "entityId" TEXT,
    "title" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectSubmission_companyId_projectId_createdAt_idx" ON "ProjectSubmission"("companyId", "projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectSubmission_companyId_projectId_userId_createdAt_idx" ON "ProjectSubmission"("companyId", "projectId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectSubmission_projectId_source_createdAt_idx" ON "ProjectSubmission"("projectId", "source", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectSubmission_userId_createdAt_idx" ON "ProjectSubmission"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectSubmission_kind_idx" ON "ProjectSubmission"("kind");

-- AddForeignKey
ALTER TABLE "ProjectSubmission" ADD CONSTRAINT "ProjectSubmission_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSubmission" ADD CONSTRAINT "ProjectSubmission_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSubmission" ADD CONSTRAINT "ProjectSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


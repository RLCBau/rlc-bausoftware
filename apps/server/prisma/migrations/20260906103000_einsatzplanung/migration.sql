-- CreateTable
CREATE TABLE "ResourceAssignment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT,
    "hours" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResourceAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResourceAssignment_companyId_date_idx" ON "ResourceAssignment"("companyId", "date");

-- CreateIndex
CREATE INDEX "ResourceAssignment_companyId_resourceType_resourceId_date_idx" ON "ResourceAssignment"("companyId", "resourceType", "resourceId", "date");

-- CreateIndex
CREATE INDEX "ResourceAssignment_companyId_projectId_date_idx" ON "ResourceAssignment"("companyId", "projectId", "date");


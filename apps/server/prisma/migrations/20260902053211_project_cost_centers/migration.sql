-- CreateTable
CREATE TABLE "ProjectCostCenter" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "mainArea" TEXT NOT NULL,
    "budget" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "unit" TEXT,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectCostCenter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectCostCenter_companyId_projectId_idx" ON "ProjectCostCenter"("companyId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectCostCenter_companyId_projectId_code_key" ON "ProjectCostCenter"("companyId", "projectId", "code");

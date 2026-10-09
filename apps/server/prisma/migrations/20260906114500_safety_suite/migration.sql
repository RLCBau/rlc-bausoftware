-- CreateTable
CREATE TABLE "SafetyRiskAssessment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "projectId" TEXT,
    "activity" TEXT,
    "hazard" TEXT,
    "riskLevel" TEXT NOT NULL DEFAULT 'MEDIUM',
    "measures" TEXT,
    "responsible" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SafetyRiskAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyInspection" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "projectId" TEXT,
    "date" TIMESTAMP(3),
    "inspector" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SafetyInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyInspectionFinding" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "measure" TEXT,
    "responsible" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SafetyInspectionFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyPpeRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "itemName" TEXT,
    "issuedAt" TIMESTAMP(3),
    "nextCheck" TIMESTAMP(3),
    "condition" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SafetyPpeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyPermit" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "projectId" TEXT,
    "permitType" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "responsible" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SafetyPermit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyAttachment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "storageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SafetyAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SafetyRiskAssessment_companyId_idx" ON "SafetyRiskAssessment"("companyId");

-- CreateIndex
CREATE INDEX "SafetyRiskAssessment_companyId_projectId_idx" ON "SafetyRiskAssessment"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "SafetyRiskAssessment_companyId_status_idx" ON "SafetyRiskAssessment"("companyId", "status");

-- CreateIndex
CREATE INDEX "SafetyRiskAssessment_companyId_dueDate_idx" ON "SafetyRiskAssessment"("companyId", "dueDate");

-- CreateIndex
CREATE INDEX "SafetyInspection_companyId_idx" ON "SafetyInspection"("companyId");

-- CreateIndex
CREATE INDEX "SafetyInspection_companyId_projectId_idx" ON "SafetyInspection"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "SafetyInspection_companyId_date_idx" ON "SafetyInspection"("companyId", "date");

-- CreateIndex
CREATE INDEX "SafetyInspection_companyId_status_idx" ON "SafetyInspection"("companyId", "status");

-- CreateIndex
CREATE INDEX "SafetyInspectionFinding_inspectionId_idx" ON "SafetyInspectionFinding"("inspectionId");

-- CreateIndex
CREATE INDEX "SafetyInspectionFinding_inspectionId_status_idx" ON "SafetyInspectionFinding"("inspectionId", "status");

-- CreateIndex
CREATE INDEX "SafetyPpeRecord_companyId_idx" ON "SafetyPpeRecord"("companyId");

-- CreateIndex
CREATE INDEX "SafetyPpeRecord_companyId_employeeId_idx" ON "SafetyPpeRecord"("companyId", "employeeId");

-- CreateIndex
CREATE INDEX "SafetyPpeRecord_companyId_nextCheck_idx" ON "SafetyPpeRecord"("companyId", "nextCheck");

-- CreateIndex
CREATE INDEX "SafetyPpeRecord_companyId_status_idx" ON "SafetyPpeRecord"("companyId", "status");

-- CreateIndex
CREATE INDEX "SafetyPermit_companyId_idx" ON "SafetyPermit"("companyId");

-- CreateIndex
CREATE INDEX "SafetyPermit_companyId_projectId_idx" ON "SafetyPermit"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "SafetyPermit_companyId_status_idx" ON "SafetyPermit"("companyId", "status");

-- CreateIndex
CREATE INDEX "SafetyPermit_companyId_validUntil_idx" ON "SafetyPermit"("companyId", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "SafetyAttachment_storageId_key" ON "SafetyAttachment"("storageId");

-- CreateIndex
CREATE INDEX "SafetyAttachment_companyId_entityType_entityId_idx" ON "SafetyAttachment"("companyId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "SafetyAttachment_entityType_entityId_createdAt_idx" ON "SafetyAttachment"("entityType", "entityId", "createdAt");

-- AddForeignKey
ALTER TABLE "SafetyInspectionFinding" ADD CONSTRAINT "SafetyInspectionFinding_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "SafetyInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyPpeRecord" ADD CONSTRAINT "SafetyPpeRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "CompanyEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyAttachment" ADD CONSTRAINT "SafetyAttachment_storageId_fkey" FOREIGN KEY ("storageId") REFERENCES "StorageObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;


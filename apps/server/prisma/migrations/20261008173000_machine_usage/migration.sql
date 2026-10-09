-- CreateTable
CREATE TABLE "MachineUsageEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "documentId" TEXT,
    "date" DATE NOT NULL,
    "hours" DECIMAL(4,2) NOT NULL,
    "hourlyRate" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "costCenter" TEXT,
    "activity" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Entwurf',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "bookedAt" TIMESTAMP(3),
    "bookedBy" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MachineUsageEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MachineUsageEntry_companyId_projectId_status_date_idx" ON "MachineUsageEntry"("companyId", "projectId", "status", "date");

-- CreateIndex
CREATE INDEX "MachineUsageEntry_companyId_machineId_date_idx" ON "MachineUsageEntry"("companyId", "machineId", "date");

-- AddForeignKey
ALTER TABLE "MachineUsageEntry" ADD CONSTRAINT "MachineUsageEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineUsageEntry" ADD CONSTRAINT "MachineUsageEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineUsageEntry" ADD CONSTRAINT "MachineUsageEntry_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "CompanyMachine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineUsageEntry" ADD CONSTRAINT "MachineUsageEntry_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "MachineUsageEntry" ADD CONSTRAINT "MachineUsageEntry_values_check" CHECK ("hours" > 0 AND "hours" <= 24 AND "hourlyRate" >= 0 AND "amount" >= 0);
ALTER TABLE "MachineUsageEntry" ADD CONSTRAINT "MachineUsageEntry_status_check" CHECK ("status" IN ('Entwurf','Gebucht','Storniert'));

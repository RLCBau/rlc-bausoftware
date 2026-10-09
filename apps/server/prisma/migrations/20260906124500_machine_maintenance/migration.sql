-- CreateTable
CREATE TABLE "CompanyMachineMaintenance" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "type" TEXT,
    "workshop" TEXT,
    "technician" TEXT,
    "costNet" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "nextService" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ERLEDIGT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyMachineMaintenance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyMachineMaintenance_companyId_idx" ON "CompanyMachineMaintenance"("companyId");

-- CreateIndex
CREATE INDEX "CompanyMachineMaintenance_companyId_machineId_idx" ON "CompanyMachineMaintenance"("companyId", "machineId");

-- CreateIndex
CREATE INDEX "CompanyMachineMaintenance_companyId_date_idx" ON "CompanyMachineMaintenance"("companyId", "date");

-- CreateIndex
CREATE INDEX "CompanyMachineMaintenance_companyId_nextService_idx" ON "CompanyMachineMaintenance"("companyId", "nextService");

-- AddForeignKey
ALTER TABLE "CompanyMachineMaintenance" ADD CONSTRAINT "CompanyMachineMaintenance_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "CompanyMachine"("id") ON DELETE CASCADE ON UPDATE CASCADE;


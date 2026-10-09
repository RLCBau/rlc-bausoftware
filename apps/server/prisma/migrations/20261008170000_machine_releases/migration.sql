-- CreateTable
CREATE TABLE "MachineRelease" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "documentId" TEXT,
    "releaseDate" DATE NOT NULL,
    "availableFrom" DATE NOT NULL,
    "condition" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Entwurf',
    "notes" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "reportedAt" TIMESTAMP(3),
    "reportedBy" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MachineRelease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MachineRelease_companyId_projectId_status_idx" ON "MachineRelease"("companyId", "projectId", "status");

-- CreateIndex
CREATE INDEX "MachineRelease_companyId_machineId_releaseDate_idx" ON "MachineRelease"("companyId", "machineId", "releaseDate");

-- AddForeignKey
ALTER TABLE "MachineRelease" ADD CONSTRAINT "MachineRelease_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineRelease" ADD CONSTRAINT "MachineRelease_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineRelease" ADD CONSTRAINT "MachineRelease_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "CompanyMachine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineRelease" ADD CONSTRAINT "MachineRelease_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "MachineRelease" ADD CONSTRAINT "MachineRelease_dates_check" CHECK ("availableFrom" >= "releaseDate");

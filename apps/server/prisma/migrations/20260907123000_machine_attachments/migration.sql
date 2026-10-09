-- CreateTable
CREATE TABLE "CompanyMachineAttachment" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "storageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyMachineAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyMachineAttachment_storageId_key" ON "CompanyMachineAttachment"("storageId");

-- CreateIndex
CREATE INDEX "CompanyMachineAttachment_machineId_createdAt_idx" ON "CompanyMachineAttachment"("machineId", "createdAt");

-- AddForeignKey
ALTER TABLE "CompanyMachineAttachment" ADD CONSTRAINT "CompanyMachineAttachment_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "CompanyMachine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyMachineAttachment" ADD CONSTRAINT "CompanyMachineAttachment_storageId_fkey" FOREIGN KEY ("storageId") REFERENCES "StorageObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;


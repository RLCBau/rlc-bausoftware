-- CreateTable
CREATE TABLE "CompanyEmployeeCertificate" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyEmployeeCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyEmployeeDocument" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "storageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyEmployeeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyEmployeeCertificate_employeeId_idx" ON "CompanyEmployeeCertificate"("employeeId");

-- CreateIndex
CREATE INDEX "CompanyEmployeeCertificate_employeeId_validUntil_idx" ON "CompanyEmployeeCertificate"("employeeId", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyEmployeeDocument_storageId_key" ON "CompanyEmployeeDocument"("storageId");

-- CreateIndex
CREATE INDEX "CompanyEmployeeDocument_employeeId_createdAt_idx" ON "CompanyEmployeeDocument"("employeeId", "createdAt");

-- AddForeignKey
ALTER TABLE "CompanyEmployeeCertificate" ADD CONSTRAINT "CompanyEmployeeCertificate_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "CompanyEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyEmployeeDocument" ADD CONSTRAINT "CompanyEmployeeDocument_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "CompanyEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyEmployeeDocument" ADD CONSTRAINT "CompanyEmployeeDocument_storageId_fkey" FOREIGN KEY ("storageId") REFERENCES "StorageObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;


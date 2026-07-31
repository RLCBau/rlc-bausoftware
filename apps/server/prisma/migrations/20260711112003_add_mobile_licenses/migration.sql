-- CreateTable
CREATE TABLE "MobileLicense" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'FREE',
    "employeeName" TEXT,
    "employeeEmail" TEXT,
    "deviceName" TEXT,
    "deviceId" TEXT,
    "activatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,

    CONSTRAINT "MobileLicense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MobileLicense_code_key" ON "MobileLicense"("code");

-- CreateIndex
CREATE INDEX "MobileLicense_companyId_idx" ON "MobileLicense"("companyId");

-- CreateIndex
CREATE INDEX "MobileLicense_companyId_status_idx" ON "MobileLicense"("companyId", "status");

-- CreateIndex
CREATE INDEX "MobileLicense_companyId_role_idx" ON "MobileLicense"("companyId", "role");

-- CreateIndex
CREATE INDEX "MobileLicense_deviceId_idx" ON "MobileLicense"("deviceId");

-- AddForeignKey
ALTER TABLE "MobileLicense" ADD CONSTRAINT "MobileLicense_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

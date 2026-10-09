-- CreateTable
CREATE TABLE "CompanyMaterial" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "projectId" TEXT,
    "costCenter" TEXT,
    "location" TEXT,
    "unit" TEXT,
    "stock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "priceNet" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "supplier" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyMaterialMove" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "projectId" TEXT,
    "costCenter" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "direction" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "note" TEXT,

    CONSTRAINT "CompanyMaterialMove_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyMachine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "serial" TEXT,
    "projectId" TEXT,
    "costCenter" TEXT,
    "location" TEXT,
    "status" TEXT,
    "hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hourlyRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lastService" TIMESTAMP(3),
    "nextService" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyMachine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyMaterial_companyId_idx" ON "CompanyMaterial"("companyId");

-- CreateIndex
CREATE INDEX "CompanyMaterial_companyId_projectId_idx" ON "CompanyMaterial"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "CompanyMaterialMove_materialId_idx" ON "CompanyMaterialMove"("materialId");

-- CreateIndex
CREATE INDEX "CompanyMaterialMove_projectId_idx" ON "CompanyMaterialMove"("projectId");

-- CreateIndex
CREATE INDEX "CompanyMachine_companyId_idx" ON "CompanyMachine"("companyId");

-- CreateIndex
CREATE INDEX "CompanyMachine_companyId_projectId_idx" ON "CompanyMachine"("companyId", "projectId");

-- AddForeignKey
ALTER TABLE "CompanyMaterialMove" ADD CONSTRAINT "CompanyMaterialMove_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "CompanyMaterial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

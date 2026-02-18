-- CreateEnum
CREATE TYPE "RecipeComponentType" AS ENUM ('LABOR', 'MACHINE', 'MATERIAL', 'DISPOSAL', 'SURFACE', 'OTHER');

-- CreateTable
CREATE TABLE "RecipeTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "description" TEXT,
    "paramsJson" JSONB,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecipeTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeComponent" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "type" "RecipeComponentType" NOT NULL,
    "refKey" TEXT NOT NULL,
    "qtyFormula" TEXT NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "riskFactor" DECIMAL(10,4) NOT NULL DEFAULT 1.0,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,

    CONSTRAINT "RecipeComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeVariant" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RecipeVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyPrice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "refKey" TEXT NOT NULL,
    "price" DECIMAL(18,6) NOT NULL,
    "unit" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "CompanyPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyProductivity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "variantId" TEXT,
    "value" DECIMAL(18,6) NOT NULL,
    "unit" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 70,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyProductivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecipeTemplate_key_key" ON "RecipeTemplate"("key");

-- CreateIndex
CREATE INDEX "RecipeComponent_templateId_type_idx" ON "RecipeComponent"("templateId", "type");

-- CreateIndex
CREATE INDEX "RecipeComponent_refKey_idx" ON "RecipeComponent"("refKey");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeVariant_key_key" ON "RecipeVariant"("key");

-- CreateIndex
CREATE INDEX "RecipeVariant_templateId_enabled_idx" ON "RecipeVariant"("templateId", "enabled");

-- CreateIndex
CREATE INDEX "CompanyPrice_companyId_refKey_idx" ON "CompanyPrice"("companyId", "refKey");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyPrice_companyId_refKey_validFrom_key" ON "CompanyPrice"("companyId", "refKey", "validFrom");

-- CreateIndex
CREATE INDEX "CompanyProductivity_companyId_templateId_idx" ON "CompanyProductivity"("companyId", "templateId");

-- CreateIndex
CREATE INDEX "CompanyProductivity_companyId_variantId_idx" ON "CompanyProductivity"("companyId", "variantId");

-- AddForeignKey
ALTER TABLE "RecipeComponent" ADD CONSTRAINT "RecipeComponent_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "RecipeTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeVariant" ADD CONSTRAINT "RecipeVariant_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "RecipeTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyPrice" ADD CONSTRAINT "CompanyPrice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyProductivity" ADD CONSTRAINT "CompanyProductivity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyProductivity" ADD CONSTRAINT "CompanyProductivity_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "RecipeTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyProductivity" ADD CONSTRAINT "CompanyProductivity_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "RecipeVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

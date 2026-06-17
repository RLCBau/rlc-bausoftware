/*
  Warnings:

  - A unique constraint covering the columns `[code]` on the table `CompanyInvite` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `code` to the `CompanyInvite` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "CompanyInvite" ADD COLUMN     "code" TEXT NOT NULL,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "maxUses" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "usedCount" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "role" SET DEFAULT 'MITARBEITER',
ALTER COLUMN "tokenHash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "CompanySubscription" ADD COLUMN     "mobileSeatsPurchased" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "webSeatsPurchased" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "resetTokenExpiry" TIMESTAMP(3),
ADD COLUMN     "resetTokenHash" TEXT;

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "companyId" TEXT,
    "ip" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KalkulationsDbEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'ki',
    "projectCode" TEXT,
    "projectName" TEXT,
    "positionNumber" TEXT,
    "shortText" TEXT NOT NULL,
    "longText" TEXT,
    "unit" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "materialCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "laborCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "machineCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subcontractorCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "disposalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "transportCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overheadCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "riskCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "profitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitPriceNet" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalNet" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trade" TEXT,
    "serviceType" TEXT,
    "constructionMethod" TEXT,
    "soilClass" TEXT,
    "riskLevel" TEXT NOT NULL DEFAULT 'mittel',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.75,
    "parameters" JSONB,
    "resources" JSONB,
    "tags" JSONB,
    "aiNote" TEXT,
    "calculatorNote" TEXT,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KalkulationsDbEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyRecipeDb" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "signature" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourcePosNr" TEXT,
    "sourceText" TEXT,
    "unit" TEXT,
    "context" JSONB,
    "lines" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyRecipeDb_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RlcGlobalPriceKnowledge" (
    "id" TEXT NOT NULL,
    "normalizedKey" TEXT NOT NULL,
    "positionNumber" TEXT,
    "shortText" TEXT NOT NULL,
    "unit" TEXT,
    "trade" TEXT,
    "serviceType" TEXT,
    "constructionMethod" TEXT,
    "soilClass" TEXT,
    "minPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "medianPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "sourceCompanyCount" INTEGER NOT NULL DEFAULT 0,
    "country" TEXT,
    "region" TEXT,
    "priceYear" INTEGER,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.75,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RlcGlobalPriceKnowledge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_idx" ON "AuditLog"("companyId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "KalkulationsDbEntry_companyId_idx" ON "KalkulationsDbEntry"("companyId");

-- CreateIndex
CREATE INDEX "KalkulationsDbEntry_projectId_idx" ON "KalkulationsDbEntry"("projectId");

-- CreateIndex
CREATE INDEX "KalkulationsDbEntry_projectCode_idx" ON "KalkulationsDbEntry"("projectCode");

-- CreateIndex
CREATE INDEX "KalkulationsDbEntry_positionNumber_idx" ON "KalkulationsDbEntry"("positionNumber");

-- CreateIndex
CREATE INDEX "KalkulationsDbEntry_companyId_positionNumber_idx" ON "KalkulationsDbEntry"("companyId", "positionNumber");

-- CreateIndex
CREATE INDEX "CompanyRecipeDb_companyId_idx" ON "CompanyRecipeDb"("companyId");

-- CreateIndex
CREATE INDEX "CompanyRecipeDb_projectId_idx" ON "CompanyRecipeDb"("projectId");

-- CreateIndex
CREATE INDEX "CompanyRecipeDb_signature_idx" ON "CompanyRecipeDb"("signature");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyRecipeDb_companyId_signature_key" ON "CompanyRecipeDb"("companyId", "signature");

-- CreateIndex
CREATE UNIQUE INDEX "RlcGlobalPriceKnowledge_normalizedKey_key" ON "RlcGlobalPriceKnowledge"("normalizedKey");

-- CreateIndex
CREATE INDEX "RlcGlobalPriceKnowledge_normalizedKey_idx" ON "RlcGlobalPriceKnowledge"("normalizedKey");

-- CreateIndex
CREATE INDEX "RlcGlobalPriceKnowledge_shortText_idx" ON "RlcGlobalPriceKnowledge"("shortText");

-- CreateIndex
CREATE INDEX "RlcGlobalPriceKnowledge_unit_idx" ON "RlcGlobalPriceKnowledge"("unit");

-- CreateIndex
CREATE INDEX "RlcGlobalPriceKnowledge_trade_idx" ON "RlcGlobalPriceKnowledge"("trade");

-- CreateIndex
CREATE INDEX "RlcGlobalPriceKnowledge_serviceType_idx" ON "RlcGlobalPriceKnowledge"("serviceType");

-- CreateIndex
CREATE INDEX "RlcGlobalPriceKnowledge_constructionMethod_idx" ON "RlcGlobalPriceKnowledge"("constructionMethod");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyInvite_code_key" ON "CompanyInvite"("code");

-- CreateIndex
CREATE INDEX "CompanyInvite_code_idx" ON "CompanyInvite"("code");

-- CreateIndex
CREATE INDEX "CompanyInvite_companyId_isActive_idx" ON "CompanyInvite"("companyId", "isActive");

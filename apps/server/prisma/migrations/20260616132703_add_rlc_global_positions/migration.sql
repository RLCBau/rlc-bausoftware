-- CreateTable
CREATE TABLE "RlcGlobalPosition" (
    "id" TEXT NOT NULL,
    "source" TEXT,
    "sourceUrl" TEXT,
    "sourceType" TEXT,
    "region" TEXT,
    "year" INTEGER,
    "gewerk" TEXT,
    "category" TEXT,
    "positionNumber" TEXT,
    "shortText" TEXT NOT NULL,
    "longText" TEXT,
    "unit" TEXT,
    "priceMin" DOUBLE PRECISION,
    "priceAvg" DOUBLE PRECISION,
    "priceMax" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "sampleCount" INTEGER NOT NULL DEFAULT 1,
    "isContextSensitive" BOOLEAN NOT NULL DEFAULT false,
    "needsReview" BOOLEAN NOT NULL DEFAULT true,
    "normalizedKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RlcGlobalPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RlcGlobalImportLog" (
    "id" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceType" TEXT,
    "sourceUrl" TEXT,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "acceptedRows" INTEGER NOT NULL DEFAULT 0,
    "rejectedRows" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RlcGlobalImportLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RlcGlobalPosition_shortText_idx" ON "RlcGlobalPosition"("shortText");

-- CreateIndex
CREATE INDEX "RlcGlobalPosition_unit_idx" ON "RlcGlobalPosition"("unit");

-- CreateIndex
CREATE INDEX "RlcGlobalPosition_gewerk_idx" ON "RlcGlobalPosition"("gewerk");

-- CreateIndex
CREATE INDEX "RlcGlobalPosition_category_idx" ON "RlcGlobalPosition"("category");

-- CreateIndex
CREATE INDEX "RlcGlobalPosition_normalizedKey_idx" ON "RlcGlobalPosition"("normalizedKey");

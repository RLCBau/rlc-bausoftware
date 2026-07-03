-- CreateTable
CREATE TABLE "RlcGlobalKnowledgeAggregated" (
    "id" TEXT NOT NULL,
    "normalizedKey" TEXT NOT NULL,
    "shortText" TEXT NOT NULL,
    "longText" TEXT,
    "unit" TEXT,
    "gewerk" TEXT,
    "category" TEXT,
    "priceMin" DOUBLE PRECISION,
    "priceAvg" DOUBLE PRECISION,
    "priceMax" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "sources" JSONB,
    "isContextSensitive" BOOLEAN NOT NULL DEFAULT false,
    "needsReview" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RlcGlobalKnowledgeAggregated_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RlcGlobalKnowledgeAggregated_normalizedKey_key" ON "RlcGlobalKnowledgeAggregated"("normalizedKey");

-- CreateIndex
CREATE INDEX "RlcGlobalKnowledgeAggregated_shortText_idx" ON "RlcGlobalKnowledgeAggregated"("shortText");

-- CreateIndex
CREATE INDEX "RlcGlobalKnowledgeAggregated_unit_idx" ON "RlcGlobalKnowledgeAggregated"("unit");

-- CreateIndex
CREATE INDEX "RlcGlobalKnowledgeAggregated_gewerk_idx" ON "RlcGlobalKnowledgeAggregated"("gewerk");

-- CreateIndex
CREATE INDEX "RlcGlobalKnowledgeAggregated_category_idx" ON "RlcGlobalKnowledgeAggregated"("category");

-- CreateIndex
CREATE INDEX "RlcGlobalKnowledgeAggregated_confidence_idx" ON "RlcGlobalKnowledgeAggregated"("confidence");

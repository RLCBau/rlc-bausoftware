CREATE TABLE "AiMarketReviewUsage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "projectId" TEXT,
    "positionId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "webSearchCalls" INTEGER NOT NULL DEFAULT 0,
    "creditsUsed" INTEGER NOT NULL DEFAULT 1,
    "estimatedCostUsd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiMarketReviewUsage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AiMarketReviewUsage_companyId_createdAt_idx" ON "AiMarketReviewUsage"("companyId", "createdAt");
CREATE INDEX "AiMarketReviewUsage_companyId_model_createdAt_idx" ON "AiMarketReviewUsage"("companyId", "model", "createdAt");
CREATE INDEX "AiMarketReviewUsage_projectId_createdAt_idx" ON "AiMarketReviewUsage"("projectId", "createdAt");
ALTER TABLE "AiMarketReviewUsage" ADD CONSTRAINT "AiMarketReviewUsage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

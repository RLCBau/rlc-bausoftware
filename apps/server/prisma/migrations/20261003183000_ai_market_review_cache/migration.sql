CREATE TABLE "AiMarketReviewCache" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "marketMonth" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiMarketReviewCache_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AiMarketReviewCache_companyId_fingerprint_marketMonth_key" ON "AiMarketReviewCache"("companyId", "fingerprint", "marketMonth");
CREATE INDEX "AiMarketReviewCache_companyId_marketMonth_idx" ON "AiMarketReviewCache"("companyId", "marketMonth");
ALTER TABLE "AiMarketReviewCache" ADD CONSTRAINT "AiMarketReviewCache_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

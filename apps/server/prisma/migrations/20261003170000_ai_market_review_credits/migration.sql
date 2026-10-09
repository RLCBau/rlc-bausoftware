ALTER TABLE "CompanySubscription"
  ADD COLUMN "aiMarketMonthlyIncluded" INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN "aiMarketMonthlyUsed" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "aiMarketMonthKey" TEXT,
  ADD COLUMN "aiMarketCreditsPurchased" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "AiMarketReviewUsage"
  ADD COLUMN "creditSource" TEXT;

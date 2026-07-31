CREATE TABLE "MarketIntelligenceEvent" (
  "id" TEXT NOT NULL, "externalId" TEXT NOT NULL, "title" TEXT NOT NULL, "url" TEXT,
  "sourceId" TEXT NOT NULL, "sourceName" TEXT NOT NULL, "publishedAt" TIMESTAMP(3) NOT NULL,
  "priority" TEXT NOT NULL, "relevanceScore" INTEGER NOT NULL, "trustScore" INTEGER NOT NULL,
  "totalScore" INTEGER NOT NULL, "verification" TEXT NOT NULL, "matchedSignals" JSONB NOT NULL,
  "priceHints" JSONB NOT NULL, "marketImpact" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "MarketIntelligenceEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MarketIntelligenceEvent_externalId_key" ON "MarketIntelligenceEvent"("externalId");
CREATE INDEX "MarketIntelligenceEvent_publishedAt_idx" ON "MarketIntelligenceEvent"("publishedAt");
CREATE INDEX "MarketIntelligenceEvent_totalScore_idx" ON "MarketIntelligenceEvent"("totalScore");

CREATE TABLE "MarketIntelligenceCandidate" (
  "id" TEXT NOT NULL, "eventId" TEXT NOT NULL, "type" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'NEW',
  "title" TEXT NOT NULL, "rationale" TEXT, "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "proposedData" JSONB NOT NULL, "reviewedAt" TIMESTAMP(3), "reviewedBy" TEXT, "reviewNote" TEXT,
  "appliedAt" TIMESTAMP(3), "appliedBy" TEXT, "appliedResult" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketIntelligenceCandidate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MarketIntelligenceCandidate_eventId_idx" ON "MarketIntelligenceCandidate"("eventId");
CREATE INDEX "MarketIntelligenceCandidate_status_type_idx" ON "MarketIntelligenceCandidate"("status", "type");
ALTER TABLE "MarketIntelligenceCandidate" ADD CONSTRAINT "MarketIntelligenceCandidate_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "MarketIntelligenceEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MarketIntelligenceReview" (
  "id" TEXT NOT NULL, "candidateId" TEXT NOT NULL, "action" TEXT NOT NULL, "note" TEXT, "userId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "MarketIntelligenceReview_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MarketIntelligenceReview_candidateId_idx" ON "MarketIntelligenceReview"("candidateId");
ALTER TABLE "MarketIntelligenceReview" ADD CONSTRAINT "MarketIntelligenceReview_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "MarketIntelligenceCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

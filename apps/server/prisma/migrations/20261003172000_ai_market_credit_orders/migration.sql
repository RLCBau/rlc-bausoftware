CREATE TABLE "AiMarketCreditOrder" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT,
  "credits" INTEGER NOT NULL,
  "priceCents" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidAt" TIMESTAMP(3),
  "creditedAt" TIMESTAMP(3),
  CONSTRAINT "AiMarketCreditOrder_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AiMarketCreditOrder_companyId_status_createdAt_idx" ON "AiMarketCreditOrder"("companyId", "status", "createdAt");
CREATE INDEX "AiMarketCreditOrder_createdAt_idx" ON "AiMarketCreditOrder"("createdAt");
ALTER TABLE "AiMarketCreditOrder" ADD CONSTRAINT "AiMarketCreditOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

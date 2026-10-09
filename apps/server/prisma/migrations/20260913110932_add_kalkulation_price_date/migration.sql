-- AlterTable
ALTER TABLE "KalkulationsDbEntry" ADD COLUMN     "priceDate" TIMESTAMP(3),
ADD COLUMN     "priceDateSource" TEXT;

-- CreateIndex
CREATE INDEX "KalkulationsDbEntry_priceDate_idx" ON "KalkulationsDbEntry"("priceDate");

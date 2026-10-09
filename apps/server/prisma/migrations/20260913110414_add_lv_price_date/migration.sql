-- AlterTable
ALTER TABLE "LVHeader" ADD COLUMN     "priceDate" TIMESTAMP(3),
ADD COLUMN     "priceDateSource" TEXT;

-- CreateIndex
CREATE INDEX "LVHeader_priceDate_idx" ON "LVHeader"("priceDate");

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'GRACE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('BASIC_5', 'PRO_20', 'MAX_UNLIMITED');

-- CreateTable
CREATE TABLE "CompanySubscription" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'MAX_UNLIMITED',
    "seatsLimit" INTEGER,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEnd" TIMESTAMP(3),
    "appleLatestTransactionId" TEXT,
    "appleOriginalTransactionId" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanySubscription_companyId_key" ON "CompanySubscription"("companyId");

-- CreateIndex
CREATE INDEX "CompanySubscription_status_plan_idx" ON "CompanySubscription"("status", "plan");

-- AddForeignKey
ALTER TABLE "CompanySubscription" ADD CONSTRAINT "CompanySubscription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

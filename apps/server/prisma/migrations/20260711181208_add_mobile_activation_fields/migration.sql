-- AlterTable
ALTER TABLE "CompanyInvite" ADD COLUMN     "activatedByUserId" TEXT;

-- AlterTable
ALTER TABLE "MobileLicense" ADD COLUMN     "appVersion" TEXT,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3);

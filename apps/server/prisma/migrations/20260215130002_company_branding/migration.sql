-- DropForeignKey
ALTER TABLE "CompanyInvite" DROP CONSTRAINT "CompanyInvite_createdByUserId_fkey";

-- DropIndex
DROP INDEX "CompanyInvite_expiresAt_idx";

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "email" TEXT,
ADD COLUMN     "logoPath" TEXT,
ADD COLUMN     "phone" TEXT;

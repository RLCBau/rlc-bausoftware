-- AlterTable
ALTER TABLE "User" ADD COLUMN     "appRole" TEXT,
ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "name" TEXT,
ADD COLUMN     "verifyTokenExpiry" TIMESTAMP(3),
ADD COLUMN     "verifyTokenHash" TEXT;

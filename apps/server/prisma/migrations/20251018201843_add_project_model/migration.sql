/*
  Warnings:

  - Added the required column `updatedAt` to the `Company` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Project` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Company_code_idx";

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "address" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "projectId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

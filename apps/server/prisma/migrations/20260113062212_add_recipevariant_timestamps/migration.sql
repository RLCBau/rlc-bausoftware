/*
  Warnings:

  - You are about to drop the column `projectId` on the `User` table. All the data in the column will be lost.
  - Added the required column `updatedAt` to the `RecipeVariant` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_projectId_fkey";

-- AlterTable
ALTER TABLE "RecipeVariant"
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;


-- AlterTable
ALTER TABLE "User" DROP COLUMN "projectId",
ADD COLUMN     "currentProjectId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_currentProjectId_fkey" FOREIGN KEY ("currentProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

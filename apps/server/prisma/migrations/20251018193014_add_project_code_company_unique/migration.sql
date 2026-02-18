/*
  Warnings:

  - You are about to drop the column `createdAt` on the `Project` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[code,companyId]` on the table `Project` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Project_companyId_code_key";

-- DropIndex
DROP INDEX "Project_companyId_idx";

-- AlterTable
ALTER TABLE "Project" DROP COLUMN "createdAt";

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_companyId_key" ON "Project"("code", "companyId");

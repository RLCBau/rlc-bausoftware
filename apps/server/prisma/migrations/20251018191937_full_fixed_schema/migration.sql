/*
  Warnings:

  - You are about to drop the column `noteNumber` on the `DeliveryNote` table. All the data in the column will be lost.
  - You are about to drop the column `supplier` on the `DeliveryNote` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `DeliveryNote` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `LVItem` table. All the data in the column will be lost.
  - You are about to drop the column `position` on the `LVItem` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `LVItem` table. All the data in the column will be lost.
  - You are about to drop the column `company` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `RegieReport` table. All the data in the column will be lost.
  - You are about to drop the column `reportDate` on the `RegieReport` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `RegieReport` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `User` table. All the data in the column will be lost.
  - The `role` column on the `User` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[companyId,code]` on the table `Project` will be added. If there are existing duplicate values, this will fail.
  - Made the column `date` on table `DeliveryNote` required. This step will fail if there are existing NULL values in that column.
  - Made the column `projectId` on table `DeliveryNote` required. This step will fail if there are existing NULL values in that column.
  - Made the column `projectId` on table `LVItem` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `companyId` to the `Project` table without a default value. This is not possible if the table is not empty.
  - Made the column `code` on table `Project` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `typ` to the `RegieReport` table without a default value. This is not possible if the table is not empty.
  - Made the column `projectId` on table `RegieReport` required. This step will fail if there are existing NULL values in that column.
  - Made the column `password` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'user');

-- CreateEnum
CREATE TYPE "RegieTyp" AS ENUM ('ARBEIT', 'MASCHINE', 'MATERIAL', 'WETTER');

-- DropForeignKey
ALTER TABLE "DeliveryNote" DROP CONSTRAINT "DeliveryNote_projectId_fkey";

-- DropForeignKey
ALTER TABLE "LVItem" DROP CONSTRAINT "LVItem_projectId_fkey";

-- DropForeignKey
ALTER TABLE "RegieReport" DROP CONSTRAINT "RegieReport_projectId_fkey";

-- AlterTable
ALTER TABLE "DeliveryNote" DROP COLUMN "noteNumber",
DROP COLUMN "supplier",
DROP COLUMN "updatedAt",
ADD COLUMN     "material" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "qty" DOUBLE PRECISION,
ADD COLUMN     "raw" JSONB,
ADD COLUMN     "unit" TEXT,
ALTER COLUMN "date" SET NOT NULL,
ALTER COLUMN "date" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "projectId" SET NOT NULL;

-- AlterTable
ALTER TABLE "LVItem" DROP COLUMN "description",
DROP COLUMN "position",
DROP COLUMN "updatedAt",
ADD COLUMN     "calcExpression" TEXT,
ADD COLUMN     "calcVariables" TEXT,
ADD COLUMN     "longText" TEXT,
ADD COLUMN     "positionNumber" TEXT,
ADD COLUMN     "shortText" TEXT,
ALTER COLUMN "quantity" SET DEFAULT 0,
ALTER COLUMN "projectId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Project" DROP COLUMN "company",
DROP COLUMN "updatedAt",
ADD COLUMN     "companyId" TEXT NOT NULL,
ALTER COLUMN "code" SET NOT NULL;

-- AlterTable
ALTER TABLE "RegieReport" DROP COLUMN "description",
DROP COLUMN "reportDate",
DROP COLUMN "updatedAt",
ADD COLUMN     "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "hours" DOUBLE PRECISION,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "quantity" DOUBLE PRECISION,
ADD COLUMN     "typ" "RegieTyp" NOT NULL,
ADD COLUMN     "unit" TEXT,
ALTER COLUMN "projectId" SET NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "name",
DROP COLUMN "updatedAt",
ADD COLUMN     "companyId" TEXT,
ALTER COLUMN "password" SET NOT NULL,
DROP COLUMN "role",
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'user';

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Company_code_idx" ON "Company"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Company_code_key" ON "Company"("code");

-- CreateIndex
CREATE INDEX "DeliveryNote_projectId_date_idx" ON "DeliveryNote"("projectId", "date");

-- CreateIndex
CREATE INDEX "LVItem_projectId_idx" ON "LVItem"("projectId");

-- CreateIndex
CREATE INDEX "LVItem_positionNumber_idx" ON "LVItem"("positionNumber");

-- CreateIndex
CREATE INDEX "Project_companyId_idx" ON "Project"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_companyId_code_key" ON "Project"("companyId", "code");

-- CreateIndex
CREATE INDEX "RegieReport_projectId_date_idx" ON "RegieReport"("projectId", "date");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LVItem" ADD CONSTRAINT "LVItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegieReport" ADD CONSTRAINT "RegieReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

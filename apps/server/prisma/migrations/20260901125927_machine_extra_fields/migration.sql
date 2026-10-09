-- AlterTable
ALTER TABLE "CompanyMachine" ADD COLUMN     "attachments" JSONB,
ADD COLUMN     "maintenance" JSONB,
ADD COLUMN     "serviceIntervalDays" INTEGER NOT NULL DEFAULT 180;

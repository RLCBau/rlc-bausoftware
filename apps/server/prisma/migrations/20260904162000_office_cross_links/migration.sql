-- AlterTable
ALTER TABLE "OfficeCalendarEvent" ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceType" TEXT;

-- AlterTable
ALTER TABLE "ProjectTask" ADD COLUMN     "description" TEXT,
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceType" TEXT;


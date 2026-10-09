-- AlterTable
ALTER TABLE "PlanTask" ADD COLUMN     "assignee" TEXT,
ADD COLUMN     "end" TIMESTAMP(3),
ADD COLUMN     "milestone" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "progress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "start" TIMESTAMP(3);


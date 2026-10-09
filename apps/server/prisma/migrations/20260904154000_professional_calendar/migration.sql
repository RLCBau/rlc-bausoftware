-- CreateTable
CREATE TABLE "OfficeCalendarEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "attendees" TEXT[],
    "notes" TEXT,
    "category" TEXT,
    "busyStatus" TEXT NOT NULL DEFAULT 'busy',
    "reminderMinutes" INTEGER DEFAULT 15,
    "source" TEXT NOT NULL DEFAULT 'RLC',
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficeCalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfficeCalendarEvent_companyId_start_end_idx" ON "OfficeCalendarEvent"("companyId", "start", "end");

-- CreateIndex
CREATE INDEX "OfficeCalendarEvent_projectId_start_idx" ON "OfficeCalendarEvent"("projectId", "start");

-- CreateIndex
CREATE INDEX "OfficeCalendarEvent_companyId_externalId_idx" ON "OfficeCalendarEvent"("companyId", "externalId");

-- AddForeignKey
ALTER TABLE "OfficeCalendarEvent" ADD CONSTRAINT "OfficeCalendarEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficeCalendarEvent" ADD CONSTRAINT "OfficeCalendarEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;


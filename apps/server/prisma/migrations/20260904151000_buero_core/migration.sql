-- CreateTable
CREATE TABLE "CommunicationThread" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "participants" TEXT[],
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunicationThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "toList" TEXT[],
    "ccList" TEXT[],
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationAttachment" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "documentId" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTask" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "due" TIMESTAMP(3),
    "done" BOOLEAN NOT NULL DEFAULT false,
    "assignee" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'med',
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectNote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "tags" TEXT[],
    "author" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunicationThread_companyId_projectId_updatedAt_idx" ON "CommunicationThread"("companyId", "projectId", "updatedAt");

-- CreateIndex
CREATE INDEX "CommunicationMessage_threadId_createdAt_idx" ON "CommunicationMessage"("threadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationAttachment_documentId_key" ON "CommunicationAttachment"("documentId");

-- CreateIndex
CREATE INDEX "CommunicationAttachment_threadId_createdAt_idx" ON "CommunicationAttachment"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectTask_companyId_projectId_done_idx" ON "ProjectTask"("companyId", "projectId", "done");

-- CreateIndex
CREATE INDEX "ProjectTask_projectId_due_idx" ON "ProjectTask"("projectId", "due");

-- CreateIndex
CREATE INDEX "ProjectNote_companyId_projectId_updatedAt_idx" ON "ProjectNote"("companyId", "projectId", "updatedAt");

-- AddForeignKey
ALTER TABLE "CommunicationThread" ADD CONSTRAINT "CommunicationThread_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationThread" ADD CONSTRAINT "CommunicationThread_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationMessage" ADD CONSTRAINT "CommunicationMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "CommunicationThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationAttachment" ADD CONSTRAINT "CommunicationAttachment_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "CommunicationThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationAttachment" ADD CONSTRAINT "CommunicationAttachment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectNote" ADD CONSTRAINT "ProjectNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectNote" ADD CONSTRAINT "ProjectNote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;


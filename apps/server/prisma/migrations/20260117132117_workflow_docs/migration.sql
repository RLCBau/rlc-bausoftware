-- CreateEnum
CREATE TYPE "WorkflowDocType" AS ENUM ('REGIE', 'LIEFERSCHEIN', 'PHOTO_NOTE');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('DRAFT', 'EINGEREICHT', 'FREIGEGEBEN', 'ABGELEHNT');

-- CreateTable
CREATE TABLE "WorkflowDoc" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "WorkflowDocType" NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'EINGEREICHT',
    "fsKey" TEXT NOT NULL,
    "fsPath" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "title" TEXT,
    "searchText" TEXT,
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "rejectedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowDocLink" (
    "id" TEXT NOT NULL,
    "workflowDocId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "kind" "FileKind" NOT NULL,
    "note" TEXT,

    CONSTRAINT "WorkflowDocLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkflowDoc_projectId_type_status_createdAt_idx" ON "WorkflowDoc"("projectId", "type", "status", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowDoc_projectId_date_idx" ON "WorkflowDoc"("projectId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowDoc_projectId_type_docId_key" ON "WorkflowDoc"("projectId", "type", "docId");

-- CreateIndex
CREATE INDEX "WorkflowDocLink_workflowDocId_idx" ON "WorkflowDocLink"("workflowDocId");

-- CreateIndex
CREATE INDEX "WorkflowDocLink_documentId_idx" ON "WorkflowDocLink"("documentId");

-- AddForeignKey
ALTER TABLE "WorkflowDoc" ADD CONSTRAINT "WorkflowDoc_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowDocLink" ADD CONSTRAINT "WorkflowDocLink_workflowDocId_fkey" FOREIGN KEY ("workflowDocId") REFERENCES "WorkflowDoc"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowDocLink" ADD CONSTRAINT "WorkflowDocLink_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "documentId" TEXT,
    "title" TEXT NOT NULL,
    "contractNumber" TEXT,
    "partner" TEXT,
    "contractType" TEXT NOT NULL DEFAULT 'Bauvertrag',
    "status" TEXT NOT NULL DEFAULT 'Entwurf',
    "valueNet" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "cancellationDays" INTEGER NOT NULL DEFAULT 30,
    "notes" TEXT,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Contract_documentId_key"
ON "Contract"("documentId");

CREATE INDEX "Contract_companyId_projectId_idx"
ON "Contract"("companyId", "projectId");

CREATE INDEX "Contract_companyId_status_idx"
ON "Contract"("companyId", "status");

CREATE INDEX "Contract_projectId_endDate_idx"
ON "Contract"("projectId", "endDate");

CREATE INDEX "Contract_documentId_idx"
ON "Contract"("documentId");

ALTER TABLE "Contract"
ADD CONSTRAINT "Contract_companyId_fkey"
FOREIGN KEY ("companyId")
REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Contract"
ADD CONSTRAINT "Contract_projectId_fkey"
FOREIGN KEY ("projectId")
REFERENCES "Project"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Contract"
ADD CONSTRAINT "Contract_documentId_fkey"
FOREIGN KEY ("documentId")
REFERENCES "Document"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
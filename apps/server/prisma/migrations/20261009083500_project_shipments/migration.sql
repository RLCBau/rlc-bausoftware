
CREATE TABLE "ProjectShipment" (
 "id" TEXT NOT NULL PRIMARY KEY,"companyId" TEXT NOT NULL,"projectId" TEXT NOT NULL,"number" TEXT NOT NULL,
 "title" TEXT NOT NULL,"recipient" TEXT NOT NULL,"address" TEXT NOT NULL,"carrier" TEXT NOT NULL,"trackingNumber" TEXT NOT NULL,"contents" TEXT NOT NULL,"notes" TEXT NOT NULL,"packages" INTEGER,
 "plannedDate" DATE,"expectedDate" DATE,"dispatchedDate" DATE,"deliveredDate" DATE,
 "dispatchedAt" TIMESTAMP(3),"dispatchedBy" TEXT,"deliveredAt" TIMESTAMP(3),"deliveredBy" TEXT,"receivedBy" TEXT,
 "documentId" TEXT,"receiptDocumentId" TEXT,"deliveryKey" TEXT,"sourceHash" TEXT,"deliverySnapshot" JSONB,
 "status" TEXT NOT NULL DEFAULT 'Entwurf',"revision" INTEGER NOT NULL DEFAULT 1,"lastIssue" TEXT,"cancelReason" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ProjectShipment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "ProjectShipment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "ProjectShipment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "ProjectShipment_receiptDocumentId_fkey" FOREIGN KEY ("receiptDocumentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "ProjectShipment_status_check" CHECK ("status" IN ('Entwurf','Geplant','Versendet','Zugestellt','Problem','Storniert')),
 CONSTRAINT "ProjectShipment_packages_check" CHECK ("packages" IS NULL OR "packages" BETWEEN 1 AND 99999),
 CONSTRAINT "ProjectShipment_dates_check" CHECK (("expectedDate" IS NULL OR "plannedDate" IS NULL OR "expectedDate" >= "plannedDate") AND ("deliveredDate" IS NULL OR ("dispatchedDate" IS NOT NULL AND "deliveredDate">="dispatchedDate")))
);
CREATE UNIQUE INDEX "ProjectShipment_companyId_number_key" ON "ProjectShipment"("companyId","number");
CREATE INDEX "ProjectShipment_companyId_projectId_status_idx" ON "ProjectShipment"("companyId","projectId","status");

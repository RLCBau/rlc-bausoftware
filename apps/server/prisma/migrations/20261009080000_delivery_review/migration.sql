
CREATE TABLE "DeliveryReview" (
 "id" TEXT NOT NULL PRIMARY KEY,"companyId" TEXT NOT NULL,"projectId" TEXT NOT NULL,
 "deliveryKey" TEXT NOT NULL,"sourceHash" TEXT NOT NULL,"orderId" TEXT,"orderSnapshot" JSONB,
 "status" TEXT NOT NULL DEFAULT 'IN_PRUEFUNG',"supplierConfirmed" BOOLEAN NOT NULL DEFAULT false,"quantityConfirmed" BOOLEAN NOT NULL DEFAULT false,
 "notes" TEXT,"revision" INTEGER NOT NULL DEFAULT 1,"reviewedBy" TEXT,"reviewedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "DeliveryReview_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "DeliveryReview_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "DeliveryReview_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CompanyPurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "DeliveryReview_status_check" CHECK ("status" IN ('IN_PRUEFUNG','GEKLAERT','REKLAMATION')),
 CONSTRAINT "DeliveryReview_confirmed_check" CHECK ("status" <> 'GEKLAERT' OR ("supplierConfirmed" AND "quantityConfirmed"))
);
CREATE UNIQUE INDEX "DeliveryReview_projectId_deliveryKey_key" ON "DeliveryReview"("projectId","deliveryKey");
CREATE INDEX "DeliveryReview_companyId_projectId_status_idx" ON "DeliveryReview"("companyId","projectId","status");

-- CreateTable
CREATE TABLE "CompanyPurchaseOrder" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "supplier" TEXT,
    "projectId" TEXT,
    "costCenter" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ENTWURF',
    "orderDate" TIMESTAMP(3),
    "deliveryDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyPurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyPurchaseOrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "materialId" TEXT,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "qty" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "priceNet" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyPurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyPurchaseOrder_companyId_idx" ON "CompanyPurchaseOrder"("companyId");

-- CreateIndex
CREATE INDEX "CompanyPurchaseOrder_companyId_status_idx" ON "CompanyPurchaseOrder"("companyId", "status");

-- CreateIndex
CREATE INDEX "CompanyPurchaseOrder_companyId_projectId_idx" ON "CompanyPurchaseOrder"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "CompanyPurchaseOrder_companyId_deliveryDate_idx" ON "CompanyPurchaseOrder"("companyId", "deliveryDate");

-- CreateIndex
CREATE INDEX "CompanyPurchaseOrderLine_orderId_idx" ON "CompanyPurchaseOrderLine"("orderId");

-- CreateIndex
CREATE INDEX "CompanyPurchaseOrderLine_materialId_idx" ON "CompanyPurchaseOrderLine"("materialId");

-- AddForeignKey
ALTER TABLE "CompanyPurchaseOrderLine" ADD CONSTRAINT "CompanyPurchaseOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CompanyPurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyPurchaseOrderLine" ADD CONSTRAINT "CompanyPurchaseOrderLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "CompanyMaterial"("id") ON DELETE SET NULL ON UPDATE CASCADE;


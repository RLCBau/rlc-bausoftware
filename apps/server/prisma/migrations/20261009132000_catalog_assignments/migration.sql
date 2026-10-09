CREATE TABLE "CompanyCatalogAssignment" (
 "id" TEXT NOT NULL PRIMARY KEY,"companyId" TEXT NOT NULL,"catalogId" TEXT NOT NULL,
 "employeeId" TEXT,"materialId" TEXT,"kind" TEXT NOT NULL,"codeSnapshot" TEXT NOT NULL,"labelSnapshot" TEXT NOT NULL,
 "validUntil" TIMESTAMP(3),"checkedAt" TIMESTAMP(3),"notes" TEXT,"active" BOOLEAN NOT NULL DEFAULT true,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "CompanyCatalogAssignment_target_check" CHECK (("kind"='LICENSE_CLASS' AND "employeeId" IS NOT NULL AND "materialId" IS NULL) OR ("kind"='HAZARD_CLASS' AND "materialId" IS NOT NULL AND "employeeId" IS NULL AND "validUntil" IS NULL)),
 CONSTRAINT "CompanyCatalogAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "CompanyCatalogAssignment_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "CompanyMasterCatalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "CompanyCatalogAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "CompanyEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "CompanyCatalogAssignment_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "CompanyMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CompanyCatalogAssignment_employeeId_catalogId_key" ON "CompanyCatalogAssignment"("employeeId","catalogId");
CREATE UNIQUE INDEX "CompanyCatalogAssignment_materialId_catalogId_key" ON "CompanyCatalogAssignment"("materialId","catalogId");
CREATE INDEX "CompanyCatalogAssignment_companyId_kind_active_idx" ON "CompanyCatalogAssignment"("companyId","kind","active");

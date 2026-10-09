CREATE TABLE "CompanyMasterCatalog" (
 "id" TEXT NOT NULL PRIMARY KEY,"companyId" TEXT NOT NULL,"kind" TEXT NOT NULL,"code" TEXT NOT NULL,"label" TEXT NOT NULL,"symbol" TEXT,"notes" TEXT,"active" BOOLEAN NOT NULL DEFAULT true,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "CompanyMasterCatalog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "CompanyMasterCatalog_kind_check" CHECK ("kind" IN ('UNIT','LICENSE_CLASS','HAZARD_CLASS','COST_CENTER_AREA')),
 CONSTRAINT "CompanyMasterCatalog_code_check" CHECK ("code" ~ '^[A-Z0-9][A-Z0-9_.+-]{0,39}$')
);
CREATE UNIQUE INDEX "CompanyMasterCatalog_companyId_kind_code_key" ON "CompanyMasterCatalog"("companyId","kind","code");
CREATE INDEX "CompanyMasterCatalog_companyId_kind_active_idx" ON "CompanyMasterCatalog"("companyId","kind","active");

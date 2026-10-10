ALTER TABLE "ContractCertificate" ADD COLUMN "supplierPartyId" TEXT;
ALTER TABLE "ContractCertificate" ADD CONSTRAINT "ContractCertificate_supplierPartyId_fkey" FOREIGN KEY ("supplierPartyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ContractCertificate_companyId_supplierPartyId_projectId_idx" ON "ContractCertificate"("companyId","supplierPartyId","projectId");

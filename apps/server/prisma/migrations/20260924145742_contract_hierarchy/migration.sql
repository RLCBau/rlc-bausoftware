ALTER TABLE "Contract" ADD COLUMN "parentContractId" TEXT;
CREATE INDEX "Contract_parentContractId_idx" ON "Contract"("parentContractId");
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_parentContractId_fkey" FOREIGN KEY ("parentContractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

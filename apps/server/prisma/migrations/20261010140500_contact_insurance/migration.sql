CREATE TABLE "PartyInsurancePolicy" (
 "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "partyId" TEXT NOT NULL,
 "title" TEXT NOT NULL, "insurer" TEXT NOT NULL, "policyNumber" TEXT NOT NULL, "type" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'Entwurf', "validFrom" DATE NOT NULL, "validUntil" DATE, "cancellationUntil" DATE,
 "coverage" DECIMAL(18,2), "annualPremium" DECIMAL(18,2), "notes" TEXT NOT NULL DEFAULT '',
 "revision" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "PartyInsurancePolicy_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "PartyInsurancePolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "PartyInsurancePolicy_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PartyInsurancePolicy_partyId_insurer_policyNumber_key" ON "PartyInsurancePolicy"("partyId","insurer","policyNumber");
CREATE INDEX "PartyInsurancePolicy_companyId_partyId_status_idx" ON "PartyInsurancePolicy"("companyId","partyId","status");
CREATE INDEX "PartyInsurancePolicy_companyId_validUntil_idx" ON "PartyInsurancePolicy"("companyId","validUntil");

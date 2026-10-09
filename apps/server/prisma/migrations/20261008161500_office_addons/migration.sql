-- CreateTable
CREATE TABLE "ProjectGuarantee" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "contractId" TEXT,
    "documentId" TEXT,
    "title" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Entwurf',
    "amount" DECIMAL(14,2) NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "notes" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectGuarantee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractCertificate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "documentId" TEXT,
    "title" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Ungeprüft',
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "notes" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectGuarantee_companyId_projectId_validUntil_idx" ON "ProjectGuarantee"("companyId", "projectId", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectGuarantee_companyId_projectId_number_key" ON "ProjectGuarantee"("companyId", "projectId", "number");

-- CreateIndex
CREATE INDEX "ContractCertificate_companyId_projectId_validUntil_idx" ON "ContractCertificate"("companyId", "projectId", "validUntil");

-- CreateIndex
CREATE INDEX "ContractCertificate_companyId_contractId_idx" ON "ContractCertificate"("companyId", "contractId");

-- AddForeignKey
ALTER TABLE "ProjectGuarantee" ADD CONSTRAINT "ProjectGuarantee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectGuarantee" ADD CONSTRAINT "ProjectGuarantee_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectGuarantee" ADD CONSTRAINT "ProjectGuarantee_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectGuarantee" ADD CONSTRAINT "ProjectGuarantee_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractCertificate" ADD CONSTRAINT "ContractCertificate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractCertificate" ADD CONSTRAINT "ContractCertificate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractCertificate" ADD CONSTRAINT "ContractCertificate_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractCertificate" ADD CONSTRAINT "ContractCertificate_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "ProjectGuarantee" ADD CONSTRAINT "ProjectGuarantee_amount_check" CHECK ("amount" >= 0);
ALTER TABLE "ProjectGuarantee" ADD CONSTRAINT "ProjectGuarantee_dates_check" CHECK ("validUntil" IS NULL OR "validFrom" IS NULL OR "validUntil" >= "validFrom");
ALTER TABLE "ContractCertificate" ADD CONSTRAINT "ContractCertificate_dates_check" CHECK ("validUntil" IS NULL OR "validFrom" IS NULL OR "validUntil" >= "validFrom");

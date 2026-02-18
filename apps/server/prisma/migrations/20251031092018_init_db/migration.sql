-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('ADMIN', 'BAULEITER', 'CAPOCANTIERE', 'MITARBEITER', 'KALKULATOR', 'BUCHHALTUNG', 'GAST');

-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('CAD', 'PDF', 'LV', 'IMAGE', 'DOC', 'OTHER');

-- CreateEnum
CREATE TYPE "Section" AS ENUM ('KALKULATION', 'MASSENERMITTLUNG', 'CAD', 'BUERO', 'KI', 'INFO', 'BUCHHALTUNG');

-- CreateEnum
CREATE TYPE "MeasurementSource" AS ENUM ('CAD', 'PDF', 'FOTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "PartyType" AS ENUM ('CUSTOMER', 'SUPPLIER', 'PARTNER');

-- DropForeignKey
ALTER TABLE "DeliveryNote" DROP CONSTRAINT "DeliveryNote_projectId_fkey";

-- DropForeignKey
ALTER TABLE "LVItem" DROP CONSTRAINT "LVItem_projectId_fkey";

-- DropForeignKey
ALTER TABLE "RegieReport" DROP CONSTRAINT "RegieReport_projectId_fkey";

-- CreateTable
CREATE TABLE "OfferVersion" (
    "id" SERIAL NOT NULL,
    "projectId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "positions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanTask" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dauerTage" INTEGER NOT NULL,
    "depsJson" TEXT NOT NULL,
    "ressJson" TEXT NOT NULL,

    CONSTRAINT "PlanTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceCapacity" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ResourceCapacity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanSnapshot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "ende" TIMESTAMP(3) NOT NULL,
    "json" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ProjectRole" NOT NULL,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageObject" (
    "id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorageObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "FileKind" NOT NULL,
    "name" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "currentVid" TEXT,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "storageId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LVHeader" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LVHeader_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LVPosition" (
    "id" TEXT NOT NULL,
    "lvId" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "kurztext" TEXT NOT NULL,
    "langtext" TEXT,
    "einheit" TEXT NOT NULL,
    "menge" DECIMAL(18,6) NOT NULL,
    "einzelpreis" DECIMAL(18,4),
    "gesamt" DECIMAL(18,2),
    "parentPos" TEXT,

    CONSTRAINT "LVPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeasurementSet" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeasurementSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeasurementRow" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "lvPositionId" TEXT,
    "source" "MeasurementSource" NOT NULL,
    "formula" TEXT,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unit" TEXT NOT NULL,
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeasurementRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectSectionState" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "section" "Section" NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectSectionState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Party" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "PartyType" NOT NULL,
    "name" TEXT NOT NULL,
    "vatId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" JSONB,

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingRoot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingRoot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),

    CONSTRAINT "TaxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "accountingId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "customerId" TEXT NOT NULL,
    "netAmount" DECIMAL(18,2) NOT NULL,
    "taxAmount" DECIMAL(18,2) NOT NULL,
    "grossAmount" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "data" JSONB,
    "pdfDocId" TEXT,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorBill" (
    "id" TEXT NOT NULL,
    "accountingId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "supplierId" TEXT NOT NULL,
    "netAmount" DECIMAL(18,2) NOT NULL,
    "taxAmount" DECIMAL(18,2) NOT NULL,
    "grossAmount" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "data" JSONB,
    "pdfDocId" TEXT,

    CONSTRAINT "VendorBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "accountingId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "method" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "data" JSONB,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "accountingId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "account" TEXT NOT NULL,
    "contraAccount" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "text" TEXT,
    "refType" TEXT,
    "refId" TEXT,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfferVersion_projectId_idx" ON "OfferVersion"("projectId");

-- CreateIndex
CREATE INDEX "PlanTask_projectId_idx" ON "PlanTask"("projectId");

-- CreateIndex
CREATE INDEX "ResourceCapacity_projectId_idx" ON "ResourceCapacity"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceCapacity_projectId_name_key" ON "ResourceCapacity"("projectId", "name");

-- CreateIndex
CREATE INDEX "PlanSnapshot_projectId_start_idx" ON "PlanSnapshot"("projectId", "start");

-- CreateIndex
CREATE INDEX "ProjectMember_projectId_role_idx" ON "ProjectMember"("projectId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");

-- CreateIndex
CREATE INDEX "StorageObject_bucket_key_idx" ON "StorageObject"("bucket", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Document_currentVid_key" ON "Document"("currentVid");

-- CreateIndex
CREATE INDEX "Document_projectId_kind_createdAt_idx" ON "Document"("projectId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "FileVersion_documentId_createdAt_idx" ON "FileVersion"("documentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FileVersion_documentId_version_key" ON "FileVersion"("documentId", "version");

-- CreateIndex
CREATE INDEX "LVHeader_projectId_idx" ON "LVHeader"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "LVHeader_projectId_version_key" ON "LVHeader"("projectId", "version");

-- CreateIndex
CREATE INDEX "LVPosition_lvId_position_idx" ON "LVPosition"("lvId", "position");

-- CreateIndex
CREATE INDEX "MeasurementSet_projectId_idx" ON "MeasurementSet"("projectId");

-- CreateIndex
CREATE INDEX "MeasurementRow_setId_idx" ON "MeasurementRow"("setId");

-- CreateIndex
CREATE INDEX "MeasurementRow_lvPositionId_idx" ON "MeasurementRow"("lvPositionId");

-- CreateIndex
CREATE INDEX "ProjectSectionState_projectId_idx" ON "ProjectSectionState"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectSectionState_projectId_section_key" ON "ProjectSectionState"("projectId", "section");

-- CreateIndex
CREATE INDEX "Party_companyId_type_name_idx" ON "Party"("companyId", "type", "name");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingRoot_projectId_key" ON "AccountingRoot"("projectId");

-- CreateIndex
CREATE INDEX "Invoice_date_status_idx" ON "Invoice"("date", "status");

-- CreateIndex
CREATE INDEX "Invoice_customerId_idx" ON "Invoice"("customerId");

-- CreateIndex
CREATE INDEX "Invoice_pdfDocId_idx" ON "Invoice"("pdfDocId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_accountingId_number_key" ON "Invoice"("accountingId", "number");

-- CreateIndex
CREATE INDEX "VendorBill_date_status_idx" ON "VendorBill"("date", "status");

-- CreateIndex
CREATE INDEX "VendorBill_supplierId_idx" ON "VendorBill"("supplierId");

-- CreateIndex
CREATE INDEX "VendorBill_pdfDocId_idx" ON "VendorBill"("pdfDocId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorBill_accountingId_number_key" ON "VendorBill"("accountingId", "number");

-- CreateIndex
CREATE INDEX "Payment_accountingId_date_idx" ON "Payment"("accountingId", "date");

-- CreateIndex
CREATE INDEX "LedgerEntry_accountingId_date_account_idx" ON "LedgerEntry"("accountingId", "date", "account");

-- CreateIndex
CREATE INDEX "ActivityLog_companyId_projectId_createdAt_idx" ON "ActivityLog"("companyId", "projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "LVItem" ADD CONSTRAINT "LVItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegieReport" ADD CONSTRAINT "RegieReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferVersion" ADD CONSTRAINT "OfferVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanTask" ADD CONSTRAINT "PlanTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceCapacity" ADD CONSTRAINT "ResourceCapacity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanSnapshot" ADD CONSTRAINT "PlanSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_currentVid_fkey" FOREIGN KEY ("currentVid") REFERENCES "FileVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileVersion" ADD CONSTRAINT "FileVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileVersion" ADD CONSTRAINT "FileVersion_storageId_fkey" FOREIGN KEY ("storageId") REFERENCES "StorageObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LVHeader" ADD CONSTRAINT "LVHeader_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LVPosition" ADD CONSTRAINT "LVPosition_lvId_fkey" FOREIGN KEY ("lvId") REFERENCES "LVHeader"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementSet" ADD CONSTRAINT "MeasurementSet_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementRow" ADD CONSTRAINT "MeasurementRow_setId_fkey" FOREIGN KEY ("setId") REFERENCES "MeasurementSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementRow" ADD CONSTRAINT "MeasurementRow_lvPositionId_fkey" FOREIGN KEY ("lvPositionId") REFERENCES "LVPosition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSectionState" ADD CONSTRAINT "ProjectSectionState_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Party" ADD CONSTRAINT "Party_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingRoot" ADD CONSTRAINT "AccountingRoot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_accountingId_fkey" FOREIGN KEY ("accountingId") REFERENCES "AccountingRoot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_pdfDocId_fkey" FOREIGN KEY ("pdfDocId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorBill" ADD CONSTRAINT "VendorBill_accountingId_fkey" FOREIGN KEY ("accountingId") REFERENCES "AccountingRoot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorBill" ADD CONSTRAINT "VendorBill_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorBill" ADD CONSTRAINT "VendorBill_pdfDocId_fkey" FOREIGN KEY ("pdfDocId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_accountingId_fkey" FOREIGN KEY ("accountingId") REFERENCES "AccountingRoot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_accountingId_fkey" FOREIGN KEY ("accountingId") REFERENCES "AccountingRoot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

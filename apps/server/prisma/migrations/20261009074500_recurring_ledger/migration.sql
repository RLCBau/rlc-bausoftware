
ALTER TABLE "LedgerEntry" ADD COLUMN "costCenter" TEXT;
CREATE TABLE "RecurringLedgerTemplate" (
 "id" TEXT NOT NULL PRIMARY KEY,"accountingId" TEXT NOT NULL,
 "title" TEXT NOT NULL,"text" TEXT NOT NULL,"account" TEXT NOT NULL,"contraAccount" TEXT NOT NULL,
 "amount" DECIMAL(18,2) NOT NULL,"costCenter" TEXT,"startDate" DATE NOT NULL,"endDate" DATE,
 "frequency" TEXT NOT NULL,"active" BOOLEAN NOT NULL DEFAULT true,"revision" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "RecurringLedgerTemplate_accountingId_fkey" FOREIGN KEY ("accountingId") REFERENCES "AccountingRoot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "RecurringLedgerTemplate_frequency_check" CHECK ("frequency" IN ('MONTHLY','QUARTERLY','YEARLY')),
 CONSTRAINT "RecurringLedgerTemplate_amount_check" CHECK ("amount" <> 0),
 CONSTRAINT "RecurringLedgerTemplate_dates_check" CHECK ("endDate" IS NULL OR "endDate" >= "startDate")
);
CREATE INDEX "RecurringLedgerTemplate_accountingId_active_idx" ON "RecurringLedgerTemplate"("accountingId","active");
CREATE TABLE "RecurringLedgerOccurrence" (
 "id" TEXT NOT NULL PRIMARY KEY,"templateId" TEXT NOT NULL,"date" DATE NOT NULL,"ledgerId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "RecurringLedgerOccurrence_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "RecurringLedgerTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "RecurringLedgerOccurrence_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "LedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RecurringLedgerOccurrence_templateId_date_key" ON "RecurringLedgerOccurrence"("templateId","date");
CREATE UNIQUE INDEX "RecurringLedgerOccurrence_ledgerId_key" ON "RecurringLedgerOccurrence"("ledgerId");
CREATE UNIQUE INDEX "LedgerEntry_manual_request_key" ON "LedgerEntry"("accountingId","refId") WHERE "refType"='MANUAL_REQUEST';

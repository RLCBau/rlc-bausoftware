-- CreateTable
CREATE TABLE "ProjectBid" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "documentId" TEXT,
    "title" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "packageKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'LV',
    "status" TEXT NOT NULL DEFAULT 'Entwurf',
    "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "positions" JSONB NOT NULL,
    "notes" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "awardedAt" TIMESTAMP(3),
    "awardedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectBid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectBid_companyId_projectId_packageKey_kind_idx" ON "ProjectBid"("companyId", "projectId", "packageKey", "kind");

-- AddForeignKey
ALTER TABLE "ProjectBid" ADD CONSTRAINT "ProjectBid_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBid" ADD CONSTRAINT "ProjectBid_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBid" ADD CONSTRAINT "ProjectBid_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "ProjectBid" ADD CONSTRAINT "ProjectBid_discount_check" CHECK ("discountPercent" BETWEEN 0 AND 100);
ALTER TABLE "ProjectBid" ADD CONSTRAINT "ProjectBid_positions_check" CHECK (jsonb_typeof("positions") = 'array');
CREATE UNIQUE INDEX "ProjectBid_one_award_per_package" ON "ProjectBid" ("companyId", "projectId", "packageKey", "kind") WHERE "awardedAt" IS NOT NULL;

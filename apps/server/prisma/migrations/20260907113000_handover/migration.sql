-- CreateTable
CREATE TABLE "CompanyHandover" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "projectId" TEXT,
    "client" TEXT,
    "address" TEXT,
    "date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ENTWURF',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyHandover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyHandoverItem" (
    "id" TEXT NOT NULL,
    "handoverId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyHandoverItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyHandoverSignature" (
    "id" TEXT NOT NULL,
    "handoverId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "name" TEXT,
    "signedAt" TIMESTAMP(3),
    "imageData" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyHandoverSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyHandoverAttachment" (
    "id" TEXT NOT NULL,
    "handoverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "storageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyHandoverAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyHandover_companyId_idx" ON "CompanyHandover"("companyId");

-- CreateIndex
CREATE INDEX "CompanyHandover_companyId_projectId_idx" ON "CompanyHandover"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "CompanyHandover_companyId_status_idx" ON "CompanyHandover"("companyId", "status");

-- CreateIndex
CREATE INDEX "CompanyHandover_companyId_date_idx" ON "CompanyHandover"("companyId", "date");

-- CreateIndex
CREATE INDEX "CompanyHandoverItem_handoverId_idx" ON "CompanyHandoverItem"("handoverId");

-- CreateIndex
CREATE INDEX "CompanyHandoverSignature_handoverId_idx" ON "CompanyHandoverSignature"("handoverId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyHandoverSignature_handoverId_role_key" ON "CompanyHandoverSignature"("handoverId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyHandoverAttachment_storageId_key" ON "CompanyHandoverAttachment"("storageId");

-- CreateIndex
CREATE INDEX "CompanyHandoverAttachment_handoverId_idx" ON "CompanyHandoverAttachment"("handoverId");

-- AddForeignKey
ALTER TABLE "CompanyHandoverItem" ADD CONSTRAINT "CompanyHandoverItem_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "CompanyHandover"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyHandoverSignature" ADD CONSTRAINT "CompanyHandoverSignature_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "CompanyHandover"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyHandoverAttachment" ADD CONSTRAINT "CompanyHandoverAttachment_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "CompanyHandover"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyHandoverAttachment" ADD CONSTRAINT "CompanyHandoverAttachment_storageId_fkey" FOREIGN KEY ("storageId") REFERENCES "StorageObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;


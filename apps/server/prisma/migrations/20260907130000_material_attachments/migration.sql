-- CreateTable
CREATE TABLE "CompanyMaterialAttachment" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "storageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyMaterialAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyMaterialAttachment_storageId_key" ON "CompanyMaterialAttachment"("storageId");

-- CreateIndex
CREATE INDEX "CompanyMaterialAttachment_materialId_createdAt_idx" ON "CompanyMaterialAttachment"("materialId", "createdAt");

-- AddForeignKey
ALTER TABLE "CompanyMaterialAttachment" ADD CONSTRAINT "CompanyMaterialAttachment_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "CompanyMaterial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyMaterialAttachment" ADD CONSTRAINT "CompanyMaterialAttachment_storageId_fkey" FOREIGN KEY ("storageId") REFERENCES "StorageObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;


CREATE TABLE "VorlageTemplate" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "companyId" TEXT,
    "sourceTemplateId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "categoryKey" TEXT NOT NULL,
    "categoryLabel" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'de',
    "outputType" TEXT NOT NULL DEFAULT 'DOCUMENT',
    "content" JSONB NOT NULL,
    "variables" JSONB NOT NULL,
    "tags" TEXT[],
    "isStandard" BOOLEAN NOT NULL DEFAULT false,
    "isProtected" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VorlageTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VorlageFavorite" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VorlageFavorite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VorlageDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "templateId" TEXT,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "values" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ENTWURF',
    "outputFormat" TEXT NOT NULL DEFAULT 'DOCUMENT',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VorlageDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VorlageTemplate_slug_key" ON "VorlageTemplate"("slug");
CREATE INDEX "VorlageTemplate_companyId_categoryKey_isActive_idx" ON "VorlageTemplate"("companyId", "categoryKey", "isActive");
CREATE INDEX "VorlageTemplate_isStandard_isActive_idx" ON "VorlageTemplate"("isStandard", "isActive");
CREATE INDEX "VorlageTemplate_title_idx" ON "VorlageTemplate"("title");
CREATE UNIQUE INDEX "VorlageFavorite_companyId_userId_templateId_key" ON "VorlageFavorite"("companyId", "userId", "templateId");
CREATE INDEX "VorlageFavorite_companyId_userId_idx" ON "VorlageFavorite"("companyId", "userId");
CREATE INDEX "VorlageDocument_companyId_projectId_updatedAt_idx" ON "VorlageDocument"("companyId", "projectId", "updatedAt");
CREATE INDEX "VorlageDocument_templateId_idx" ON "VorlageDocument"("templateId");

ALTER TABLE "VorlageTemplate"
ADD CONSTRAINT "VorlageTemplate_sourceTemplateId_fkey"
FOREIGN KEY ("sourceTemplateId") REFERENCES "VorlageTemplate"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "VorlageFavorite"
ADD CONSTRAINT "VorlageFavorite_templateId_fkey"
FOREIGN KEY ("templateId") REFERENCES "VorlageTemplate"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VorlageDocument"
ADD CONSTRAINT "VorlageDocument_templateId_fkey"
FOREIGN KEY ("templateId") REFERENCES "VorlageTemplate"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

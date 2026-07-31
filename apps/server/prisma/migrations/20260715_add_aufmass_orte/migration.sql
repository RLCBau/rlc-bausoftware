CREATE TABLE IF NOT EXISTS "AufmassOrt" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "nummer" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AufmassOrt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AufmassOrtPosition" (
    "ortId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AufmassOrtPosition_pkey" PRIMARY KEY ("ortId", "positionId")
);

CREATE INDEX IF NOT EXISTS "AufmassOrt_projectId_idx"
ON "AufmassOrt"("projectId");

CREATE INDEX IF NOT EXISTS "AufmassOrt_projectId_parentId_idx"
ON "AufmassOrt"("projectId", "parentId");

CREATE INDEX IF NOT EXISTS "AufmassOrt_projectId_sortOrder_idx"
ON "AufmassOrt"("projectId", "sortOrder");

CREATE INDEX IF NOT EXISTS "AufmassOrtPosition_positionId_idx"
ON "AufmassOrtPosition"("positionId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AufmassOrt_projectId_fkey'
  ) THEN
    ALTER TABLE "AufmassOrt"
    ADD CONSTRAINT "AufmassOrt_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AufmassOrt_parentId_fkey'
  ) THEN
    ALTER TABLE "AufmassOrt"
    ADD CONSTRAINT "AufmassOrt_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "AufmassOrt"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AufmassOrtPosition_ortId_fkey'
  ) THEN
    ALTER TABLE "AufmassOrtPosition"
    ADD CONSTRAINT "AufmassOrtPosition_ortId_fkey"
    FOREIGN KEY ("ortId") REFERENCES "AufmassOrt"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE INDEX IF NOT EXISTS idx_lvitem_trgm
ON "LVItem"
USING gin ((unaccent(("kurztext" || ' ' || coalesce("langtext",'')))) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_document_active
ON "Document" ("projectId","kind")
WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_ledger_project_date
ON "LedgerEntry" ("accountingId","date");

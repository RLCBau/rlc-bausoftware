#!/usr/bin/env bash
set -euo pipefail

cd /opt/rlc-bausoftware

SCHEMA="apps/server/prisma/schema.prisma"
ROUTE="apps/server/src/routes/aufmass.ts"
STAMP="$(date +%Y%m%d_%H%M%S)"

cp "$SCHEMA" "${SCHEMA}.bak_orte_${STAMP}"
cp "$ROUTE" "${ROUTE}.bak_orte_${STAMP}"

python3 <<'PY'
from pathlib import Path

schema_path = Path("apps/server/prisma/schema.prisma")
route_path = Path("apps/server/src/routes/aufmass.ts")

schema = schema_path.read_text(encoding="utf-8")
route = route_path.read_text(encoding="utf-8")

relation_line = "  aufmassOrte       AufmassOrt[]\n"
if relation_line not in schema:
    anchor = "  workflowDocs       WorkflowDoc[]\n"
    if anchor not in schema:
        raise SystemExit("ERRORE: anchor Project.workflowDocs non trovato")
    schema = schema.replace(anchor, anchor + relation_line, 1)

models = '''
model AufmassOrt {
  id          String   @id @default(uuid())
  projectId   String
  parentId    String?
  nummer      String
  name        String
  description String?
  color       String?
  sortOrder   Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  project   Project              @relation(fields: [projectId], references: [id], onDelete: Cascade)
  parent    AufmassOrt?          @relation("AufmassOrtTree", fields: [parentId], references: [id], onDelete: Cascade)
  children  AufmassOrt[]         @relation("AufmassOrtTree")
  positions AufmassOrtPosition[]

  @@index([projectId])
  @@index([projectId, parentId])
  @@index([projectId, sortOrder])
}

model AufmassOrtPosition {
  ortId      String
  positionId String
  createdAt  DateTime   @default(now())

  ort AufmassOrt @relation(fields: [ortId], references: [id], onDelete: Cascade)

  @@id([ortId, positionId])
  @@index([positionId])
}
'''
if "model AufmassOrt {" not in schema:
    schema = schema.rstrip() + "\n\n" + models.strip() + "\n"

schema_path.write_text(schema, encoding="utf-8")

prisma_import = 'import { prisma } from "../lib/prisma";\n'
if prisma_import not in route:
    anchor = 'import { PROJECTS_ROOT } from "../lib/projectsRoot";\n'
    if anchor not in route:
        raise SystemExit("ERRORE: import PROJECTS_ROOT non trovato")
    route = route.replace(anchor, anchor + prisma_import, 1)

routes = r'''
/* ============================================================
   3) ORTE / PROJEKTBEREICHE — PostgreSQL
   ============================================================ */

type OrtPayload = {
  id: string;
  parentId?: string | null;
  nummer: string;
  name: string;
  description?: string | null;
  color?: string | null;
  sortOrder?: number;
};

type OrtPositionPayload = {
  ortId: string;
  positionId: string;
};

async function resolveDbProject(projectIdOrCode: string) {
  const key = String(projectIdOrCode || "").trim();
  if (!key) return null;

  return prisma.project.findFirst({
    where: {
      OR: [{ id: key }, { code: key }],
    },
    select: { id: true, code: true },
  });
}

router.get("/orte/:projectId", async (req: Request, res: Response) => {
  try {
    const project = await resolveDbProject(req.params.projectId);
    if (!project) {
      return res.status(404).json({ error: "Projekt nicht gefunden" });
    }

    const orte = await prisma.aufmassOrt.findMany({
      where: { projectId: project.id },
      orderBy: [{ sortOrder: "asc" }, { nummer: "asc" }, { name: "asc" }],
      include: {
        positions: {
          select: { ortId: true, positionId: true },
        },
      },
    });

    return res.json({
      ok: true,
      projectId: project.id,
      projectCode: project.code,
      orte: orte.map(({ positions, ...ort }) => ort),
      links: orte.flatMap((ort) => ort.positions),
    });
  } catch (error) {
    console.error("GET Orte error", error);
    return res.status(500).json({ error: "Orte konnten nicht geladen werden" });
  }
});

router.put("/orte/:projectId", async (req: Request, res: Response) => {
  try {
    const project = await resolveDbProject(req.params.projectId);
    if (!project) {
      return res.status(404).json({ error: "Projekt nicht gefunden" });
    }

    const incomingOrte: OrtPayload[] = Array.isArray(req.body?.orte)
      ? req.body.orte
      : [];
    const incomingLinks: OrtPositionPayload[] = Array.isArray(req.body?.links)
      ? req.body.links
      : [];

    const normalizedOrte = incomingOrte.map((ort, index) => ({
      id: String(ort?.id || "").trim(),
      parentId: ort?.parentId ? String(ort.parentId).trim() : null,
      nummer: String(ort?.nummer || "").trim(),
      name: String(ort?.name || "").trim(),
      description: ort?.description ? String(ort.description) : null,
      color: ort?.color ? String(ort.color) : null,
      sortOrder: Number.isFinite(Number(ort?.sortOrder))
        ? Number(ort.sortOrder)
        : index,
    }));

    if (normalizedOrte.some((ort) => !ort.id || !ort.nummer || !ort.name)) {
      return res.status(400).json({
        error: "Jeder Ort benötigt ID, Nummer und Bezeichnung",
      });
    }

    const ortIds = new Set(normalizedOrte.map((ort) => ort.id));

    if (
      normalizedOrte.some(
        (ort) => ort.parentId && !ortIds.has(ort.parentId),
      )
    ) {
      return res.status(400).json({
        error: "Ungültige Parent-ID in der Orte-Struktur",
      });
    }

    const normalizedLinks = incomingLinks
      .map((link) => ({
        ortId: String(link?.ortId || "").trim(),
        positionId: String(link?.positionId || "").trim(),
      }))
      .filter(
        (link) =>
          link.ortId &&
          link.positionId &&
          ortIds.has(link.ortId),
      );

    const uniqueLinks = Array.from(
      new Map(
        normalizedLinks.map((link) => [
          `${link.ortId}:${link.positionId}`,
          link,
        ]),
      ).values(),
    );

    await prisma.$transaction(async (tx) => {
      await tx.aufmassOrt.deleteMany({
        where: { projectId: project.id },
      });

      const pending = [...normalizedOrte];
      const created = new Set<string>();

      while (pending.length) {
        const ready = pending.filter(
          (ort) => !ort.parentId || created.has(ort.parentId),
        );

        if (!ready.length) {
          throw new Error("Zyklische oder ungültige Orte-Hierarchie");
        }

        for (const ort of ready) {
          await tx.aufmassOrt.create({
            data: {
              id: ort.id,
              projectId: project.id,
              parentId: ort.parentId,
              nummer: ort.nummer,
              name: ort.name,
              description: ort.description,
              color: ort.color,
              sortOrder: ort.sortOrder,
            },
          });

          created.add(ort.id);
          const idx = pending.findIndex((item) => item.id === ort.id);
          if (idx >= 0) pending.splice(idx, 1);
        }
      }

      if (uniqueLinks.length) {
        await tx.aufmassOrtPosition.createMany({
          data: uniqueLinks,
          skipDuplicates: true,
        });
      }
    });

    return res.json({
      ok: true,
      projectId: project.id,
      projectCode: project.code,
      ortCount: normalizedOrte.length,
      linkCount: uniqueLinks.length,
    });
  } catch (error: any) {
    console.error("PUT Orte error", error);
    return res.status(500).json({
      error: error?.message || "Orte konnten nicht gespeichert werden",
    });
  }
});
'''

if 'router.get("/orte/:projectId"' not in route:
    marker = "\nexport default router;"
    if marker not in route:
        raise SystemExit("ERRORE: export default router non trovato")
    route = route.replace(marker, "\n" + routes.strip() + marker, 1)

route_path.write_text(route, encoding="utf-8")
PY

MIGRATION_DIR="apps/server/prisma/migrations/20260715_add_aufmass_orte"
mkdir -p "$MIGRATION_DIR"

cat > "$MIGRATION_DIR/migration.sql" <<'SQL'
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
SQL

echo "Patch applicata."

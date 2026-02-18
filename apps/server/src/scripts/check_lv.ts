// src/scripts/check_lv.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Zeigt Infos zum LV eines Projekts:
 * - Anzahl LVHeader
 * - Anzahl Positionen pro Header
 *
 *   npx ts-node src/scripts/check_lv.ts BA-2025-DEMO
 */

async function main() {
  const arg = process.argv[2];

  if (!arg) {
    console.error("Bitte Projekt-ID oder Code angeben.");
    process.exit(1);
  }

  const project = await prisma.project.findFirst({
    where: { OR: [{ id: arg }, { code: arg }] },
  });

  if (!project) {
    console.error("❌ Projekt nicht gefunden.");
    process.exit(1);
  }

  console.log(`Projekt: ${project.code} – ${project.name}`);

  const headers = await prisma.lVHeader.findMany({
    where: { projectId: project.id },
    orderBy: { version: "asc" },
  });

  if (headers.length === 0) {
    console.log("⚠️ Keine LVHeader vorhanden.");
    return;
  }

  for (const h of headers) {
    const count = await prisma.lVPosition.count({ where: { lvId: h.id } });
    console.log(
      `LV-Version ${h.version}: "${h.title}" – Positionen: ${count} (id=${h.id})`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

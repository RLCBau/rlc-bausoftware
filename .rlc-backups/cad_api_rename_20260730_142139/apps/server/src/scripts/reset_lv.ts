// src/scripts/reset_lv.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Löscht alle LVHeader + LVPosition eines Projekts.
 *
 *   npx ts-node src/scripts/reset_lv.ts BA-2025-DEMO
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
    select: { id: true },
  });

  if (headers.length === 0) {
    console.log("Kein LV für dieses Projekt vorhanden.");
    return;
  }

  const ids = headers.map((h) => h.id);

  console.log(`🗑 Lösche ${ids.length} LV-Version(en) + Positionen...`);

  await prisma.lVPosition.deleteMany({ where: { lvId: { in: ids } } });
  await prisma.lVHeader.deleteMany({ where: { id: { in: ids } } });

  console.log("✅ LV für dieses Projekt zurückgesetzt.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

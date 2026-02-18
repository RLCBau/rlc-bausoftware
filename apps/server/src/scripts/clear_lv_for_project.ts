// apps/server/src/scripts/clear_lv_for_project.ts
import { prisma } from "../lib/prisma";

/**
 * Script: alle LV-Daten (Header + Positionen) für ein Projekt löschen.
 *
 * Aufruf-Beispiel:
 *   npx ts-node src/scripts/clear_lv_for_project.ts BA-2025-001
 */
async function main() {
  const projectCode = process.argv[2];

  if (!projectCode) {
    console.error("❌   Bitte Projekt-Code angeben, z.B.:");
    console.error("     npx ts-node src/scripts/clear_lv_for_project.ts BA-2025-001");
    process.exit(1);
  }

  console.log("🔍 Suche Projekt mit Code / Nummer:", projectCode);

  const project =
    (await prisma.project.findFirst({
      where: {
        OR: [{ code: projectCode }, { number: projectCode }],
      },
    })) || null;

  if (!project) {
    console.error("❌ Projekt nicht gefunden:", projectCode);
    process.exit(1);
  }

  console.log("✅ Projekt gefunden:", project.code, "-", project.name);

  const projectId = project.id;

  // ---- LVHeader zu diesem Projekt holen ----
  const headers = await prisma.lVHeader.findMany({
    where: { projectId },
    select: { id: true, title: true },
  });

  if (headers.length === 0) {
    console.log("ℹ️  Für dieses Projekt existiert kein LVHeader – nichts zu löschen.");
    return;
  }

  const headerIds = headers.map((h) => h.id);
  console.log("📌 Gefundene LVHeader:", headerIds.length);

  // ---- ZUERST alle Positionen löschen (mit lvId IN headerIds) ----
  console.log("🗑  Lösche LVPosition-Einträge …");
  await prisma.lVPosition.deleteMany({
    where: {
      // ⚠️ HIER war vorher der Fehler: es gibt KEIN 'lvHeaderId'
      // Richtig ist das Feld 'lvId', wie im Seed-Script verwendet.
      lvId: { in: headerIds },
    },
  });

  // ---- Danach die Header löschen ----
  console.log("🗑  Lösche LVHeader-Einträge …");
  await prisma.lVHeader.deleteMany({
    where: { projectId },
  });

  console.log(
    `✅ LV für Projekt ${project.code} komplett gelöscht (Header + Positionen).`
  );
}

main()
  .catch((err) => {
    console.error("❌ Fehler im Clear-Script:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

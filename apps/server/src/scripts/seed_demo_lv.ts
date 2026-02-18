// apps/server/src/scripts/seed_demo_lv.ts
import { prisma } from "../lib/prisma";
import fs from "fs/promises";
import path from "path";

const PROJECTS_ROOT =
  process.env.PROJECTS_ROOT || path.join(process.cwd(), "data", "projects");

/**
 * Script: LV DEMO eintragen + automatisch lv.json erzeugen
 *
 * Usage:
 *    npx ts-node src/scripts/seed_demo_lv.ts BA-2025-DEMO
 *
 * 👉 Wirken *nur* auf das angegebene Projekt.
 */
async function main() {
  const projectCode = process.argv[2];

  if (!projectCode) {
    console.error("❌   Bitte Projekt-Code angeben, z.B.:");
    console.error("     npx ts-node src/scripts/seed_demo_lv.ts BA-2025-DEMO");
    process.exit(1);
  }

  console.log("🔍 Suche Projekt mit Code:", projectCode);

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

  // Alte LVHeader/LVPosition löschen
  console.log("🗑  Lösche alte LV-Header & LV-Positionen …");

  // zuerst alle Header holen
  const headers = await prisma.lVHeader.findMany({
    where: { projectId },
    select: { id: true },
  });
  const headerIds = headers.map((h) => h.id);

  if (headerIds.length > 0) {
    await prisma.lVPosition.deleteMany({
      where: { lvId: { in: headerIds } },
    });
  }
  await prisma.lVHeader.deleteMany({ where: { projectId } });

  console.log("🆕 Erzeuge neuen LVHeader …");

  const header = await prisma.lVHeader.create({
    data: {
      projectId,
      title: "LV DEMO",
      currency: "EUR",
      version: 1,
    },
  });

  console.log("📌 LVHeader angelegt:", header.id);

  const items: any[] = [];

  for (let i = 1; i <= 300; i++) {
    const pos = `${String(i).padStart(3, "0")}.001`;

    items.push({
      lvId: header.id,
      position: pos,
      kurztext: `Beispiel Position ${i}`,
      langtext: `Dies ist die ausführliche Beschreibung der Position ${i}.`,
      einheit: "m",
      menge: 10,
      einzelpreis: 25,
      gesamt: 250,
      parentPos: null,
    });
  }

  console.log(`📝 Insert von ${items.length} LV-Positionen …`);

  await prisma.lVPosition.createMany({ data: items });

  console.log(
    `✅ LV DEMO komplett eingetragen. Projekt: ${projectCode} Positionen: ${items.length}`
  );

  // ---------- lv.json erzeugen ----------
  const safeFolder =
    project.code?.replace(/[^A-Za-z0-9_\-]/g, "_") || projectId;

  const projectFolder = path.join(PROJECTS_ROOT, safeFolder);
  await fs.mkdir(projectFolder, { recursive: true });

  const lvJsonPath = path.join(projectFolder, "lv.json");

  const exportItems = items.map((p) => ({
    id: p.position,
    pos: p.position,
    text: p.kurztext,
    unit: p.einheit,
    quantity: p.menge,
    ep: p.einzelpreis,
  }));

  const jsonData = {
    project: project.code,
    title: "LV DEMO",
    currency: "EUR",
    items: exportItems,
  };

  await fs.writeFile(lvJsonPath, JSON.stringify(jsonData, null, 2), "utf-8");

  console.log("📁 lv.json erstellt unter:");
  console.log("   → " + lvJsonPath);
  console.log("\n🎉 Fertig! DB + lv.json sind jetzt synchron.\n");
}

main().catch((err) => {
  console.error("❌ Fehler im Seed-Script:", err);
  process.exit(1);
});

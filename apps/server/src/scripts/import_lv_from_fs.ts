// src/scripts/import_lv_from_fs.ts
import fs from "fs";
import path from "path";
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

type FsLvRow = {
  pos: string;
  text: string;
  unit: string;
  ep?: number;
  soll?: number;
  langtext?: string;
};

async function main() {
  const arg = process.argv[2];

  if (!arg) {
    console.error("❌ Bitte Projekt-ID oder -Code als Argument angeben.");
    console.error("   Beispiel: npx ts-node src/scripts/import_lv_from_fs.ts BA-2025-DEMO");
    process.exit(1);
  }

  console.log("🔧 Importiere LV aus lv.json für Projekt:", arg);

  const project = await prisma.project.findFirst({
    where: {
      OR: [{ id: arg }, { code: arg }],
    },
  });

  if (!project) {
    console.error("❌ Projekt mit ID/Code nicht gefunden:", arg);
    process.exit(1);
  }

  console.log("✅ Projekt gefunden:", project.code, "-", project.name);

  const projectsRoot = path.resolve(__dirname, "..", "..", "data", "projects");
  console.log("📁 Projects root:", projectsRoot);

  if (!fs.existsSync(projectsRoot)) {
    console.error("❌ Projects-Root nicht gefunden:", projectsRoot);
    process.exit(1);
  }

  const projFolder = path.join(projectsRoot, project.id);

  if (!fs.existsSync(projFolder)) {
    console.error("❌ Projektordner nicht gefunden:", projFolder);
    process.exit(1);
  }

  const lvPath = path.join(projFolder, "lv.json");

  if (!fs.existsSync(lvPath)) {
    console.error("❌ lv.json nicht gefunden:", lvPath);
    process.exit(1);
  }

  console.log("📄 Lese lv.json:", lvPath);
  const raw = fs.readFileSync(lvPath, "utf8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error("❌ Konnte lv.json nicht parsen:", e);
    process.exit(1);
  }

  if (!Array.isArray(parsed)) {
    console.error("❌ Erwartet ein Array in lv.json ([])");
    process.exit(1);
  }

  const rows = parsed as FsLvRow[];

  if (rows.length === 0) {
    console.error("❌ lv.json enthält keine Positionen.");
    process.exit(1);
  }

  console.log("✅ lv.json enthält", rows.length, "Positionen.");

  // Alte LV-Version(en) löschen
  const oldHeaders = await prisma.lVHeader.findMany({
    where: { projectId: project.id },
    select: { id: true },
  });

  if (oldHeaders.length > 0) {
    console.log("🧹 Lösche vorhandene LV-Versionen (%d)...", oldHeaders.length);
    const headerIds = oldHeaders.map((h) => h.id);
    await prisma.lVPosition.deleteMany({
      where: { lvId: { in: headerIds } },
    });
    await prisma.lVHeader.deleteMany({
      where: { id: { in: headerIds } },
    });
  }

  // Neue Version = 1 (oder max+1, wenn du willst – hier 1 für sauberen Import)
  const header = await prisma.lVHeader.create({
    data: {
      projectId: project.id,
      title: "LV aus lv.json",
      version: 1,
      currency: "EUR",
    },
  });

  console.log("🆕 LVHeader angelegt:", header.id);

  const data: Prisma.LVPositionCreateManyInput[] = rows.map((r, idx) => {
    const mengeVal = r.soll ?? 0;
    const epVal = r.ep ?? 0;
    const gesamtVal = mengeVal * epVal;

    return {
      lvId: header.id,
      position: r.pos || `001.${(idx + 1).toString().padStart(3, "0")}`,
      kurztext: r.text || "Position ohne Kurztext",
      langtext: r.langtext ?? null,
      einheit: r.unit || "St",
      menge: new Prisma.Decimal(mengeVal),
      einzelpreis: new Prisma.Decimal(epVal.toFixed(2)),
      gesamt: new Prisma.Decimal(gesamtVal.toFixed(2)),
      parentPos: undefined,
    };
  });

  console.log("➡️  Insert von", data.length, "LV-Positionen aus lv.json…");
  await prisma.lVPosition.createMany({ data });

  console.log("✅ Import abgeschlossen. Projekt:", project.code);
}

main()
  .catch((e) => {
    console.error("Fehler beim Import lv.json → DB:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

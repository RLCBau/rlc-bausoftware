// src/scripts/import_lv.ts
import { PrismaClient } from "@prisma/client";
import fs from "fs";

const prisma = new PrismaClient();

/**
 * Importiert ein LV aus JSON (Format wie export_lv.ts)
 * und legt eine neue LV-Version an.
 *
 *   npx ts-node src/scripts/import_lv.ts BA-2025-DEMO pfad/zum/lv.json
 */

async function main() {
  const arg = process.argv[2];
  const filePath = process.argv[3];

  if (!arg || !filePath) {
    console.error("Usage: import_lv <Projekt-ID|Code> <Datei.json>");
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error("❌ Datei nicht gefunden:", filePath);
    process.exit(1);
  }

  const project = await prisma.project.findFirst({
    where: { OR: [{ id: arg }, { code: arg }] },
  });

  if (!project) {
    console.error("❌ Projekt nicht gefunden.");
    process.exit(1);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const json = JSON.parse(raw);

  const lastHeader = await prisma.lVHeader.findFirst({
    where: { projectId: project.id },
    orderBy: { version: "desc" },
  });

  const newVersion = (lastHeader?.version ?? 0) + 1;

  const header = await prisma.lVHeader.create({
    data: {
      projectId: project.id,
      title:
        json.header?.title ??
        `Importiertes LV (${project.code || project.id})`,
      version: newVersion,
      currency: json.header?.currency ?? "EUR",
    },
  });

  const positions = (json.positions ?? []) as any[];

  if (!Array.isArray(positions) || positions.length === 0) {
    console.error("⚠️ Keine Positionen im JSON gefunden.");
    return;
  }

  await prisma.lVPosition.createMany({
    data: positions.map((p) => ({
      lvId: header.id,
      position: p.position,
      kurztext: p.kurztext ?? p.shortText ?? p.text ?? "",
      langtext: p.langtext ?? p.longText ?? p.text ?? "",
      einheit: p.einheit ?? p.unit ?? "",
      menge: p.menge ?? p.quantity ?? 0,
      einzelpreis: p.einzelpreis ?? p.unitPrice ?? 0,
      gesamt:
        p.gesamt ??
        p.total ??
        (p.menge != null && p.einzelpreis != null
          ? Math.round(p.menge * p.einzelpreis * 100) / 100
          : 0),
    })),
  });

  console.log(
    `✅ LV-Import abgeschlossen. Neue Version: ${header.version} (id=${header.id})`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

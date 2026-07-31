// src/scripts/export_lv.ts
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

/**
 * Exportiert das aktuelle LV eines Projekts in JSON.
 *
 *   npx ts-node src/scripts/export_lv.ts BA-2025-DEMO
 *   npx ts-node src/scripts/export_lv.ts BA-2025-DEMO out/lv_demo.json
 */

async function main() {
  const arg = process.argv[2];
  const outArg = process.argv[3];

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

  const header = await prisma.lVHeader.findFirst({
    where: { projectId: project.id },
    orderBy: { version: "desc" },
  });

  if (!header) {
    console.error("⚠️ Kein LVHeader vorhanden.");
    process.exit(1);
  }

  const positions = await prisma.lVPosition.findMany({
    where: { lvId: header.id },
    orderBy: { position: "asc" },
  });

  const payload = {
    project: {
      id: project.id,
      code: project.code,
      name: project.name,
    },
    header: {
      id: header.id,
      title: header.title,
      version: header.version,
      currency: header.currency,
    },
    positions,
  };

  const outPath =
    outArg ??
    path.join(
      process.cwd(),
      `lv_export_${project.code || project.id}_v${header.version}.json`,
    );

  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
  console.log(`✅ LV exportiert nach: ${outPath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const rows = [
    // esempi (metti i tuoi refKey reali, presi dai recipeComponent.refKey)
    { refKey: "LABOR_FACHARBEITER_H", title: "Facharbeiter", type: "LABOR", unit: "h", priceNet: 52 },
    { refKey: "MACHINE_BAGGER_14T_H", title: "Bagger 14t", type: "MACHINE", unit: "h", priceNet: 95 },
    { refKey: "MATERIAL_PEHD_DN110_M", title: "PEHD DN110", type: "MATERIAL", unit: "m", priceNet: 18 },
    { refKey: "DISPOSAL_DK0_M3", title: "Entsorgung DK0", type: "DISPOSAL", unit: "m3", priceNet: 12 },
  ];

  for (const r of rows) {
    await prisma.priceItem.upsert({
      where: { refKey: r.refKey },
      update: r,
      create: r,
    });
  }

  console.log("[seed.prices] done", { count: rows.length });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());

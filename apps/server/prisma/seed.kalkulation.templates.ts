import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { CATALOG_V1 } from "./kalkulation/catalog.v1";

const prisma = new PrismaClient();

async function main() {
  console.log("[seed] kalkulation templates: start");

  let upsertedTemplates = 0;
  let upsertedComponents = 0;

  for (const t of CATALOG_V1) {
    const tpl = await prisma.recipeTemplate.upsert({
      where: { key: t.key },
      update: {
        title: t.title,
        category: t.category,
        unit: t.unit,
        description: t.description ?? null,
        paramsJson: t.paramsJson ?? null,
        tags: t.tags ?? [],
      },
      create: {
        key: t.key,
        title: t.title,
        category: t.category,
        unit: t.unit,
        description: t.description ?? null,
        paramsJson: t.paramsJson ?? null,
        tags: t.tags ?? [],
      },
      select: { id: true, key: true },
    });

    upsertedTemplates++;

    // Strategy: components per template = replace (idempotente e pulito)
    await prisma.recipeComponent.deleteMany({ where: { templateId: tpl.id } });

    if (t.components?.length) {
      await prisma.recipeComponent.createMany({
        data: t.components
          .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
          .map((c, idx) => ({
            templateId: tpl.id,
            type: c.type as any,
            refKey: c.refKey,
            qtyFormula: c.qtyFormula,
            mandatory: c.mandatory ?? true,
            riskFactor: (c.riskFactor ?? 1.0) as any,
            sort: c.sort ?? idx,
            note: c.note ?? null,
          })),
      });
      upsertedComponents += t.components.length;
    }
  }

  const [templatesCount, componentsCount, variantsCount] = await Promise.all([
    prisma.recipeTemplate.count(),
    prisma.recipeComponent.count(),
    prisma.recipeVariant.count(),
  ]);

  console.log("[seed] done", {
    upsertedTemplates,
    upsertedComponents,
    templatesCount,
    componentsCount,
    variantsCount,
  });
}

main()
  .catch((e) => {
    console.error("[seed] error", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

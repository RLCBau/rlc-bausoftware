import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

/**
 * Catalog seed:
 * - Legge TUTTI i JSON in prisma/datasets/kalkulation/*.json (che contengono {version, templates:[]})
 * - Merge per template.key (se duplicati, vince l’ultimo file in ordine alfabetico)
 * - Upsert recipeTemplate + delete/recreate recipeComponent (idempotente)
 */

type Dataset = {
  version: number;
  templates: Array<{
    key: string;
    title: string;
    category: string;
    unit: string;
    description?: string;
    tags?: string[];
    paramsJson?: any;
    components: Array<{
      type: "LABOR" | "MACHINE" | "MATERIAL" | "DISPOSAL" | "SURFACE" | "OTHER";
      refKey: string;
      qtyFormula: string;
      mandatory?: boolean;
      riskFactor?: string; // decimal string, es "1.0000"
      sort?: number;
      note?: string;
    }>;
  }>;
};

function readAllDatasets(): Array<{ file: string; ds: Dataset }> {
  const dir = path.join(process.cwd(), "prisma", "datasets", "kalkulation");
  if (!fs.existsSync(dir)) {
    console.warn(`[seed] datasets dir missing: ${dir}`);
    return [];
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));

  const out: Array<{ file: string; ds: Dataset }> = [];

  for (const f of files) {
    const full = path.join(dir, f);
    try {
      const raw = fs.readFileSync(full, "utf8");
      const parsed = JSON.parse(raw) as Dataset;

      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.templates)) {
        console.warn(`[seed] skip invalid dataset (no templates[]): ${f}`);
        continue;
      }
      out.push({ file: f, ds: parsed });
    } catch (e) {
      console.warn(`[seed] skip unreadable dataset: ${f}`, e);
    }
  }

  return out;
}

async function main() {
  console.log("[seed] kalkulation catalog: start");

  const datasets = readAllDatasets();

  console.log(`[seed] datasets found: ${datasets.length}`);
  if (!datasets.length) {
    console.log("[seed] nothing to import (no datasets).");
    const [templatesCount, componentsCount, variantsCount] = await Promise.all([
      prisma.recipeTemplate.count(),
      prisma.recipeComponent.count(),
      prisma.recipeVariant.count(),
    ]);
    console.log("[seed] done (noop)", { templatesCount, componentsCount, variantsCount });
    return;
  }

  // merge templates by key (last one wins)
  const merged = new Map<
    string,
    Dataset["templates"][number] & { __sourceFile: string; __dsVersion: number }
  >();

  let totalTemplatesRead = 0;

  for (const { file, ds } of datasets) {
    totalTemplatesRead += ds.templates.length;
    for (const t of ds.templates) {
      if (!t?.key) continue;
      merged.set(t.key, { ...t, __sourceFile: file, __dsVersion: ds.version });
    }
  }

  console.log(
    `[seed] total templates read: ${totalTemplatesRead}, unique keys: ${merged.size}`
  );

  let upserted = 0;
  let componentsInserted = 0;

  for (const t of merged.values()) {
    // 1) upsert template
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

    upserted++;

    // 2) sync components: delete + recreate
    await prisma.recipeComponent.deleteMany({ where: { templateId: tpl.id } });

    const comps = Array.isArray(t.components) ? t.components : [];
    if (comps.length) {
      await prisma.recipeComponent.createMany({
        data: comps.map((c, idx) => {
          const sort = Number.isFinite(c.sort as any) ? (c.sort as number) : idx;

          return {
            templateId: tpl.id,
            type: c.type as any, // enum Prisma accetta string literal compatibile
            refKey: c.refKey,
            qtyFormula: c.qtyFormula,
            mandatory: c.mandatory ?? true,
            // se riskFactor nel tuo schema è Decimal:
            riskFactor: new Prisma.Decimal((c.riskFactor ?? "1.0000").toString()),
            sort,
            note: c.note ?? null,
          };
        }),
      });

      componentsInserted += comps.length;
    }
  }

  const [templatesCount, componentsCount, variantsCount] = await Promise.all([
    prisma.recipeTemplate.count(),
    prisma.recipeComponent.count(),
    prisma.recipeVariant.count(),
  ]);

  console.log("[seed] done", {
    datasets: datasets.length,
    totalTemplatesRead,
    uniqueTemplatesImported: merged.size,
    upsertedTemplates: upserted,
    componentsInserted,
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

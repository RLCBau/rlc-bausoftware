// prisma/seed.kalkulation.templates.block16.geotechnik_bodenverbesserung.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * BLOCK 16 – GEOTECHNIK / BODENVERBESSERUNG
 * Fokus: Bodenaustausch, Geotextil, Geogitter, Stabilisierung, Frostschutz
 */

type TemplateDef = {
  key: string;
  title: string;
  unit: string;
  category: string;
  tags?: string[];
  paramsJson?: any;
  components: Array<{ type: "LABOR" | "MACHINE" | "MATERIAL" | "DISPOSAL" | "SURFACE" | "OTHER"; refKey: string; qtyFormula: string }>;
};

const CAT = "GEOTECHNIK_BODENVERBESSERUNG";

const templates: TemplateDef[] = [
  {
    key: "GT_BODENAUSTAUSCH_FROSTSCHUTZ",
    title: "Bodenaustausch / Frostschutzschicht herstellen",
    unit: "m3",
    category: CAT,
    tags: ["Frostschutz", "Austausch"],
    paramsJson: { defaultParams: { volume_m3: 50, disposalClass: "Z1.1" } },
    components: [
      { type: "MACHINE", refKey: "MACHINE:BAGGER_14_22T", qtyFormula: "volume_m3 / 60" },
      { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "volume_m3 / 12" },
      { type: "DISPOSAL", refKey: "DISPOSAL:AUSHUB", qtyFormula: "volume_m3" },
      { type: "MATERIAL", refKey: "MATERIAL:FROSTSCHUTZ", qtyFormula: "volume_m3 * 1.05" },
    ],
  },
  {
    key: "GT_GEOTEXTIL_VERLEGEN",
    title: "Geotextil verlegen (Trennlage)",
    unit: "m2",
    category: CAT,
    tags: ["Geotextil"],
    paramsJson: { defaultParams: { area_m2: 200 } },
    components: [
      { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "area_m2 / 250" },
      { type: "MATERIAL", refKey: "MATERIAL:GEOTEXTIL", qtyFormula: "area_m2 * 1.05" },
    ],
  },
  {
    key: "GT_GEOGITTER_VERLEGEN",
    title: "Geogitter verlegen",
    unit: "m2",
    category: CAT,
    tags: ["Geogitter"],
    paramsJson: { defaultParams: { area_m2: 200 } },
    components: [
      { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "area_m2 / 220" },
      { type: "MATERIAL", refKey: "MATERIAL:GEOGITTER", qtyFormula: "area_m2 * 1.03" },
    ],
  },
  {
    key: "GT_BODENSTABILISIERUNG_KALK_ZEMENT",
    title: "Bodenstabilisierung (Kalk/Zement)",
    unit: "m2",
    category: CAT,
    tags: ["Stabilisierung"],
    paramsJson: { defaultParams: { area_m2: 500, thickness_m: 0.3, binder_kg_m2: 12 } },
    components: [
      { type: "MACHINE", refKey: "MACHINE:STABILISIERER", qtyFormula: "area_m2 / 2500" },
      { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "area_m2 / 800" },
      { type: "MATERIAL", refKey: "MATERIAL:KALK_ZEMENT", qtyFormula: "area_m2 * binder_kg_m2 / 1000" },
    ],
  },
];

async function main() {
  console.log("[seed] kalkulation templates – Block 16 (Geotechnik / Bodenverbesserung)");

  let templatesUpserted = 0;
  let componentsUpserted = 0;

  for (const t of templates) {
    const tpl = await prisma.recipeTemplate.upsert({
      where: { key: t.key },
      update: { title: t.title, unit: t.unit, category: t.category, tags: t.tags ?? [], paramsJson: t.paramsJson ?? null },
      create: { key: t.key, title: t.title, unit: t.unit, category: t.category, tags: t.tags ?? [], paramsJson: t.paramsJson ?? null },
      select: { id: true },
    });

    templatesUpserted++;
    await prisma.recipeComponent.deleteMany({ where: { templateId: tpl.id } });

    for (let i = 0; i < t.components.length; i++) {
      const c = t.components[i];
      await prisma.recipeComponent.create({
        data: { templateId: tpl.id, type: c.type as any, refKey: c.refKey, qtyFormula: c.qtyFormula, sort: i, mandatory: true },
      });
      componentsUpserted++;
    }
  }

  console.log("[seed] done", { templates: templatesUpserted, components: componentsUpserted });
}

main()
  .catch((e) => {
    console.error("[seed] error", e);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());

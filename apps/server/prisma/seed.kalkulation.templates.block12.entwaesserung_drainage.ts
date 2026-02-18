// prisma/seed.kalkulation.templates.block12.entwaesserung_drainage.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * BLOCK 12 – ENTWÄSSERUNG / DRAINAGE
 * Fokus: Drainrohr, Rigole, Mulde, Rinne, Pumpensumpf, Sickerkies/Geotextil
 */

type TemplateDef = {
  key: string;
  title: string;
  unit: string;
  category: string;
  tags?: string[];
  paramsJson?: any;
  components: Array<{
    type: "LABOR" | "MACHINE" | "MATERIAL" | "DISPOSAL" | "SURFACE" | "OTHER";
    refKey: string;
    qtyFormula: string;
  }>;
};

const CAT = "ENTWAESSERUNG_DRAINAGE";

const templates: TemplateDef[] = [
  {
    key: "DR_DRAINROHR_VERLEGEN_DN100",
    title: "Drainrohr verlegen DN100",
    unit: "m",
    category: CAT,
    tags: ["Drainage"],
    paramsJson: { defaultParams: { length_m: 50, depth_m: 0.8, bedding_m: 0.15 } },
    components: [
      { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "length_m / 20" },
      { type: "MACHINE", refKey: "MACHINE:MINIBAGGER", qtyFormula: "length_m / 120" },
      { type: "MATERIAL", refKey: "MATERIAL:DRAINROHR_DN100", qtyFormula: "length_m * 1.02" },
      { type: "MATERIAL", refKey: "MATERIAL:SICKERKIES", qtyFormula: "length_m * 0.25" },
      { type: "MATERIAL", refKey: "MATERIAL:GEOTEXTIL", qtyFormula: "length_m * 1.2" },
    ],
  },
  {
    key: "DR_KONTROLLSCHACHT_DRAINAGE_SETZEN",
    title: "Kontrollschacht Drainage setzen",
    unit: "stk",
    category: CAT,
    tags: ["Drainage", "Schacht"],
    paramsJson: { defaultParams: { count: 2 } },
    components: [
      { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "count * 0.6" },
      { type: "MACHINE", refKey: "MACHINE:MINIBAGGER", qtyFormula: "count * 0.2" },
      { type: "MATERIAL", refKey: "MATERIAL:KONTROLLSCHACHT_DN315", qtyFormula: "count" },
    ],
  },
  {
    key: "DR_RIGOLENSYSTEM_HERSTELLEN",
    title: "Rigolensystem herstellen (Versickerung)",
    unit: "m3",
    category: CAT,
    tags: ["Rigole", "Versickerung"],
    paramsJson: { defaultParams: { volume_m3: 10, geotextil: true } },
    components: [
      { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "volume_m3 / 3" },
      { type: "MACHINE", refKey: "MACHINE:BAGGER_8_14T", qtyFormula: "volume_m3 / 25" },
      { type: "MATERIAL", refKey: "MATERIAL:RIGOLE_ELEMENT", qtyFormula: "volume_m3 * 0.8" },
      { type: "MATERIAL", refKey: "MATERIAL:GEOTEXTIL", qtyFormula: "geotextil ? (volume_m3 * 6) : 0" },
    ],
  },
  {
    key: "DR_ENTWAESSERUNGSRINNE_SETZEN",
    title: "Entwässerungsrinne setzen",
    unit: "m",
    category: CAT,
    tags: ["Rinne"],
    paramsJson: { defaultParams: { length_m: 15, concrete_bed: true } },
    components: [
      { type: "LABOR", refKey: "LABOR:STRASSENBAUER", qtyFormula: "length_m / 8" },
      { type: "MATERIAL", refKey: "MATERIAL:ENTWAESSERUNGSRINNE", qtyFormula: "length_m * 1.02" },
      { type: "MATERIAL", refKey: "MATERIAL:BETON_C20_25", qtyFormula: "concrete_bed ? (length_m * 0.05) : 0" },
    ],
  },
  {
    key: "DR_PUMPENSUMPF_HERSTELLEN",
    title: "Pumpensumpf herstellen (klein)",
    unit: "stk",
    category: CAT,
    tags: ["Pumpensumpf"],
    paramsJson: { defaultParams: { count: 1, depth_m: 1.2 } },
    components: [
      { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "count * 1.5" },
      { type: "MACHINE", refKey: "MACHINE:MINIBAGGER", qtyFormula: "count * 0.4" },
      { type: "MATERIAL", refKey: "MATERIAL:KIES_SAND", qtyFormula: "count * 0.5" },
    ],
  },
];

async function main() {
  console.log("[seed] kalkulation templates – Block 12 (Entwässerung / Drainage)");

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

// prisma/seed.kalkulation.templates.block13.schaechte_bauwerke.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * BLOCK 13 – SCHÄCHTE & BAUWERKE
 * Fokus: Schacht setzen, Auflageringe, Abdeckungen, Höhenausgleich, Rückbau
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

const CAT = "SCHAECHTE_BAUWERKE";

const templates: TemplateDef[] = [
  {
    key: "SB_SCHACHT_DN1000_SETZEN",
    title: "Schacht DN1000 setzen (inkl. Bettung)",
    unit: "stk",
    category: CAT,
    tags: ["Schacht", "Kanal"],
    paramsJson: { defaultParams: { count: 1, depth_m: 2.0, bedding_m: 0.15 } },
    components: [
      { type: "LABOR", refKey: "LABOR:KANALBAUER", qtyFormula: "count * (2.5 + depth_m * 0.6)" },
      { type: "MACHINE", refKey: "MACHINE:BAGGER_8_14T", qtyFormula: "count * 0.8" },
      { type: "MATERIAL", refKey: "MATERIAL:SCHACHT_DN1000", qtyFormula: "count" },
      { type: "MATERIAL", refKey: "MATERIAL:BETTUNGSSAND", qtyFormula: "count * (0.3 + bedding_m)" },
    ],
  },
  {
    key: "SB_SCHACHTABDECKUNG_D400_SETZEN",
    title: "Schachtabdeckung D400 setzen",
    unit: "stk",
    category: CAT,
    tags: ["Abdeckung", "D400"],
    paramsJson: { defaultParams: { count: 1 } },
    components: [
      { type: "LABOR", refKey: "LABOR:STRASSENBAUER", qtyFormula: "count * 0.6" },
      { type: "MATERIAL", refKey: "MATERIAL:SCHACHTABDECKUNG_D400", qtyFormula: "count" },
      { type: "MATERIAL", refKey: "MATERIAL:BETON_C20_25", qtyFormula: "count * 0.08" },
    ],
  },
  {
    key: "SB_HOEHENAUSGLEICH_AUFLAGERINGE",
    title: "Höhenausgleich mit Auflageringen",
    unit: "stk",
    category: CAT,
    tags: ["Höhenausgleich"],
    paramsJson: { defaultParams: { count: 1, delta_cm: 5 } },
    components: [
      { type: "LABOR", refKey: "LABOR:STRASSENBAUER", qtyFormula: "count * 0.4" },
      { type: "MATERIAL", refKey: "MATERIAL:AUFLAGERING", qtyFormula: "Math.max(1, Math.ceil(delta_cm / 2)) * count" },
    ],
  },
  {
    key: "SB_SCHACHT_RUECKBAU_ENTSORGUNG",
    title: "Schacht rückbauen und entsorgen",
    unit: "stk",
    category: CAT,
    tags: ["Rückbau", "Entsorgung"],
    paramsJson: { defaultParams: { count: 1, volume_m3: 2.0 } },
    components: [
      { type: "MACHINE", refKey: "MACHINE:BAGGER_14_22T", qtyFormula: "count * 0.7" },
      { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "count * 1.2" },
      { type: "DISPOSAL", refKey: "DISPOSAL:BETON_BAUSCHUTT", qtyFormula: "volume_m3 * count" },
    ],
  },
  {
    key: "SB_EINLAUF_KASTEN_SETZEN",
    title: "Straßeneinlauf / Kasten setzen",
    unit: "stk",
    category: CAT,
    tags: ["Einlauf"],
    paramsJson: { defaultParams: { count: 1 } },
    components: [
      { type: "LABOR", refKey: "LABOR:STRASSENBAUER", qtyFormula: "count * 0.8" },
      { type: "MATERIAL", refKey: "MATERIAL:STRASSENEINLAUF_KASTEN", qtyFormula: "count" },
      { type: "MATERIAL", refKey: "MATERIAL:BETON_C20_25", qtyFormula: "count * 0.06" },
    ],
  },
];

async function main() {
  console.log("[seed] kalkulation templates – Block 13 (Schächte & Bauwerke)");

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

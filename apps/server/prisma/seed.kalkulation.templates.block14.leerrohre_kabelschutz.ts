// prisma/seed.kalkulation.templates.block14.leerrohre_kabelschutz.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * BLOCK 14 – LEERROHRE / KABELSCHUTZ
 * Fokus: Kabelschutzrohr, Mehrfachrohr, Einziehen, Warnband, Marker
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

const CAT = "LEERROHRE_KABELSCHUTZ";

const templates: TemplateDef[] = [
  {
    key: "LR_KABELSCHUTZROHR_DN50_VERLEGEN",
    title: "Kabelschutzrohr DN50 verlegen",
    unit: "m",
    category: CAT,
    tags: ["Leerrohr", "Kabelschutz"],
    paramsJson: { defaultParams: { length_m: 80, bedding_m: 0.1 } },
    components: [
      { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "length_m / 25" },
      { type: "MATERIAL", refKey: "MATERIAL:KABELSCHUTZROHR_DN50", qtyFormula: "length_m * 1.02" },
      { type: "MATERIAL", refKey: "MATERIAL:BETTUNGSSAND", qtyFormula: "length_m * bedding_m" },
    ],
  },
  {
    key: "LR_MEHRFACHROHR_4X_DN40_VERLEGEN",
    title: "Mehrfachrohr 4x DN40 verlegen",
    unit: "m",
    category: CAT,
    tags: ["Mehrfachrohr"],
    paramsJson: { defaultParams: { length_m: 80 } },
    components: [
      { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "length_m / 22" },
      { type: "MATERIAL", refKey: "MATERIAL:MEHRFACHROHR_4X_DN40", qtyFormula: "length_m * 1.02" },
    ],
  },
  {
    key: "LR_WARNBAND_VERLEGEN",
    title: "Warnband verlegen",
    unit: "m",
    category: CAT,
    tags: ["Warnband"],
    paramsJson: { defaultParams: { length_m: 80 } },
    components: [
      { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "length_m / 200" },
      { type: "MATERIAL", refKey: "MATERIAL:WARNBAND", qtyFormula: "length_m * 1.05" },
    ],
  },
  {
    key: "LR_KABEL_EINZIEHEN",
    title: "Kabel einziehen (in Schutzrohr)",
    unit: "m",
    category: CAT,
    tags: ["Kabel", "Einziehen"],
    paramsJson: { defaultParams: { length_m: 80, cable_diameter_mm: 20 } },
    components: [
      { type: "LABOR", refKey: "LABOR:ELEKTRIKER", qtyFormula: "length_m / 120" },
      { type: "MACHINE", refKey: "MACHINE:KABELWINDENZUG", qtyFormula: "length_m / 500" },
    ],
  },
  {
    key: "LR_MARKER_SETZEN",
    title: "Kabelmarker / Markierung setzen",
    unit: "stk",
    category: CAT,
    tags: ["Marker"],
    paramsJson: { defaultParams: { count: 10 } },
    components: [
      { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "count / 40" },
      { type: "MATERIAL", refKey: "MATERIAL:KABELMARKER", qtyFormula: "count" },
    ],
  },
];

async function main() {
  console.log("[seed] kalkulation templates – Block 14 (Leerrohre / Kabelschutz)");

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

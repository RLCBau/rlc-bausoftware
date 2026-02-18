// prisma/seed.kalkulation.templates.block19.spezialtiefbau_verbau_spundwand.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * BLOCK 19 – SPEZIALTIEFBAU / VERBAU / SPUNDWAND
 * Fokus: Verbau, Spundwand, Aussteifung, Wasserhaltung
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

const CAT = "SPEZIALTIEFBAU_VERBAU_SPUNDWAND";

const templates: TemplateDef[] = [
  {
    key: "STB_VERBAU_BOX_SYSTEM",
    title: "Verbau (Box-System) stellen",
    unit: "m2",
    category: CAT,
    tags: ["Verbau"],
    paramsJson: { defaultParams: { area_m2: 80, depth_m: 2.5 } },
    components: [
      { type: "MACHINE", refKey: "MACHINE:VERBAUGERAET", qtyFormula: "area_m2 / 250" },
      { type: "LABOR", refKey: "LABOR:SPEZIALTIEFBAU", qtyFormula: "area_m2 / 120" },
      { type: "OTHER", refKey: "OTHER:MIETE_VERBAU", qtyFormula: "area_m2 / 80" },
    ],
  },
  {
    key: "STB_SPUNDWAND_EINBRINGEN",
    title: "Spundwand einbringen",
    unit: "m2",
    category: CAT,
    tags: ["Spundwand"],
    paramsJson: { defaultParams: { area_m2: 120, depth_m: 5.0 } },
    components: [
      { type: "MACHINE", refKey: "MACHINE:RUTTELGERAET", qtyFormula: "area_m2 / 300" },
      { type: "LABOR", refKey: "LABOR:SPEZIALTIEFBAU", qtyFormula: "area_m2 / 140" },
      { type: "MATERIAL", refKey: "MATERIAL:SPUNDWAND", qtyFormula: "area_m2 * 1.02" },
    ],
  },
  {
    key: "STB_AUSSTEIFUNG_EINBAU",
    title: "Aussteifung / Sprießung einbauen",
    unit: "psch",
    category: CAT,
    tags: ["Aussteifung"],
    paramsJson: { defaultParams: { levels: 1, span_m: 6 } },
    components: [
      { type: "LABOR", refKey: "LABOR:SCHLOSSER", qtyFormula: "2 + levels" },
      { type: "MATERIAL", refKey: "MATERIAL:STAHLTRAEGER", qtyFormula: "levels * span_m * 0.2" },
      { type: "MACHINE", refKey: "MACHINE:KRAN", qtyFormula: "0.5 + levels * 0.2" },
    ],
  },
  {
    key: "STB_WASSERHALTUNG_SPEZIAL",
    title: "Wasserhaltung (Spezialtiefbau)",
    unit: "tag",
    category: CAT,
    tags: ["Wasserhaltung"],
    paramsJson: { defaultParams: { days: 10, wells: 2 } },
    components: [
      { type: "OTHER", refKey: "OTHER:MIETE_WASSERHALTUNG", qtyFormula: "days * wells" },
      { type: "LABOR", refKey: "LABOR:SPEZIALTIEFBAU", qtyFormula: "days / 8" },
    ],
  },
];

async function main() {
  console.log("[seed] kalkulation templates – Block 19 (Spezialtiefbau / Verbau / Spundwand)");

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

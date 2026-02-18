// prisma/seed.kalkulation.templates.block17.provisorien_baustrom_bauwasser.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * BLOCK 17 – PROVISORIEN / BAUSTROM / BAUWASSER / BYPASS
 * Fokus: Baustromkasten, Bauwasser, Pumpen, Schlauchleitung, Bypass
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

const CAT = "PROVISORIEN_BAUSTROM_BAUWASSER";

const templates: TemplateDef[] = [
  {
    key: "PR_BAUSTROM_EINRICHTEN",
    title: "Baustrom einrichten (Kasten + Anschluss)",
    unit: "psch",
    category: CAT,
    tags: ["Baustrom"],
    paramsJson: { defaultParams: { days: 30, power_kw: 20 } },
    components: [
      { type: "OTHER", refKey: "OTHER:MIETE_BAUSTROMKASTEN", qtyFormula: "days / 30" },
      { type: "LABOR", refKey: "LABOR:ELEKTRIKER", qtyFormula: "1.5" },
      { type: "MATERIAL", refKey: "MATERIAL:KABEL_BAUSTROM", qtyFormula: "30" },
    ],
  },
  {
    key: "PR_BAUWASSER_EINRICHTEN",
    title: "Bauwasser einrichten (Standrohr/Anschluss)",
    unit: "psch",
    category: CAT,
    tags: ["Bauwasser"],
    paramsJson: { defaultParams: { days: 30 } },
    components: [
      { type: "OTHER", refKey: "OTHER:STANDROHR_MIETE", qtyFormula: "days / 30" },
      { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "0.6" },
    ],
  },
  {
    key: "PR_WASSERHALTUNG_PUMPE",
    title: "Wasserhaltung / Pumpe (Betrieb)",
    unit: "tag",
    category: CAT,
    tags: ["Wasserhaltung"],
    paramsJson: { defaultParams: { days: 5, pump_kw: 2.2 } },
    components: [
      { type: "OTHER", refKey: "OTHER:MIETE_PUMPE", qtyFormula: "days" },
      { type: "OTHER", refKey: "OTHER:STROMKOSTEN", qtyFormula: "days * pump_kw * 8 / 1000" },
      { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "days / 10" },
    ],
  },
  {
    key: "PR_BYPASS_SCHLAUCHLEITUNG_VERLEGEN",
    title: "Bypass Schlauchleitung verlegen",
    unit: "m",
    category: CAT,
    tags: ["Bypass"],
    paramsJson: { defaultParams: { length_m: 30, dn_mm: 80 } },
    components: [
      { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "length_m / 60" },
      { type: "OTHER", refKey: "OTHER:MIETE_SCHLAUCHLEITUNG", qtyFormula: "length_m / 30" },
    ],
  },
];

async function main() {
  console.log("[seed] kalkulation templates – Block 17 (Provisorien / Baustrom / Bauwasser)");

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

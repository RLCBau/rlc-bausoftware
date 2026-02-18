// prisma/seed.kalkulation.templates.block15.hausanschluesse_wasser_gas.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * BLOCK 15 – HAUSANSCHLÜSSE WASSER/GAS
 * Fokus: kompletter Hausanschluss (Graben, Rohr, Armaturen, Druckprobe, Oberfläche)
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

const CAT = "HAUSANSCHLUESSE_WASSER_GAS";

const templates: TemplateDef[] = [
  {
    key: "HA_WASSER_HAUSANSCHLUSS_KOMPLETT_DN32",
    title: "Wasser-Hausanschluss komplett DN32 (Graben + Rohr + Armaturen)",
    unit: "psch",
    category: CAT,
    tags: ["Wasser", "Hausanschluss"],
    paramsJson: { defaultParams: { length_m: 15, depth_m: 1.2, dn_mm: 32, surface: "PFLASTER" } },
    components: [
      { type: "MACHINE", refKey: "MACHINE:MINIBAGGER", qtyFormula: "length_m / 80" },
      { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "length_m / 10" },
      { type: "MATERIAL", refKey: "MATERIAL:PEHD_DN32", qtyFormula: "length_m * 1.05" },
      { type: "MATERIAL", refKey: "MATERIAL:ARMATUREN_HAUSANSCHLUSS_SET", qtyFormula: "1" },
      { type: "OTHER", refKey: "OTHER:DRUCKPROBE", qtyFormula: "1" },
    ],
  },
  {
    key: "HA_GAS_HAUSANSCHLUSS_KOMPLETT_DN25",
    title: "Gas-Hausanschluss komplett DN25 (Graben + Rohr + Armaturen)",
    unit: "psch",
    category: CAT,
    tags: ["Gas", "Hausanschluss"],
    paramsJson: { defaultParams: { length_m: 12, depth_m: 1.0, dn_mm: 25 } },
    components: [
      { type: "MACHINE", refKey: "MACHINE:MINIBAGGER", qtyFormula: "length_m / 90" },
      { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "length_m / 12" },
      { type: "MATERIAL", refKey: "MATERIAL:GASROHR_DN25", qtyFormula: "length_m * 1.05" },
      { type: "MATERIAL", refKey: "MATERIAL:ARMATUREN_GAS_SET", qtyFormula: "1" },
      { type: "OTHER", refKey: "OTHER:DICHTHEITSPRUEFUNG", qtyFormula: "1" },
    ],
  },
  {
    key: "HA_KERNBOHRUNG_WANDDURCHFUEHRUNG",
    title: "Kernbohrung / Wanddurchführung",
    unit: "stk",
    category: CAT,
    tags: ["Kernbohrung"],
    paramsJson: { defaultParams: { count: 1, diameter_mm: 80 } },
    components: [
      { type: "MACHINE", refKey: "MACHINE:KERNBOHRGERAET", qtyFormula: "count * 0.25" },
      { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "count * 0.4" },
      { type: "MATERIAL", refKey: "MATERIAL:WANDDURCHFUEHRUNG", qtyFormula: "count" },
    ],
  },
  {
    key: "HA_OBERFLAECHE_KLEINFLAECHE_WIEDERHERSTELLEN",
    title: "Oberfläche (Kleinfläche) wiederherstellen nach Hausanschluss",
    unit: "m2",
    category: CAT,
    tags: ["Oberfläche"],
    paramsJson: { defaultParams: { area_m2: 4, surface: "ASPHALT" } },
    components: [
      { type: "LABOR", refKey: "LABOR:STRASSENBAUER", qtyFormula: "area_m2 / 12" },
      { type: "MATERIAL", refKey: "MATERIAL:ASPHALT_REPARATUR", qtyFormula: "surface === 'ASPHALT' ? (area_m2 * 0.12) : 0" },
      { type: "MATERIAL", refKey: "MATERIAL:PFLASTERSTEIN", qtyFormula: "surface === 'PFLASTER' ? (area_m2 * 1.02) : 0" },
    ],
  },
];

async function main() {
  console.log("[seed] kalkulation templates – Block 15 (Hausanschlüsse Wasser/Gas)");

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

// prisma/seed.kalkulation.templates.block18.hdd_spuelbohrung.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * BLOCK 18 – HDD / SPÜLBOHRUNG
 * Fokus: Pilotbohrung, Aufweiten, Einziehen, Bentonit, Entsorgung
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

const CAT = "HDD_SPUELBOHRUNG";

const templates: TemplateDef[] = [
  {
    key: "HDD_PILOTBOHRUNG",
    title: "HDD Pilotbohrung",
    unit: "m",
    category: CAT,
    tags: ["HDD"],
    paramsJson: { defaultParams: { length_m: 60, soilClass: "BK3" } },
    components: [
      { type: "MACHINE", refKey: "MACHINE:HDD_ANLAGE", qtyFormula: "length_m / 300" },
      { type: "LABOR", refKey: "LABOR:SPEZIALTIEFBAU", qtyFormula: "length_m / 120" },
      { type: "MATERIAL", refKey: "MATERIAL:BENTONIT", qtyFormula: "length_m * 0.02" },
    ],
  },
  {
    key: "HDD_AUFWEITEN_REAMING",
    title: "HDD Aufweiten (Reaming)",
    unit: "m",
    category: CAT,
    tags: ["HDD"],
    paramsJson: { defaultParams: { length_m: 60, diameter_mm: 160 } },
    components: [
      { type: "MACHINE", refKey: "MACHINE:HDD_ANLAGE", qtyFormula: "length_m / 250" },
      { type: "LABOR", refKey: "LABOR:SPEZIALTIEFBAU", qtyFormula: "length_m / 140" },
      { type: "MATERIAL", refKey: "MATERIAL:BENTONIT", qtyFormula: "length_m * 0.03" },
    ],
  },
  {
    key: "HDD_ROHR_EINZIEHEN",
    title: "HDD Rohr einziehen",
    unit: "m",
    category: CAT,
    tags: ["HDD", "Einziehen"],
    paramsJson: { defaultParams: { length_m: 60, dn_mm: 110 } },
    components: [
      { type: "MACHINE", refKey: "MACHINE:HDD_ANLAGE", qtyFormula: "length_m / 300" },
      { type: "LABOR", refKey: "LABOR:SPEZIALTIEFBAU", qtyFormula: "length_m / 180" },
      { type: "MATERIAL", refKey: "MATERIAL:PEHD_DN110", qtyFormula: "length_m * 1.05" },
    ],
  },
  {
    key: "HDD_SPUELGUT_ENTSORGEN",
    title: "Spülgut / Bohrschlamm entsorgen",
    unit: "m3",
    category: CAT,
    tags: ["Entsorgung"],
    paramsJson: { defaultParams: { volume_m3: 10, disposalClass: "DKI" } },
    components: [
      { type: "DISPOSAL", refKey: "DISPOSAL:BOHRSCHLAMM", qtyFormula: "volume_m3" },
      { type: "MACHINE", refKey: "MACHINE:TRANSPORTER", qtyFormula: "volume_m3 / 20" },
    ],
  },
];

async function main() {
  console.log("[seed] kalkulation templates – Block 18 (HDD / Spülbohrung)");

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

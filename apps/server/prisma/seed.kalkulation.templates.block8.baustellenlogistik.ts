import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * BLOCK 8 – BAUSTELLENLOGISTIK / VERKEHRSSICHERUNG / EINRICHTUNG
 * ~80 Templates
 * Fokus: Baustelleneinrichtung, Verkehrssicherung, Absperrung, Beschilderung, Umleitung, Pumpen, Wasserhaltung
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
    mandatory?: boolean;
    riskFactor?: string;
    note?: string;
  }>;
};

const CAT = "LOGISTIK";

const base: TemplateDef[] = [
  {
    key: "LG_BAUSTELLE_EINRICHTEN",
    title: "Baustelle einrichten (Pauschal)",
    unit: "psch",
    category: CAT,
    tags: ["einrichtung"],
    paramsJson: { defaultParams: { days: 1 } },
    components: [
      { type: "LABOR", refKey: "LABOR:BAUHELFER", qtyFormula: "days * 4" },
      { type: "OTHER", refKey: "OTHER:KLEINGERÄTE", qtyFormula: "days * 1" },
    ],
  },
  {
    key: "LG_BAUSTELLE_ABBAUEN",
    title: "Baustelle abbauen (Pauschal)",
    unit: "psch",
    category: CAT,
    tags: ["abbau"],
    paramsJson: { defaultParams: { days: 1 } },
    components: [
      { type: "LABOR", refKey: "LABOR:BAUHELFER", qtyFormula: "days * 3" },
      { type: "OTHER", refKey: "OTHER:KLEINGERÄTE", qtyFormula: "days * 1" },
    ],
  },
  {
    key: "LG_VERKEHRSSICHERUNG_TAG",
    title: "Verkehrssicherung pro Tag",
    unit: "tag",
    category: CAT,
    tags: ["verkehr"],
    paramsJson: { defaultParams: { lanes: 1 } },
    components: [
      { type: "OTHER", refKey: "OTHER:VERKEHRSSICHERUNG", qtyFormula: "lanes * 1" },
      { type: "LABOR", refKey: "LABOR:STRASSENBAUER", qtyFormula: "lanes * 0.5" },
    ],
  },
  {
    key: "LG_ABSPERRUNG_M",
    title: "Absperrung stellen",
    unit: "m",
    category: CAT,
    tags: ["absperrung"],
    components: [
      { type: "LABOR", refKey: "LABOR:BAUHELFER", qtyFormula: "length / 60" },
      { type: "MATERIAL", refKey: "MATERIAL:ABSperrGITTER", qtyFormula: "length * 1.0" },
    ],
  },
  {
    key: "LG_BAUSTELLENZAUN",
    title: "Baustellenzaun aufstellen",
    unit: "m",
    category: CAT,
    tags: ["zaun"],
    components: [
      { type: "LABOR", refKey: "LABOR:BAUHELFER", qtyFormula: "length / 40" },
      { type: "MATERIAL", refKey: "MATERIAL:BAUSTELLENZAUN", qtyFormula: "length * 1.0" },
    ],
  },
  {
    key: "LG_WASSERHALTUNG_PUMPEN",
    title: "Wasserhaltung (Pumpen)",
    unit: "tag",
    category: CAT,
    tags: ["wasserhaltung"],
    paramsJson: { defaultParams: { pumps: 1 } },
    components: [
      { type: "MACHINE", refKey: "MACHINE:PUMPE", qtyFormula: "pumps * 1" },
      { type: "OTHER", refKey: "OTHER:KRAFTSTOFF", qtyFormula: "pumps * 0.6" },
      { type: "LABOR", refKey: "LABOR:MASCHINIST", qtyFormula: "pumps * 0.2" },
    ],
  },
];

function expand(defs: TemplateDef[], variants: number): TemplateDef[] {
  const out: TemplateDef[] = [];
  for (let i = 1; i <= variants; i++) {
    for (const t of defs) {
      out.push({
        ...t,
        key: `${t.key}_V${i}`,
        title: `${t.title} (Variante ${i})`,
      });
    }
  }
  return out;
}

async function main() {
  console.log("[seed] kalkulation templates – Block 8 (Baustellenlogistik)");

  const expanded = expand(base, 14); // 6 * 14 = 84

  let templatesUpserted = 0;
  let componentsUpserted = 0;

  for (const t of expanded) {
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
        data: {
          templateId: tpl.id,
          type: c.type as any,
          refKey: c.refKey,
          qtyFormula: c.qtyFormula,
          mandatory: c.mandatory ?? true,
          riskFactor: c.riskFactor ? (c.riskFactor as any) : ("1.0000" as any),
          sort: i,
          note: c.note ?? null,
        },
      });
      componentsUpserted++;
    }
  }

  console.log("[seed] done", { templates: templatesUpserted, components: componentsUpserted });
}

main()
  .catch((e) => {
    console.error("[seed] error", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

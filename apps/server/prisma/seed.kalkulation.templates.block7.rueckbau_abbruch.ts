import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * BLOCK 7 – RÜCKBAU / ABBRUCH / ENTSORGUNG
 * ~80–100 Templates (mit Expand-Varianten)
 * Fokus: Rückbau Asphalt/Pflaster/Beton, Abbruch, Entsorgung, Trennung, Container, Recycling
 */

type TemplateDef = {
  key: string;
  title: string;
  unit: string;
  category: string;
  description?: string;
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

const CAT = "RUECKBAU";

const base: TemplateDef[] = [
  {
    key: "RB_ASPHALT_RUECKBAU",
    title: "Asphalt rückbauen (inkl. Laden)",
    unit: "m2",
    category: CAT,
    tags: ["asphalt", "rueckbau"],
    paramsJson: { defaultParams: { depth_m: 0.08 } },
    components: [
      { type: "MACHINE", refKey: "MACHINE:FRAESE", qtyFormula: "area / 250" },
      { type: "MACHINE", refKey: "MACHINE:RADLADER", qtyFormula: "area / 400" },
      { type: "LABOR", refKey: "LABOR:STRASSENBAUER", qtyFormula: "area / 250" },
      { type: "DISPOSAL", refKey: "DISPOSAL:ASPHALT", qtyFormula: "area * depth_m * 2.4" },
    ],
  },
  {
    key: "RB_PFLASTER_AUFNEHMEN",
    title: "Pflaster aufnehmen und sortieren",
    unit: "m2",
    category: CAT,
    tags: ["pflaster", "rueckbau"],
    paramsJson: { defaultParams: { reuse: true } },
    components: [
      { type: "LABOR", refKey: "LABOR:PFLASTERER", qtyFormula: "area / 35" },
      { type: "MACHINE", refKey: "MACHINE:MINIBAGGER", qtyFormula: "area / 180" },
      { type: "DISPOSAL", refKey: "DISPOSAL:BAUSCHUTT", qtyFormula: "reuse ? 0 : (area * 0.10 * 2.0)" },
    ],
  },
  {
    key: "RB_BETON_PLATTE_ABBRUCH",
    title: "Betonplatte abbrechen",
    unit: "m2",
    category: CAT,
    tags: ["beton", "abbruch"],
    paramsJson: { defaultParams: { thickness_m: 0.15 } },
    components: [
      { type: "MACHINE", refKey: "MACHINE:ABBRUCHHAMMER", qtyFormula: "area / 120" },
      { type: "MACHINE", refKey: "MACHINE:BAGGER_8_14T", qtyFormula: "area / 220" },
      { type: "LABOR", refKey: "LABOR:BAUHELFER", qtyFormula: "area / 180" },
      { type: "DISPOSAL", refKey: "DISPOSAL:BETON", qtyFormula: "area * thickness_m * 2.3" },
    ],
  },
  {
    key: "RB_BORDSTEIN_AUFNEHMEN",
    title: "Bordstein aufnehmen",
    unit: "m",
    category: CAT,
    tags: ["bord", "rueckbau"],
    components: [
      { type: "LABOR", refKey: "LABOR:STRASSENBAUER", qtyFormula: "length / 12" },
      { type: "MACHINE", refKey: "MACHINE:MINIBAGGER", qtyFormula: "length / 80" },
      { type: "DISPOSAL", refKey: "DISPOSAL:BAUSCHUTT", qtyFormula: "length * 0.08 * 2.2" },
    ],
  },
  {
    key: "RB_AUSHUB_ENTSORGUNG_ALLG",
    title: "Aushub entsorgen (allgemein)",
    unit: "m3",
    category: CAT,
    tags: ["aushub", "entsorgung"],
    paramsJson: { defaultParams: { disposalClass: "DK0", distance_km: 10 } },
    components: [
      { type: "MACHINE", refKey: "MACHINE:LKW_KIPPER", qtyFormula: "volume / 10" },
      { type: "LABOR", refKey: "LABOR:BAUHELFER", qtyFormula: "volume / 25" },
      { type: "DISPOSAL", refKey: "DISPOSAL:AUSHUB", qtyFormula: "volume * disposalFactor" },
      { type: "OTHER", refKey: "OTHER:TRANSPORT", qtyFormula: "volume * distance_km * 0.15" },
    ],
  },
  {
    key: "RB_CONTAINER_STELLEN",
    title: "Container stellen (inkl. Abholung)",
    unit: "stk",
    category: CAT,
    tags: ["container"],
    paramsJson: { defaultParams: { container_m3: 7, trips: 1 } },
    components: [
      { type: "OTHER", refKey: "OTHER:CONTAINER_MIETE", qtyFormula: "trips" },
      { type: "OTHER", refKey: "OTHER:CONTAINER_LOGISTIK", qtyFormula: "trips" },
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
  console.log("[seed] kalkulation templates – Block 7 (Rückbau/Abbruch)");

  const expanded = expand(base, 14); // 6 * 14 = 84

  let templatesUpserted = 0;
  let componentsUpserted = 0;

  for (const t of expanded) {
    const tpl = await prisma.recipeTemplate.upsert({
      where: { key: t.key },
      update: {
        title: t.title,
        unit: t.unit,
        category: t.category,
        description: t.description ?? null,
        tags: t.tags ?? [],
        paramsJson: t.paramsJson ?? null,
      },
      create: {
        key: t.key,
        title: t.title,
        unit: t.unit,
        category: t.category,
        description: t.description ?? null,
        tags: t.tags ?? [],
        paramsJson: t.paramsJson ?? null,
      },
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

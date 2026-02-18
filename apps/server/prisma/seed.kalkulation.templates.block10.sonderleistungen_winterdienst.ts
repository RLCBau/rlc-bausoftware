import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * BLOCK 10 – SONDERLEISTUNGEN / WINTER / PROVISORIEN
 * ~80 Templates
 * Fokus: Winterdienst, Provisorien, Notmaßnahmen, Schutzmaßnahmen, Reinigung, Dokumentation extra
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

const CAT = "SONDER";

const base: TemplateDef[] = [
  {
    key: "SD_WINTERDIENST_TAG",
    title: "Winterdienst (pro Tag)",
    unit: "tag",
    category: CAT,
    tags: ["winter"],
    paramsJson: { defaultParams: { area_m2: 2000 } },
    components: [
      { type: "MACHINE", refKey: "MACHINE:RADLADER", qtyFormula: "area_m2 / 8000" },
      { type: "MATERIAL", refKey: "MATERIAL:SALZ", qtyFormula: "area_m2 / 400" },
      { type: "LABOR", refKey: "LABOR:BAUHELFER", qtyFormula: "area_m2 / 6000" },
    ],
  },
  {
    key: "SD_PROVISORIUM_LEITUNG",
    title: "Provisorische Leitung herstellen",
    unit: "m",
    category: CAT,
    tags: ["provisorium"],
    paramsJson: { defaultParams: { dn_mm: 50 } },
    components: [
      { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "length / 18" },
      { type: "MATERIAL", refKey: "MATERIAL:PE_ROHR", qtyFormula: "length * 1.03" },
      { type: "OTHER", refKey: "OTHER:KUPPLUNGEN", qtyFormula: "length / 20" },
    ],
  },
  {
    key: "SD_SCHUTZPLATTEN",
    title: "Schutzplatten verlegen (Fußgänger)",
    unit: "m2",
    category: CAT,
    tags: ["schutz"],
    components: [
      { type: "LABOR", refKey: "LABOR:BAUHELFER", qtyFormula: "area / 120" },
      { type: "MATERIAL", refKey: "MATERIAL:SCHUTZPLATTEN", qtyFormula: "area * 1.02" },
    ],
  },
  {
    key: "SD_REINIGUNG_BAUSTELLE",
    title: "Baustelle reinigen",
    unit: "psch",
    category: CAT,
    tags: ["reinigung"],
    paramsJson: { defaultParams: { hours: 2 } },
    components: [
      { type: "LABOR", refKey: "LABOR:BAUHELFER", qtyFormula: "hours" },
      { type: "OTHER", refKey: "OTHER:ENTRUMPELUNG", qtyFormula: "hours * 0.5" },
    ],
  },
  {
    key: "SD_NOTMASSNAHME",
    title: "Notmaßnahme / Störung (Pauschal)",
    unit: "psch",
    category: CAT,
    tags: ["notfall"],
    paramsJson: { defaultParams: { crew: 2, hours: 3 } },
    components: [
      { type: "LABOR", refKey: "LABOR:MONTEUR", qtyFormula: "crew * hours" },
      { type: "MACHINE", refKey: "MACHINE:SERVICE_FAHRZEUG", qtyFormula: "hours / 2" },
      { type: "OTHER", refKey: "OTHER:KLEINMATERIAL", qtyFormula: "1" },
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
  console.log("[seed] kalkulation templates – Block 10 (Sonderleistungen)");

  const expanded = expand(base, 16); // 5 * 16 = 80

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

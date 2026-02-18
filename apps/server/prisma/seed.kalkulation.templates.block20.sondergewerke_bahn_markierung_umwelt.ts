// prisma/seed.kalkulation.templates.block20.sondergewerke_bahn_markierung_umwelt.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * BLOCK 20 – SONDERGEWERKE (BAHN / MARKIERUNG / UMWELT & LÄRMSCHUTZ)
 * Fokus: Gleisbau-Baustellen (basic), Straßenmarkierung, Lärmschutz, Umweltmaßnahmen
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

const CAT = "SONDERGEWERKE_MISC";

const templates: TemplateDef[] = [
  {
    key: "SG_BAHN_BAUSTELLENEINRICHTUNG_BASIS",
    title: "Bahn-Baustelleneinrichtung (Basis)",
    unit: "psch",
    category: CAT,
    tags: ["Bahn", "Gleisbau"],
    paramsJson: { defaultParams: { complexity: 2, days: 5 } },
    components: [
      { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "2 + complexity" },
      { type: "OTHER", refKey: "OTHER:BAHN_SICHERUNGSPERSONAL", qtyFormula: "days * complexity" },
      { type: "MACHINE", refKey: "MACHINE:TRANSPORTER", qtyFormula: "1" },
    ],
  },
  {
    key: "SG_STRASSENMARKIERUNG_ERNEUERN",
    title: "Straßenmarkierung erneuern",
    unit: "m",
    category: CAT,
    tags: ["Markierung"],
    paramsJson: { defaultParams: { length_m: 200, type: "LINIE" } },
    components: [
      { type: "MACHINE", refKey: "MACHINE:MARKIERWAGEN", qtyFormula: "length_m / 1500" },
      { type: "LABOR", refKey: "LABOR:STRASSENBAUER", qtyFormula: "length_m / 600" },
      { type: "MATERIAL", refKey: "MATERIAL:MARKIERFARBE", qtyFormula: "length_m * 0.002" },
    ],
  },
  {
    key: "SG_LAERMSCHUTZ_WAND_MONTAGE",
    title: "Lärmschutzwand montieren (leicht)",
    unit: "m",
    category: CAT,
    tags: ["Lärmschutz"],
    paramsJson: { defaultParams: { length_m: 20, height_m: 2.0 } },
    components: [
      { type: "LABOR", refKey: "LABOR:MONTEUR", qtyFormula: "length_m / 6" },
      { type: "MATERIAL", refKey: "MATERIAL:LAERMSCHUTZ_ELEMENT", qtyFormula: "length_m * height_m / 2" },
      { type: "MACHINE", refKey: "MACHINE:KRAN", qtyFormula: "length_m / 50" },
    ],
  },
  {
    key: "SG_UMWELT_SCHUTZMASSNAHMEN",
    title: "Umwelt-Schutzmaßnahmen (Ölmatten, Auffang, Abdeckung)",
    unit: "psch",
    category: CAT,
    tags: ["Umwelt"],
    paramsJson: { defaultParams: { level: 2 } },
    components: [
      { type: "MATERIAL", refKey: "MATERIAL:UMWELT_SET", qtyFormula: "level" },
      { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "0.5 + level * 0.3" },
    ],
  },
];

async function main() {
  console.log("[seed] kalkulation templates – Block 20 (Sondergewerke)");

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

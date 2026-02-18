import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * BLOCK 9 – VERMESSUNG / AS-BUILT / DOKU
 * ~80 Templates
 * Fokus: Aufmaß, Bestandsaufnahme, Absteckung, As-Built Dokumentation, Kontrollmessungen
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

const CAT = "VERMESSUNG";

const base: TemplateDef[] = [
  {
    key: "VM_ABSTECKUNG_PUNKTE",
    title: "Absteckung Punkte",
    unit: "pkt",
    category: CAT,
    tags: ["absteckung"],
    paramsJson: { defaultParams: { complexity: 1 } },
    components: [
      { type: "LABOR", refKey: "LABOR:VERMESSER", qtyFormula: "1/8 * complexity" },
      { type: "OTHER", refKey: "OTHER:GERAETEPAUSCH", qtyFormula: "1/12" },
    ],
  },
  {
    key: "VM_AUFMASS_LINIEN",
    title: "Aufmaß Linien (As-Built)",
    unit: "m",
    category: CAT,
    tags: ["asbuilt", "linie"],
    paramsJson: { defaultParams: { pointsPer10m: 3 } },
    components: [
      { type: "LABOR", refKey: "LABOR:VERMESSER", qtyFormula: "length / 120" },
      { type: "OTHER", refKey: "OTHER:DOKU", qtyFormula: "length / 300" },
    ],
  },
  {
    key: "VM_AUFMASS_FLAECHE",
    title: "Aufmaß Fläche (As-Built)",
    unit: "m2",
    category: CAT,
    tags: ["asbuilt", "flaeche"],
    components: [
      { type: "LABOR", refKey: "LABOR:VERMESSER", qtyFormula: "area / 2500" },
      { type: "OTHER", refKey: "OTHER:DOKU", qtyFormula: "area / 8000" },
    ],
  },
  {
    key: "VM_BESTAND_PLAN",
    title: "Bestandsplan erstellen",
    unit: "psch",
    category: CAT,
    tags: ["plan"],
    paramsJson: { defaultParams: { sheets: 1 } },
    components: [
      { type: "LABOR", refKey: "LABOR:TECHNIKER", qtyFormula: "sheets * 1.5" },
      { type: "OTHER", refKey: "OTHER:CAD", qtyFormula: "sheets * 1" },
    ],
  },
  {
    key: "VM_KONTROLLMESSUNG",
    title: "Kontrollmessung / Soll-Ist",
    unit: "psch",
    category: CAT,
    tags: ["kontrolle"],
    paramsJson: { defaultParams: { checks: 1 } },
    components: [
      { type: "LABOR", refKey: "LABOR:VERMESSER", qtyFormula: "checks * 0.5" },
      { type: "OTHER", refKey: "OTHER:REPORT", qtyFormula: "checks * 0.25" },
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
  console.log("[seed] kalkulation templates – Block 9 (Vermessung/As-Built)");

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

// prisma/seed.kalkulation.templates.block11.verkehrssicherung_rsa.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * BLOCK 11 – VERKEHRSSICHERUNG / RSA
 * Fokus: Absperrung, Beschilderung, Ampel, Umleitung, Fußgängerschutz
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
    note?: string;
  }>;
};

const CAT = "VERKEHRSSICHERUNG_RSA";

const templates: TemplateDef[] = [
  {
    key: "RSA_ABSPERRUNG_LEITBAKE_AUFSTELLEN",
    title: "Leitbaken / Absperrung aufstellen",
    unit: "m",
    category: CAT,
    tags: ["RSA", "Absperrung"],
    paramsJson: { defaultParams: { length_m: 50, duration_days: 1, night: false } },
    components: [
      { type: "LABOR", refKey: "LABOR:STRASSENBAUER", qtyFormula: "length_m / 80" },
      { type: "MATERIAL", refKey: "MATERIAL:LEITBAKE", qtyFormula: "length_m / 2.0" },
      { type: "MATERIAL", refKey: "MATERIAL:WARNLEUCHTE", qtyFormula: "length_m / 6.0" },
    ],
  },
  {
    key: "RSA_ABSPERRUNG_LEITBAKE_UNTERHALT",
    title: "Leitbaken / Absperrung unterhalten (Verkehrssicherung)",
    unit: "tag",
    category: CAT,
    tags: ["RSA", "Unterhalt"],
    paramsJson: { defaultParams: { length_m: 50, duration_days: 7 } },
    components: [
      { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "duration_days * (length_m / 800)" },
      { type: "MACHINE", refKey: "MACHINE:TRANSPORTER", qtyFormula: "duration_days / 5" },
    ],
  },
  {
    key: "RSA_VERKEHRSSCHILD_AUFSTELLEN",
    title: "Verkehrsschild aufstellen",
    unit: "stk",
    category: CAT,
    tags: ["RSA", "Beschilderung"],
    paramsJson: { defaultParams: { count: 6, duration_days: 7 } },
    components: [
      { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "count / 12" },
      { type: "MATERIAL", refKey: "MATERIAL:VERKEHRSSCHILD", qtyFormula: "count" },
      { type: "MATERIAL", refKey: "MATERIAL:SCHILDFUSS", qtyFormula: "count" },
    ],
  },
  {
    key: "RSA_FUSSGAENGERSCHUTZ_GELAE NDER",
    title: "Fußgängerschutz (Gitter / Geländer)",
    unit: "m",
    category: CAT,
    tags: ["RSA", "Fußgänger"],
    paramsJson: { defaultParams: { length_m: 20, duration_days: 3 } },
    components: [
      { type: "LABOR", refKey: "LABOR:STRASSENBAUER", qtyFormula: "length_m / 60" },
      { type: "MATERIAL", refKey: "MATERIAL:BAUGITTER", qtyFormula: "length_m / 2" },
    ],
  },
  {
    key: "RSA_BAUSTELLENAMPEL_STELLEN",
    title: "Baustellenampel aufstellen und betreiben",
    unit: "tag",
    category: CAT,
    tags: ["RSA", "Ampel"],
    paramsJson: { defaultParams: { duration_days: 7, lanes: 1 } },
    components: [
      { type: "OTHER", refKey: "OTHER:MIETE_BAUSTELLENAMPEL", qtyFormula: "duration_days * lanes" },
      { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "duration_days / 10" },
    ],
  },
  {
    key: "RSA_UMLEITUNG_EINRICHTEN",
    title: "Umleitung einrichten (Beschilderung + Einrichtung)",
    unit: "psch",
    category: CAT,
    tags: ["RSA", "Umleitung"],
    paramsJson: { defaultParams: { complexity: 2 } },
    components: [
      { type: "LABOR", refKey: "LABOR:STRASSENBAUER", qtyFormula: "2 + complexity" },
      { type: "MATERIAL", refKey: "MATERIAL:VERKEHRSSCHILD", qtyFormula: "10 + complexity * 5" },
      { type: "MACHINE", refKey: "MACHINE:TRANSPORTER", qtyFormula: "1" },
    ],
  },
];

async function main() {
  console.log("[seed] kalkulation templates – Block 11 (Verkehrssicherung / RSA)");

  let templatesUpserted = 0;
  let componentsUpserted = 0;

  for (const t of templates) {
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
          sort: i,
          mandatory: c.mandatory ?? true,
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
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());

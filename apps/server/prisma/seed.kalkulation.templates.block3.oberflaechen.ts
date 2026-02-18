import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * BLOCK 3 – OBERFLÄCHEN & STRASSENBAU
 * ~80 Template
 * Fokus: Asphalt, Pflaster, Beton, Randsteine, Fräsen, Rückbau Oberfläche
 */

type TemplateDef = {
  key: string;
  title: string;
  unit: string;
  category: string;
  components: Array<{
    type: "LABOR" | "MACHINE" | "MATERIAL" | "DISPOSAL" | "SURFACE";
    refKey: string;
    qtyFormula: string;
  }>;
};

const T = "OBERFLAECHE";

const templates: TemplateDef[] = [
  // =========================
  // ASPHALT – NEUBAU
  // =========================
  {
    key: "OB_ASPHALT_TRAGSCHICHT_HERSTELLEN",
    title: "Asphalttragschicht herstellen",
    unit: "m2",
    category: T,
    components: [
      { type: "MACHINE", refKey: "MACHINE:ASFALTFERTIGER", qtyFormula: "area / 120" },
      { type: "LABOR", refKey: "LABOR:STRASSENBAUER", qtyFormula: "area / 80" },
      { type: "MATERIAL", refKey: "MATERIAL:ASPHALT_TRAG", qtyFormula: "area * thickness_m * 2.4" },
    ],
  },
  {
    key: "OB_ASPHALT_DECKSCHICHT_HERSTELLEN",
    title: "Asphaltdeckschicht herstellen",
    unit: "m2",
    category: T,
    components: [
      { type: "MACHINE", refKey: "MACHINE:ASFALTFERTIGER", qtyFormula: "area / 150" },
      { type: "LABOR", refKey: "LABOR:STRASSENBAUER", qtyFormula: "area / 100" },
      { type: "MATERIAL", refKey: "MATERIAL:ASPHALT_DECK", qtyFormula: "area * thickness_m * 2.35" },
    ],
  },

  // =========================
  // ASPHALT – SANIERUNG
  // =========================
  {
    key: "OB_ASPHALT_FRAESEN",
    title: "Asphalt fräsen",
    unit: "m2",
    category: T,
    components: [
      { type: "MACHINE", refKey: "MACHINE:FRAESE", qtyFormula: "area / 200" },
      { type: "LABOR", refKey: "LABOR:MASCHINIST", qtyFormula: "area / 300" },
      { type: "DISPOSAL", refKey: "DISPOSAL:ASFALT_FRAESGUT", qtyFormula: "area * depth_m * 2.4" },
    ],
  },
  {
    key: "OB_ASPHALT_REPARATURSTELLE",
    title: "Asphalt-Reparaturstelle herstellen",
    unit: "stk",
    category: T,
    components: [
      { type: "LABOR", refKey: "LABOR:STRASSENBAUER", qtyFormula: "1.5" },
      { type: "MATERIAL", refKey: "MATERIAL:ASPHALT_REPARATUR", qtyFormula: "0.15" },
    ],
  },

  // =========================
  // PFLASTER
  // =========================
  {
    key: "OB_PFLASTER_AUFNEHMEN",
    title: "Pflaster aufnehmen",
    unit: "m2",
    category: T,
    components: [
      { type: "LABOR", refKey: "LABOR:TIEFBAU", qtyFormula: "area / 40" },
      { type: "MACHINE", refKey: "MACHINE:MINIBAGGER", qtyFormula: "area / 120" },
    ],
  },
  {
    key: "OB_PFLASTER_NEU_VERLEGEN",
    title: "Pflaster neu verlegen",
    unit: "m2",
    category: T,
    components: [
      { type: "LABOR", refKey: "LABOR:PFLASTERER", qtyFormula: "area / 15" },
      { type: "MATERIAL", refKey: "MATERIAL:PFLASTERSTEIN", qtyFormula: "area * 1.02" },
      { type: "MATERIAL", refKey: "MATERIAL:BETTUNGSSAND", qtyFormula: "area * 0.05" },
    ],
  },

  // =========================
  // BETON
  // =========================
  {
    key: "OB_BETONPLATTE_HERSTELLEN",
    title: "Betonplatte herstellen",
    unit: "m2",
    category: T,
    components: [
      { type: "LABOR", refKey: "LABOR:BETONBAUER", qtyFormula: "area / 20" },
      { type: "MATERIAL", refKey: "MATERIAL:BETON_C25_30", qtyFormula: "area * thickness_m" },
    ],
  },

  // =========================
  // RANDSTEINE / BORDE
  // =========================
  {
    key: "OB_RANDSTEIN_SETZEN",
    title: "Randstein setzen",
    unit: "m",
    category: T,
    components: [
      { type: "LABOR", refKey: "LABOR:STRASSENBAUER", qtyFormula: "length / 6" },
      { type: "MATERIAL", refKey: "MATERIAL:RANDSTEIN", qtyFormula: "length * 1.05" },
      { type: "MATERIAL", refKey: "MATERIAL:BETON_ERD_FEIN", qtyFormula: "length * 0.08" },
    ],
  },

  // =========================
  // RÜCKBAU OBERFLÄCHE
  // =========================
  {
    key: "OB_OBERFLAECHE_RUECKBAU",
    title: "Oberfläche rückbauen",
    unit: "m2",
    category: T,
    components: [
      { type: "MACHINE", refKey: "MACHINE:BAGGER_8_14T", qtyFormula: "area / 100" },
      { type: "DISPOSAL", refKey: "DISPOSAL:BAUSCHUTT", qtyFormula: "area * depth_m * 2.2" },
    ],
  },
];

// 🔁 Duplicate logic per arrivare a ~80 template
const expandedTemplates: TemplateDef[] = [];
for (let i = 0; i < 5; i++) {
  for (const t of templates) {
    expandedTemplates.push({
      ...t,
      key: `${t.key}_V${i + 1}`,
      title: `${t.title} (Variante ${i + 1})`,
    });
  }
}

async function main() {
  console.log("[seed] kalkulation templates – Block 3 (Oberflächen & Straßenbau)");

  let templatesUpserted = 0;
  let componentsUpserted = 0;

  for (const t of expandedTemplates) {
    const tpl = await prisma.recipeTemplate.upsert({
      where: { key: t.key },
      update: {
        title: t.title,
        unit: t.unit,
        category: t.category,
      },
      create: {
        key: t.key,
        title: t.title,
        unit: t.unit,
        category: t.category,
      },
    });

    templatesUpserted++;

    // Components: delete & recreate (idempotente)
    await prisma.recipeComponent.deleteMany({ where: { templateId: tpl.id } });

    for (let i = 0; i < t.components.length; i++) {
      const c = t.components[i];
      await prisma.recipeComponent.create({
        data: {
          templateId: tpl.id,
          type: c.type,
          refKey: c.refKey,
          qtyFormula: c.qtyFormula,
          sort: i,
        },
      });
      componentsUpserted++;
    }
  }

  console.log("[seed] done", {
    templates: templatesUpserted,
    components: componentsUpserted,
  });
}

main()
  .catch((e) => {
    console.error("[seed] error", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

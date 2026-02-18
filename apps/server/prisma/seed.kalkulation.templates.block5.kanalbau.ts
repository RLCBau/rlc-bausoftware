import "dotenv/config";
import { PrismaClient, $Enums } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * BLOCK 5 – KANALBAU / SCHÄCHTE / ENTWÄSSERUNG
 * Obiettivo: aggiungere template "reali" (non duplicati finti)
 * - Upsert template (key)
 * - Delete & recreate components per template (idempotente)
 * - Usa campi compatibili con schema già usato nei Block 1-4: title/unit/category/paramsJson
 */

type ComponentDef = {
  type: $Enums.RecipeComponentType;
  refKey: string;
  qtyFormula: string;
};

type TemplateDef = {
  key: string;
  title: string;
  unit: string;
  category: string;
  paramsJson?: any;
  components: ComponentDef[];
};

const CAT = "KANALBAU";

// Helpers
const dnListMain = [160, 200, 250, 300, 400, 500, 600];
const dnHaus = [110, 125, 160, 200];
const schachtDn = [600, 800, 1000, 1200];
const trenchDepth = [1.0, 1.2, 1.5, 1.8, 2.2];

function tplKey(base: string, suffix: string) {
  return `${base}_${suffix}`.replace(/[^A-Z0-9_]/g, "_").toUpperCase();
}

function defaultParams(extra?: Record<string, any>) {
  return {
    defaultParams: {
      dn_mm: 200,
      depth_m: 1.2,
      width_m: 0.6,
      thickness_m: 0.1,
      bedding: true,
      ...extra,
    },
  };
}

/**
 * Templates “base” + generator per DN/Depth.
 * Nota: le formule usano variabili standard (length/area/volume) e param (dn_mm, depth_m, bedding...).
 * Il tuo engine può decidere come calcolare "length" dalla posizione; paramsJson aiuta SMART variants dopo.
 */

const templates: TemplateDef[] = [];

/* =========================
   ROHRLEITUNG VERLEGEN – PVC/PP (Hauptkanal)
   ========================= */
for (const dn of dnListMain) {
  templates.push({
    key: tplKey("KANAL_ROHR_PVC_VERLEGEN", `DN${dn}`),
    title: `Kanalrohr PVC/PP verlegen DN ${dn}`,
    unit: "m",
    category: CAT,
    paramsJson: defaultParams({ dn_mm: dn, bedding: true, depth_m: 1.5 }),
    components: [
      { type: $Enums.RecipeComponentType.MACHINE, refKey: "MACHINE:BAGGER_8_14T", qtyFormula: "length / 35" },
      { type: $Enums.RecipeComponentType.LABOR, refKey: "LABOR:TIEFBAU", qtyFormula: "length / 18" },
      { type: $Enums.RecipeComponentType.MATERIAL, refKey: "MATERIAL:KANALROHR_PVC", qtyFormula: "length * 1.02" },
      { type: $Enums.RecipeComponentType.MATERIAL, refKey: "MATERIAL:BETTUNGSSAND", qtyFormula: "bedding ? (length * 0.08) : 0" },
    ],
  });
}

/* =========================
   HAUSANSCHLUSS / GRUNDLEITUNG
   ========================= */
for (const dn of dnHaus) {
  templates.push({
    key: tplKey("KANAL_HAUSANSCHLUSS_VERLEGEN", `DN${dn}`),
    title: `Hausanschlussleitung verlegen DN ${dn}`,
    unit: "m",
    category: CAT,
    paramsJson: defaultParams({ dn_mm: dn, bedding: true, depth_m: 1.2 }),
    components: [
      { type: $Enums.RecipeComponentType.MACHINE, refKey: "MACHINE:MINIBAGGER", qtyFormula: "length / 45" },
      { type: $Enums.RecipeComponentType.LABOR, refKey: "LABOR:TIEFBAU", qtyFormula: "length / 22" },
      { type: $Enums.RecipeComponentType.MATERIAL, refKey: "MATERIAL:HAUSANSCHLUSS_ROHR", qtyFormula: "length * 1.03" },
      { type: $Enums.RecipeComponentType.MATERIAL, refKey: "MATERIAL:BETTUNGSSAND", qtyFormula: "length * 0.06" },
    ],
  });
}

/* =========================
   SCHÄCHTE – SETZEN / ANSCHLIESSEN
   ========================= */
for (const dn of schachtDn) {
  templates.push({
    key: tplKey("KANAL_SCHACHT_SETZEN", `DN${dn}`),
    title: `Kontrollschacht setzen DN ${dn}`,
    unit: "stk",
    category: CAT,
    paramsJson: defaultParams({ dn_mm: dn, depth_m: 2.0 }),
    components: [
      { type: $Enums.RecipeComponentType.MACHINE, refKey: "MACHINE:BAGGER_14_20T", qtyFormula: "1.2" },
      { type: $Enums.RecipeComponentType.LABOR, refKey: "LABOR:TIEFBAU", qtyFormula: "6.0" },
      { type: $Enums.RecipeComponentType.MATERIAL, refKey: "MATERIAL:SCHACHT_FERTIGTEIL", qtyFormula: "1.0" },
      { type: $Enums.RecipeComponentType.MATERIAL, refKey: "MATERIAL:BETON_ERD_FEIN", qtyFormula: "0.35" },
    ],
  });

  templates.push({
    key: tplKey("KANAL_SCHACHT_ANBINDEN", `DN${dn}`),
    title: `Schacht anbinden DN ${dn} (Ein-/Auslauf)`,
    unit: "stk",
    category: CAT,
    paramsJson: defaultParams({ dn_mm: dn }),
    components: [
      { type: $Enums.RecipeComponentType.LABOR, refKey: "LABOR:TIEFBAU", qtyFormula: "2.5" },
      { type: $Enums.RecipeComponentType.MATERIAL, refKey: "MATERIAL:DICHTUNG_SCHACHT", qtyFormula: "1.0" },
      { type: $Enums.RecipeComponentType.MATERIAL, refKey: "MATERIAL:MONTAGEMATERIAL", qtyFormula: "0.2" },
    ],
  });
}

/* =========================
   DRÄNAGE / SICKERLEITUNG
   ========================= */
templates.push({
  key: "KANA_DRÄNAGE_ROHR_VERLEGEN",
  title: "Dränagerohr verlegen (Sickerleitung)",
  unit: "m",
  category: CAT,
  paramsJson: defaultParams({ dn_mm: 100, depth_m: 0.8 }),
  components: [
    { type: $Enums.RecipeComponentType.MACHINE, refKey: "MACHINE:MINIBAGGER", qtyFormula: "length / 55" },
    { type: $Enums.RecipeComponentType.LABOR, refKey: "LABOR:TIEFBAU", qtyFormula: "length / 25" },
    { type: $Enums.RecipeComponentType.MATERIAL, refKey: "MATERIAL:DRAENROHR", qtyFormula: "length * 1.03" },
    { type: $Enums.RecipeComponentType.MATERIAL, refKey: "MATERIAL:FILTERKIES", qtyFormula: "length * 0.05" },
  ],
});

/* =========================
   GRABEN / AUSHUB / ENTSORGUNG – kanal-spezifisch
   (template veri + parametri per SMART variants dopo)
   ========================= */
for (const d of trenchDepth) {
  templates.push({
    key: tplKey("KANAL_GRABEN_AUSHUB", `T${String(d).replace(".", "_")}M`),
    title: `Graben Aushub (Kanal) Tiefe ${d} m`,
    unit: "m",
    category: CAT,
    paramsJson: defaultParams({ depth_m: d, width_m: 0.8, soilClass: "BK3" }),
    components: [
      { type: $Enums.RecipeComponentType.MACHINE, refKey: "MACHINE:BAGGER_8_14T", qtyFormula: "length / 30" },
      { type: $Enums.RecipeComponentType.LABOR, refKey: "LABOR:TIEFBAU", qtyFormula: "length / 14" },
      { type: $Enums.RecipeComponentType.DISPOSAL, refKey: "DISPOSAL:AUSHUB", qtyFormula: "length * width_m * depth_m" },
    ],
  });
}

async function main() {
  console.log("[seed] kalkulation templates – Block 5 (Kanalbau / Schächte)");

  let templatesUpserted = 0;
  let componentsUpserted = 0;

  for (const t of templates) {
    const tpl = await prisma.recipeTemplate.upsert({
      where: { key: t.key },
      update: {
        title: t.title,
        unit: t.unit,
        category: t.category,
        paramsJson: t.paramsJson ?? undefined,
      },
      create: {
        key: t.key,
        title: t.title,
        unit: t.unit,
        category: t.category,
        paramsJson: t.paramsJson ?? undefined,
      },
    });

    templatesUpserted++;

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

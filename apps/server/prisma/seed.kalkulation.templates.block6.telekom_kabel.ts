import "dotenv/config";
import { PrismaClient, $Enums } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * BLOCK 6 – TELEKOM / KABEL / SPEEDPIPE / MICRODUCT
 * - Template reali per Verlegen/Einblasen/Muffen/Schächte klein
 * - Stessa logica idempotente dei blocchi precedenti
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

const CAT = "TELEKOM";

const microduct = [7, 10, 12, 14, 16];
const kabelDn = [32, 40, 50, 63, 90, 110];

function defaultParams(extra?: Record<string, any>) {
  return {
    defaultParams: {
      dn_mm: 50,
      depth_m: 1.0,
      width_m: 0.4,
      ducts: 1,
      bends: 0,
      ...extra,
    },
  };
}

const templates: TemplateDef[] = [];

/* =========================
   MICRODUCT VERLEGEN (in Graben/Trasse)
   ========================= */
for (const md of microduct) {
  templates.push({
    key: `TELEKOM_MICRODUCT_${md}_VERLEGEN`,
    title: `Telekom Microduct ${md} mm verlegen`,
    unit: "m",
    category: CAT,
    paramsJson: defaultParams({ microduct_mm: md, depth_m: 0.9, width_m: 0.35 }),
    components: [
      { type: $Enums.RecipeComponentType.LABOR, refKey: "LABOR:TIEFBAU", qtyFormula: "length / 45" },
      { type: $Enums.RecipeComponentType.MATERIAL, refKey: "MATERIAL:MICRODUCT", qtyFormula: "length * 1.02" },
      { type: $Enums.RecipeComponentType.MATERIAL, refKey: "MATERIAL:WARNBAND", qtyFormula: "length * 1.0" },
    ],
  });

  templates.push({
    key: `TELEKOM_MICRODUCT_${md}_EINBLASEN`,
    title: `Microduct ${md} mm – Kabel einblasen`,
    unit: "m",
    category: CAT,
    paramsJson: defaultParams({ microduct_mm: md }),
    components: [
      { type: $Enums.RecipeComponentType.MACHINE, refKey: "MACHINE:EINBLASGERAET", qtyFormula: "length / 600" },
      { type: $Enums.RecipeComponentType.LABOR, refKey: "LABOR:MONTEUR_TELEKOM", qtyFormula: "length / 220" },
      { type: $Enums.RecipeComponentType.MATERIAL, refKey: "MATERIAL:GLEITMITTEL", qtyFormula: "length / 500" },
    ],
  });
}

/* =========================
   SPEEDPIPE / ROHRVERBAND
   ========================= */
templates.push({
  key: "TELEKOM_SPEEDPIPE_VERLEGEN",
  title: "Speedpipe Rohrverband verlegen",
  unit: "m",
  category: CAT,
  paramsJson: defaultParams({ ducts: 4, depth_m: 1.1, width_m: 0.5 }),
  components: [
    { type: $Enums.RecipeComponentType.MACHINE, refKey: "MACHINE:MINIBAGGER", qtyFormula: "length / 60" },
    { type: $Enums.RecipeComponentType.LABOR, refKey: "LABOR:TIEFBAU", qtyFormula: "length / 28" },
    { type: $Enums.RecipeComponentType.MATERIAL, refKey: "MATERIAL:SPEEDPIPE", qtyFormula: "length * 1.02" },
    { type: $Enums.RecipeComponentType.MATERIAL, refKey: "MATERIAL:WARNBAND", qtyFormula: "length" },
  ],
});

/* =========================
   KABELSCHUTZROHR (PEHD) – Telekom
   ========================= */
for (const dn of kabelDn) {
  templates.push({
    key: `TELEKOM_KABELSCHUTZROHR_DN${dn}_VERLEGEN`,
    title: `Kabelschutzrohr PEHD DN ${dn} verlegen`,
    unit: "m",
    category: CAT,
    paramsJson: defaultParams({ dn_mm: dn, depth_m: 0.8 }),
    components: [
      { type: $Enums.RecipeComponentType.MACHINE, refKey: "MACHINE:MINIBAGGER", qtyFormula: "length / 55" },
      { type: $Enums.RecipeComponentType.LABOR, refKey: "LABOR:TIEFBAU", qtyFormula: "length / 26" },
      { type: $Enums.RecipeComponentType.MATERIAL, refKey: "MATERIAL:PEHD_ROHR", qtyFormula: "length * 1.02" },
    ],
  });
}

/* =========================
   MUFFEN / SPLEISS / ABSCHLUSS
   ========================= */
templates.push({
  key: "TELEKOM_MUFFE_SETZEN",
  title: "Telekom Muffe setzen (Spleiß / Verbindung)",
  unit: "stk",
  category: CAT,
  paramsJson: defaultParams({ splices: 24 }),
  components: [
    { type: $Enums.RecipeComponentType.LABOR, refKey: "LABOR:MONTEUR_TELEKOM", qtyFormula: "3.5" },
    { type: $Enums.RecipeComponentType.MATERIAL, refKey: "MATERIAL:MUFFE", qtyFormula: "1.0" },
    { type: $Enums.RecipeComponentType.MATERIAL, refKey: "MATERIAL:SPLEISSKIT", qtyFormula: "1.0" },
  ],
});

templates.push({
  key: "TELEKOM_ABSCHLUSS_HAUSUEBERGABE",
  title: "Hausübergabepunkt / Abschluss setzen",
  unit: "stk",
  category: CAT,
  paramsJson: defaultParams(),
  components: [
    { type: $Enums.RecipeComponentType.LABOR, refKey: "LABOR:MONTEUR_TELEKOM", qtyFormula: "2.0" },
    { type: $Enums.RecipeComponentType.MATERIAL, refKey: "MATERIAL:HAUSUEBERGABE_BOX", qtyFormula: "1.0" },
  ],
});

/* =========================
   KLEINSCHACHT / HANDLOCH
   ========================= */
templates.push({
  key: "TELEKOM_HANDLOCH_SETZEN",
  title: "Telekom Handloch setzen",
  unit: "stk",
  category: CAT,
  paramsJson: defaultParams({ depth_m: 1.0 }),
  components: [
    { type: $Enums.RecipeComponentType.MACHINE, refKey: "MACHINE:MINIBAGGER", qtyFormula: "0.6" },
    { type: $Enums.RecipeComponentType.LABOR, refKey: "LABOR:TIEFBAU", qtyFormula: "2.5" },
    { type: $Enums.RecipeComponentType.MATERIAL, refKey: "MATERIAL:HANDLOCH", qtyFormula: "1.0" },
  ],
});

/* =========================
   GRABEN TELEKOM (Aushub + Verfüllung)
   ========================= */
templates.push({
  key: "TELEKOM_GRABEN_AUSHUB",
  title: "Telekom-Graben Aushub",
  unit: "m",
  category: CAT,
  paramsJson: defaultParams({ depth_m: 0.9, width_m: 0.35, soilClass: "BK3" }),
  components: [
    { type: $Enums.RecipeComponentType.MACHINE, refKey: "MACHINE:MINIBAGGER", qtyFormula: "length / 70" },
    { type: $Enums.RecipeComponentType.LABOR, refKey: "LABOR:TIEFBAU", qtyFormula: "length / 30" },
    { type: $Enums.RecipeComponentType.DISPOSAL, refKey: "DISPOSAL:AUSHUB", qtyFormula: "length * width_m * depth_m" },
  ],
});

templates.push({
  key: "TELEKOM_GRABEN_WIEDERVERFUELLUNG",
  title: "Telekom-Graben Wiederverfüllung & Verdichtung",
  unit: "m",
  category: CAT,
  paramsJson: defaultParams({ depth_m: 0.9, width_m: 0.35 }),
  components: [
    { type: $Enums.RecipeComponentType.MACHINE, refKey: "MACHINE:RUETTELPLATTE", qtyFormula: "length / 120" },
    { type: $Enums.RecipeComponentType.LABOR, refKey: "LABOR:TIEFBAU", qtyFormula: "length / 40" },
    { type: $Enums.RecipeComponentType.MATERIAL, refKey: "MATERIAL:FUELLKIES", qtyFormula: "length * width_m * depth_m * 0.35" },
  ],
});

async function main() {
  console.log("[seed] kalkulation templates – Block 6 (Telekom / Kabel)");

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

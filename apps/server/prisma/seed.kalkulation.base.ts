import "dotenv/config";
import { PrismaClient, RecipeComponentType } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Base seed (10 template reali Tiefbau)
 * - Upsert per key (idempotente)
 * - Components: replace-all per template
 * - Variants: per ora NON create (le generiamo dopo con generator)
 */

type ComponentSeed = {
  type: RecipeComponentType;
  refKey: string;
  qtyFormula: string;
  mandatory?: boolean;
  riskFactor?: number;
  sort?: number;
  note?: string | null;
};

type TemplateSeed = {
  key: string;
  title: string;
  category: string;
  unit: string;
  description?: string;
  tags: string[];
  paramsJson: any;
  components: ComponentSeed[];
};

const templates: TemplateSeed[] = [
  {
    key: "TB_GRABEN_AUSHUB_STANDARD",
    title: "Graben ausheben (Standard)",
    category: "TIEFBAU",
    unit: "m",
    description:
      "Aushub Graben je laufender Meter inkl. Bagger, Personal; Parameter: Tiefe/Breite/Bodenklasse.",
    tags: ["graben", "aushub", "bagger", "boden", "trench"],
    paramsJson: {
      version: 1,
      defaultParams: {
        length_m: 10,
        depth_m: 1.2,
        width_m: 0.6,
        soilClass: "BK3",
        restricted: false,
        groundwater: false,
      },
      schema: {
        length_m: { type: "number", min: 0.1 },
        depth_m: { type: "number", min: 0.2 },
        width_m: { type: "number", min: 0.2 },
        soilClass: { type: "string", enum: ["BK1", "BK2", "BK3", "BK4", "BK5", "BK6", "BK7"] },
        restricted: { type: "boolean" },
        groundwater: { type: "boolean" },
      },
    },
    components: [
      {
        type: "MACHINE",
        refKey: "MACHINE:BAGGER_8_14T",
        qtyFormula: "params.length_m * (0.08 + params.depth_m*0.02 + (params.soilClass==='BK5'||params.soilClass==='BK6'||params.soilClass==='BK7'?0.03:0)) * (params.restricted?1.25:1)",
        sort: 10,
        note: "Baggerstunden (h)",
      },
      {
        type: "LABOR",
        refKey: "LABOR:FACHARBEITER",
        qtyFormula: "params.length_m * (0.12 + params.depth_m*0.03) * (params.restricted?1.20:1)",
        sort: 20,
        note: "Mannstunden (h)",
      },
      {
        type: "OTHER",
        refKey: "OTHER:BAUSTELLENEINRICHTUNG_ANTEIL",
        qtyFormula: "Math.max(1, params.length_m/50)",
        sort: 90,
        note: "Anteil Baustelleneinrichtung (Pauschal/Einheit)",
      },
    ],
  },

  {
    key: "TB_GRABEN_VERBAU",
    title: "Grabenverbau / Verbau (nach Tiefe)",
    category: "TIEFBAU",
    unit: "m",
    description: "Verbau je lfm abhängig von Tiefe, beengten Verhältnissen.",
    tags: ["verbau", "grabenverbau", "shoring"],
    paramsJson: {
      version: 1,
      defaultParams: { length_m: 10, depth_m: 1.2, restricted: false },
      schema: {
        length_m: { type: "number", min: 0.1 },
        depth_m: { type: "number", min: 0.2 },
        restricted: { type: "boolean" },
      },
    },
    components: [
      {
        type: "MATERIAL",
        refKey: "MATERIAL:VERBAU_ELEMENTE",
        qtyFormula: "params.length_m * (params.depth_m<=1.25?1: (params.depth_m<=1.75?1.2:1.5))",
        sort: 10,
        note: "Verbau-Elemente (m-Äquivalent)",
      },
      {
        type: "LABOR",
        refKey: "LABOR:FACHARBEITER",
        qtyFormula: "params.length_m * (0.10 + params.depth_m*0.04) * (params.restricted?1.15:1)",
        sort: 20,
        note: "Montage/Demontage (h)",
      },
      {
        type: "MACHINE",
        refKey: "MACHINE:BAGGER_8_14T",
        qtyFormula: "params.length_m * (0.05 + params.depth_m*0.02) * (params.restricted?1.10:1)",
        sort: 30,
        note: "Assistenz Verbau (h)",
      },
    ],
  },

  {
    key: "TB_WIEDERVERFUELLUNG_RINNE",
    title: "Wiederverfüllung / Rinne verfüllen & verdichten",
    category: "TIEFBAU",
    unit: "m",
    description: "Verfüllen je lfm inkl. Verdichtung; abhängig von Tiefe/Breite.",
    tags: ["verfüllung", "verdichten", "rückbau", "backfill"],
    paramsJson: {
      version: 1,
      defaultParams: { length_m: 10, depth_m: 1.2, width_m: 0.6, materialType: "AUSHUB" },
      schema: {
        length_m: { type: "number", min: 0.1 },
        depth_m: { type: "number", min: 0.2 },
        width_m: { type: "number", min: 0.2 },
        materialType: { type: "string", enum: ["AUSHUB", "FROSTSCHUTZ", "KIES_SAND"] },
      },
    },
    components: [
      {
        type: "MACHINE",
        refKey: "MACHINE:RUETTELPLATTE",
        qtyFormula: "params.length_m * (0.06 + params.depth_m*0.01)",
        sort: 10,
        note: "Verdichtung (h)",
      },
      {
        type: "LABOR",
        refKey: "LABOR:FACHARBEITER",
        qtyFormula: "params.length_m * (0.10 + params.depth_m*0.02)",
        sort: 20,
        note: "Einbauen/Abziehen (h)",
      },
      {
        type: "MATERIAL",
        refKey: "MATERIAL:FROSTSCHUTZ_0_32",
        qtyFormula:
          "params.materialType==='FROSTSCHUTZ' ? (params.length_m*params.depth_m*params.width_m*0.6) : 0",
        sort: 40,
        note: "m3 Frostschutz (optional)",
        mandatory: false,
      },
    ],
  },

  {
    key: "TB_ENTSORGUNG_AUSHUB",
    title: "Aushub entsorgen (Abfuhr + Deponie)",
    category: "TIEFBAU",
    unit: "m3",
    description: "Entsorgung Boden/Aushub je m³ inkl. LKW und Deponiegebühr.",
    tags: ["entsorgung", "deponie", "aushub", "abfuhr"],
    paramsJson: {
      version: 1,
      defaultParams: { volume_m3: 20, disposalClass: "DK0", distance_km: 10 },
      schema: {
        volume_m3: { type: "number", min: 0.1 },
        disposalClass: { type: "string", enum: ["DK0", "DKI", "DKII", "Z0", "Z1.1", "Z1.2", "Z2"] },
        distance_km: { type: "number", min: 0 },
      },
    },
    components: [
      {
        type: "MACHINE",
        refKey: "MACHINE:LKW_3ACHSER",
        qtyFormula: "params.volume_m3 * (0.08 + params.distance_km*0.002)",
        sort: 10,
        note: "Transportzeit (h) pro m3 Näherung",
      },
      {
        type: "DISPOSAL",
        refKey: "DISPOSAL:DEPONIE",
        qtyFormula: "params.volume_m3",
        sort: 20,
        note: "Deponiemenge (t/m3 Umrechnung in Preisen möglich)",
      },
      {
        type: "LABOR",
        refKey: "LABOR:HILFSARBEITER",
        qtyFormula: "params.volume_m3 * 0.02",
        sort: 30,
        note: "Ladungssicherung/Einweisung (h)",
      },
    ],
  },

  {
    key: "WASSER_ROHR_PEHD_VERLEGEN",
    title: "Wasserleitung PEHD verlegen (Rohr + Montage)",
    category: "WASSER",
    unit: "m",
    description: "PEHD Rohr verlegen je lfm inkl. Personal, Kleinmaterial; DN abhängig.",
    tags: ["wasser", "pehd", "rohr", "verlegen", "dn"],
    paramsJson: {
      version: 1,
      defaultParams: { length_m: 50, dn_mm: 63, pressureBar: 10, fittings_per_10m: 1 },
      schema: {
        length_m: { type: "number", min: 0.1 },
        dn_mm: { type: "number", min: 20 },
        pressureBar: { type: "number", min: 1 },
        fittings_per_10m: { type: "number", min: 0 },
      },
    },
    components: [
      {
        type: "MATERIAL",
        refKey: "MATERIAL:ROHR_PEHD",
        qtyFormula: "params.length_m",
        sort: 10,
        note: "Rohrmeter",
      },
      {
        type: "MATERIAL",
        refKey: "MATERIAL:FORMTEILE_PEHD",
        qtyFormula: "params.length_m * (params.fittings_per_10m/10)",
        sort: 20,
        note: "Formteile (Stk/Äquivalent)",
      },
      {
        type: "LABOR",
        refKey: "LABOR:ROHRLEGER",
        qtyFormula: "params.length_m * (0.08 + (params.dn_mm>=110?0.03:0))",
        sort: 30,
        note: "Montage (h)",
      },
      {
        type: "OTHER",
        refKey: "OTHER:KLEINMATERIAL",
        qtyFormula: "Math.max(1, params.length_m/25)",
        sort: 90,
        note: "Pauschale Kleinmaterial",
      },
    ],
  },

  {
    key: "KANAL_ROHR_PVC_VERLEGEN",
    title: "Kanalrohr verlegen (PVC/PP, inkl. Muffen)",
    category: "KANAL",
    unit: "m",
    description: "Kanalrohr DN abhängig verlegen je lfm.",
    tags: ["kanal", "abwasser", "rohr", "dn", "pp", "pvc"],
    paramsJson: {
      version: 1,
      defaultParams: { length_m: 30, dn_mm: 200, bedding: true },
      schema: {
        length_m: { type: "number", min: 0.1 },
        dn_mm: { type: "number", min: 100 },
        bedding: { type: "boolean" },
      },
    },
    components: [
      { type: "MATERIAL", refKey: "MATERIAL:KANALROHR", qtyFormula: "params.length_m", sort: 10 },
      {
        type: "LABOR",
        refKey: "LABOR:ROHRLEGER",
        qtyFormula: "params.length_m * (0.10 + (params.dn_mm>=300?0.05:0))",
        sort: 20,
        note: "Einbau (h)",
      },
      {
        type: "MATERIAL",
        refKey: "MATERIAL:BETTUNGSSAND",
        qtyFormula: "params.bedding ? (params.length_m * (params.dn_mm/1000) * 0.15) : 0",
        sort: 30,
        mandatory: false,
        note: "m3 Näherung Bettung",
      },
    ],
  },

  {
    key: "TB_BETTUNG_SAND",
    title: "Leitungsbettung Sand (unter/seitlich)",
    category: "TIEFBAU",
    unit: "m3",
    description: "Bettungssand nach Rohr DN und Länge (Näherung).",
    tags: ["bettung", "sand", "rohrbettung"],
    paramsJson: {
      version: 1,
      defaultParams: { length_m: 30, dn_mm: 63, thickness_m: 0.10 },
      schema: {
        length_m: { type: "number", min: 0.1 },
        dn_mm: { type: "number", min: 20 },
        thickness_m: { type: "number", min: 0.05 },
      },
    },
    components: [
      {
        type: "MATERIAL",
        refKey: "MATERIAL:BETTUNGSSAND",
        qtyFormula: "params.length_m * ((params.dn_mm/1000) + 0.30) * params.thickness_m",
        sort: 10,
        note: "m3 Sand",
      },
      {
        type: "LABOR",
        refKey: "LABOR:HILFSARBEITER",
        qtyFormula: "params.length_m * 0.03",
        sort: 20,
        note: "Einbringen/Abziehen (h)",
      },
    ],
  },

  {
    key: "OBERFLAECHE_ASPHALT_WIEDERHERSTELLEN",
    title: "Asphalt wiederherstellen (Tragschicht + Deckschicht)",
    category: "OBERFLAECHE",
    unit: "m2",
    description: "Wiederherstellung Asphaltfläche je m², inkl. Einbau.",
    tags: ["asphalt", "oberfläche", "deckschicht", "tragschicht"],
    paramsJson: {
      version: 1,
      defaultParams: { area_m2: 50, deck_cm: 4, trag_cm: 10 },
      schema: {
        area_m2: { type: "number", min: 0.1 },
        deck_cm: { type: "number", min: 2 },
        trag_cm: { type: "number", min: 4 },
      },
    },
    components: [
      { type: "MATERIAL", refKey: "MATERIAL:ASPHALT_DECKSCHICHT", qtyFormula: "params.area_m2", sort: 10 },
      { type: "MATERIAL", refKey: "MATERIAL:ASPHALT_TRAGSCHICHT", qtyFormula: "params.area_m2", sort: 20 },
      { type: "MACHINE", refKey: "MACHINE:WALZE", qtyFormula: "params.area_m2 * 0.01", sort: 30, note: "h" },
      { type: "LABOR", refKey: "LABOR:STRASSENBAUER", qtyFormula: "params.area_m2 * 0.02", sort: 40, note: "h" },
    ],
  },

  {
    key: "OBERFLAECHE_PFLASTER_WIEDERHERSTELLEN",
    title: "Pflaster wiederherstellen (Pflaster + Bettung)",
    category: "OBERFLAECHE",
    unit: "m2",
    description: "Wiederherstellung Pflasterfläche je m² inkl. Bettung.",
    tags: ["pflaster", "pave", "oberfläche", "bettung"],
    paramsJson: {
      version: 1,
      defaultParams: { area_m2: 30, bedding_cm: 4 },
      schema: {
        area_m2: { type: "number", min: 0.1 },
        bedding_cm: { type: "number", min: 2 },
      },
    },
    components: [
      { type: "MATERIAL", refKey: "MATERIAL:PFLASTERSTEINE", qtyFormula: "params.area_m2", sort: 10 },
      { type: "MATERIAL", refKey: "MATERIAL:BETTUNGSSAND", qtyFormula: "params.area_m2 * (params.bedding_cm/100)", sort: 20 },
      { type: "MACHINE", refKey: "MACHINE:RUETTELPLATTE", qtyFormula: "params.area_m2 * 0.01", sort: 30, note: "h" },
      { type: "LABOR", refKey: "LABOR:STRASSENBAUER", qtyFormula: "params.area_m2 * 0.03", sort: 40, note: "h" },
    ],
  },

  {
    key: "WASSER_ANSCHLUSS_BESTAND",
    title: "Anschluss an Bestandsleitung (inkl. Formteile)",
    category: "WASSER",
    unit: "stk",
    description: "Anschluss Bestandsleitung inkl. Arbeitszeit, Formteile, Kleinmaterial.",
    tags: ["anschluss", "bestand", "wasser", "einbindung"],
    paramsJson: {
      version: 1,
      defaultParams: { count: 1, dn_mm: 63, shutoffValve: true },
      schema: {
        count: { type: "number", min: 1 },
        dn_mm: { type: "number", min: 20 },
        shutoffValve: { type: "boolean" },
      },
    },
    components: [
      { type: "LABOR", refKey: "LABOR:ROHRLEGER", qtyFormula: "params.count * 3.5", sort: 10, note: "h/Anschluss" },
      { type: "MATERIAL", refKey: "MATERIAL:FORMTEILE_PEHD", qtyFormula: "params.count * 3", sort: 20, note: "Stk" },
      {
        type: "MATERIAL",
        refKey: "MATERIAL:SCHIEBER",
        qtyFormula: "params.shutoffValve ? params.count : 0",
        sort: 30,
        mandatory: false,
        note: "Stk",
      },
      { type: "OTHER", refKey: "OTHER:KLEINMATERIAL", qtyFormula: "params.count", sort: 90 },
    ],
  },
];

async function upsertTemplate(t: TemplateSeed) {
  const tpl = await prisma.recipeTemplate.upsert({
    where: { key: t.key },
    update: {
      title: t.title,
      category: t.category,
      unit: t.unit,
      description: t.description ?? null,
      paramsJson: t.paramsJson ?? null,
      tags: t.tags ?? [],
    },
    create: {
      key: t.key,
      title: t.title,
      category: t.category,
      unit: t.unit,
      description: t.description ?? null,
      paramsJson: t.paramsJson ?? null,
      tags: t.tags ?? [],
    },
    select: { id: true, key: true },
  });

  // replace components (idempotente)
  await prisma.recipeComponent.deleteMany({ where: { templateId: tpl.id } });
  if (t.components?.length) {
    await prisma.recipeComponent.createMany({
      data: t.components.map((c) => ({
        templateId: tpl.id,
        type: c.type,
        refKey: c.refKey,
        qtyFormula: c.qtyFormula,
        mandatory: c.mandatory ?? true,
        riskFactor: c.riskFactor ?? 1.0,
        sort: c.sort ?? 0,
        note: c.note ?? null,
      })),
    });
  }

  return tpl;
}

async function main() {
  console.log("[seed] kalkulation base: start");

  for (const t of templates) {
    const tpl = await upsertTemplate(t);
    console.log(`  ✓ ${tpl.key}`);
  }

  const [templatesCount, componentsCount, variantsCount] = await Promise.all([
    prisma.recipeTemplate.count(),
    prisma.recipeComponent.count(),
    prisma.recipeVariant.count(),
  ]);

  console.log("[seed] done", { templatesCount, componentsCount, variantsCount });
}

main()
  .catch((e) => {
    console.error("[seed] error", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

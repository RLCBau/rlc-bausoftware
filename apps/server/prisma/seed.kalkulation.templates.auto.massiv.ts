import "dotenv/config";
import { PrismaClient, RecipeComponentType } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();

type ComponentDef = {
  type: RecipeComponentType;
  refKey: string;
  qtyFormula: string;
  sort?: number;
  note?: string;
};

type TemplateDef = {
  key: string;
  title: string;
  category: string;
  unit: string;
  tags: string[];
  paramsJson: any;
  components: ComponentDef[];
  variants: any[];
};

function slug(s: string) {
  return s
    .toUpperCase()
    .replace(/Ä/g, "AE")
    .replace(/Ö/g, "OE")
    .replace(/Ü/g, "UE")
    .replace(/ß/g, "SS")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function hashKey(templateKey: string, params: any) {
  return crypto
    .createHash("sha1")
    .update(templateKey + "|" + JSON.stringify(params))
    .digest("hex")
    .slice(0, 12);
}

const depths = [0.6, 0.8, 1.0, 1.2, 1.5, 1.8, 2.0, 2.5, 3.0, 3.5, 4.0];
const widths = [0.3, 0.4, 0.5, 0.6, 0.8, 1.0, 1.2, 1.5];
const soilClasses = ["BK3", "BK4", "BK5", "BK6", "FELS", "NASS", "BESTAND", "KONTAMINIERT"];
const surfaces = ["UNBEFESTIGT", "RASEN", "SCHOTTER", "PFLASTER", "ASPHALT", "BETON"];
const regions = ["LAND", "STADT", "INNENSTADT", "UNTER_VERKEHR"];
const verbaue = ["OHNE_VERBAU", "BOESCHUNG", "LEICHTVERBAU", "PLATTENVERBAU", "GLEITSCHIENE"];

const pipes = [
  ["SPEEDPIPE_1X10", "Glasfaser Speedpipe 1x10", "GLASFASER"],
  ["SPEEDPIPE_2X10", "Glasfaser Speedpipe 2x10", "GLASFASER"],
  ["SPEEDPIPE_4X10", "Glasfaser Speedpipe 4x10", "GLASFASER"],
  ["SPEEDPIPE_7X10", "Glasfaser Speedpipe 7x10", "GLASFASER"],
  ["SPEEDPIPE_12X10", "Glasfaser Speedpipe 12x10", "GLASFASER"],
  ["KABELSCHUTZ_DN50", "Kabelschutzrohr DN50", "KABELSCHUTZ"],
  ["KABELSCHUTZ_DN75", "Kabelschutzrohr DN75", "KABELSCHUTZ"],
  ["KABELSCHUTZ_DN110", "Kabelschutzrohr DN110", "KABELSCHUTZ"],
  ["PE_DA32", "PE-Wasserleitung DA32", "WASSER"],
  ["PE_DA50", "PE-Wasserleitung DA50", "WASSER"],
  ["PE_DA63", "PE-Wasserleitung DA63", "WASSER"],
  ["PE_DA90", "PE-Wasserleitung DA90", "WASSER"],
  ["PE_DA110", "PE-Wasserleitung DA110", "WASSER"],
  ["PE_DA160", "PE-Wasserleitung DA160", "WASSER"],
  ["KG_DN100", "KG-Rohr DN100", "KANAL"],
  ["KG_DN150", "KG-Rohr DN150", "KANAL"],
  ["KG_DN200", "KG-Rohr DN200", "KANAL"],
  ["PP_DN250", "PP-Rohr DN250", "KANAL"],
  ["PP_DN300", "PP-Rohr DN300", "KANAL"],
  ["BETON_DN300", "Betonrohr DN300", "KANAL"],
  ["BETON_DN400", "Betonrohr DN400", "KANAL"],
  ["BETON_DN500", "Betonrohr DN500", "KANAL"],
  ["BETON_DN600", "Betonrohr DN600", "KANAL"],
  ["DRAINAGE_DN100", "Drainagerohr DN100", "DRAINAGE"],
  ["DRAINAGE_DN150", "Drainagerohr DN150", "DRAINAGE"],
] as const;

function baseComponents(refPrefix: string): ComponentDef[] {
  return [
    {
      type: RecipeComponentType.LABOR,
      refKey: "LABOR:FACHARBEITER",
      qtyFormula: "params.length_m ? params.length_m * 0.08 * params.depth_m : params.volume_m3 * 0.18",
      sort: 10,
    },
    {
      type: RecipeComponentType.LABOR,
      refKey: "LABOR:HELFER",
      qtyFormula: "params.length_m ? params.length_m * 0.05 * params.restrictedFactor : params.volume_m3 * 0.12",
      sort: 20,
    },
    {
      type: RecipeComponentType.MACHINE,
      refKey: "MACHINE:BAGGER_8_14T",
      qtyFormula: "params.length_m ? params.length_m * 0.035 * params.depth_m * params.soilFactor : params.volume_m3 * 0.06",
      sort: 30,
    },
    {
      type: RecipeComponentType.MACHINE,
      refKey: "MACHINE:RUETTELPLATTE",
      qtyFormula: "params.length_m ? params.length_m * 0.015 : params.area_m2 * 0.02",
      sort: 40,
    },
    {
      type: RecipeComponentType.MATERIAL,
      refKey: `RLC_PREIS:${refPrefix}`,
      qtyFormula: "params.length_m || params.area_m2 || params.volume_m3 || params.count || 1",
      sort: 50,
    },
    {
      type: RecipeComponentType.MATERIAL,
      refKey: "RLC_PREIS:tiefbau-rohrbettung-sand",
      qtyFormula: "params.length_m ? params.length_m * params.width_m * 0.10 : 0",
      sort: 60,
    },
  ];
}

function variantParams(extra: any) {
  return {
    length_m: 10,
    area_m2: 10,
    volume_m3: 1,
    count: 1,
    depth_m: extra.depth_m ?? 1.2,
    width_m: extra.width_m ?? 0.4,
    soilClass: extra.soilClass ?? "BK4",
    surface: extra.surface ?? "UNBEFESTIGT",
    region: extra.region ?? "LAND",
    verbau: extra.verbau ?? "OHNE_VERBAU",
    soilFactor: extra.soilFactor ?? 1,
    surfaceFactor: extra.surfaceFactor ?? 1,
    restrictedFactor: extra.restrictedFactor ?? 1,
    ...extra,
  };
}

const templates: TemplateDef[] = [];

/**
 * 1) Komplette Leitungs-/Rohrverlegung:
 * pipe × depth × surface × verbau × region
 */
for (const [pipeKey, pipeTitle, family] of pipes) {
  const key = `${family}_${pipeKey}_KOMPLETT_VERLEGEN`;
  const variants: any[] = [];

  for (const depth of depths) {
    for (const surface of surfaces) {
      for (const verbau of verbaue) {
        for (const region of regions) {
          variants.push(
            variantParams({
              pipe: pipeKey,
              depth_m: depth,
              width_m: pipeKey.includes("DN500") || pipeKey.includes("DN600") ? 1.2 : 0.5,
              surface,
              verbau,
              region,
              restrictedFactor: region === "INNENSTADT" || region === "UNTER_VERKEHR" ? 1.6 : 1,
            })
          );
        }
      }
    }
  }

  templates.push({
    key,
    title: `${pipeTitle} komplett liefern und verlegen`,
    category: `TIEFBAU/${family}`,
    unit: "m",
    tags: ["tiefbau", family.toLowerCase(), "komplett", "leitung", "rohr"],
    paramsJson: { defaultParams: variantParams({ pipe: pipeKey }) },
    components: baseComponents(pipeKey.toLowerCase()),
    variants,
  });
}

/**
 * 2) Graben/Aushub separat:
 * depth × width × soil × surface × region
 */
for (const width of widths) {
  for (const depth of depths) {
    const key = `TB_GRABEN_B${String(width).replace(".", "")}_T${String(depth).replace(".", "")}`;
    const variants: any[] = [];

    for (const soilClass of soilClasses) {
      for (const surface of surfaces) {
        for (const region of regions) {
          variants.push(
            variantParams({
              length_m: 10,
              depth_m: depth,
              width_m: width,
              soilClass,
              surface,
              region,
              soilFactor:
                soilClass === "BK3" ? 0.85 :
                soilClass === "BK4" ? 1 :
                soilClass === "BK5" ? 1.25 :
                soilClass === "BK6" ? 1.55 :
                soilClass === "FELS" ? 2.4 :
                soilClass === "KONTAMINIERT" ? 2.2 : 1.5,
            })
          );
        }
      }
    }

    templates.push({
      key,
      title: `Leitungsgraben herstellen B ${width} m / T ${depth} m`,
      category: "TIEFBAU/ERDARBEITEN",
      unit: "m",
      tags: ["tiefbau", "graben", "aushub", "erdarbeiten"],
      paramsJson: { defaultParams: variantParams({ depth_m: depth, width_m: width }) },
      components: baseComponents("tiefbau-aushub-laden"),
      variants,
    });
  }
}

/**
 * 3) Oberfläche komplett.
 */
const surfaceWorks = [
  ["PFLASTER_AUFNEHMEN", "Pflaster aufnehmen und lagern"],
  ["PFLASTER_WIEDERHERSTELLEN", "Pflaster wiederherstellen"],
  ["ASPHALT_SCHNEIDEN", "Asphalt schneiden"],
  ["ASPHALT_AUFBRECHEN", "Asphalt aufbrechen"],
  ["ASPHALT_WIEDERHERSTELLEN", "Asphalt wiederherstellen"],
  ["RASENGITTER_HERSTELLEN", "Rasengitterpflaster herstellen"],
  ["SCHOTTERFLAECHE_HERSTELLEN", "Schotterfläche herstellen"],
  ["BETONFLAECHE_AUFBRECHEN", "Betonfläche aufbrechen"],
] as const;

for (const [workKey, title] of surfaceWorks) {
  const variants = [];
  for (const surface of surfaces) {
    for (const region of regions) {
      for (const thickness_cm of [4, 6, 8, 10, 12, 15, 20, 30, 40, 50]) {
        variants.push(variantParams({ area_m2: 10, surface, region, thickness_cm }));
      }
    }
  }

  templates.push({
    key: `OBERFLAECHE_${workKey}`,
    title,
    category: "TIEFBAU/OBERFLAECHE",
    unit: "m2",
    tags: ["tiefbau", "oberfläche", "wiederherstellung", "strassenbau"],
    paramsJson: { defaultParams: variantParams({ area_m2: 10, thickness_cm: 10 }) },
    components: baseComponents(`oberflaeche-${workKey.toLowerCase()}`),
    variants,
  });
}

/**
 * 4) Entsorgung / Transport.
 */
const wastes = ["BODEN_Z0", "BODEN_Z1", "BODEN_Z2", "BODEN_DK1", "BODEN_DK2", "ASPHALT_TEERFREI", "ASPHALT_PAK", "BETON", "BAUMISCHABFALL"];
const distances = [5, 10, 20, 30, 50, 75];

for (const waste of wastes) {
  const variants = [];
  for (const km of distances) {
    for (const region of regions) {
      variants.push(variantParams({ quantity_t: 10, distance_km: km, waste, region }));
    }
  }

  templates.push({
    key: `ENTSORGUNG_${waste}`,
    title: `${waste.replace(/_/g, " ")} laden, transportieren und entsorgen`,
    category: "TIEFBAU/ENTSORGUNG",
    unit: "t",
    tags: ["tiefbau", "entsorgung", "deponie", "transport"],
    paramsJson: { defaultParams: variantParams({ quantity_t: 10, distance_km: 10, waste }) },
    components: baseComponents(`entsorgung-${waste.toLowerCase()}`),
    variants,
  });
}

/**
 * 5) Nebenleistungen.
 */
const extras = [
  ["VERKEHRSSICHERUNG_TAGESBAUSTELLE", "Verkehrssicherung Tagesbaustelle", "d"],
  ["AMPELANLAGE", "Mobile Ampelanlage", "d"],
  ["HALTEVERBOT", "Halteverbot einrichten", "St"],
  ["DRUCKPROBE_WASSER", "Druckprüfung Wasserleitung", "St"],
  ["DICHTHEITSPRUEFUNG_KANAL", "Dichtheitsprüfung Kanal", "St"],
  ["KAMERABEFAHRUNG", "Kamerabefahrung Kanal", "m"],
  ["VERDICHTUNGSNACHWEIS", "Verdichtungsnachweis", "St"],
  ["AS_BUILT", "As-Built Dokumentation", "St"],
  ["BESTANDSVERMESSUNG", "Bestandsvermessung", "h"],
  ["SUCHSCHLITZ", "Suchschlitz / Leitungserkundung", "m3"],
  ["HANDSCHACHTUNG", "Handschachtung im Bestand", "m3"],
  ["WASSERHALTUNG", "Wasserhaltung", "d"],
  ["GRABENVERBAU", "Grabenverbau", "m2"],
] as const;

for (const [extraKey, title, unit] of extras) {
  const variants = [];
  for (const region of regions) {
    for (const soilClass of soilClasses.slice(0, 6)) {
      for (const depth of depths.slice(0, 8)) {
        variants.push(variantParams({ region, soilClass, depth_m: depth }));
      }
    }
  }

  templates.push({
    key: `NEBEN_${extraKey}`,
    title,
    category: "TIEFBAU/NEBENLEISTUNGEN",
    unit,
    tags: ["tiefbau", "nebenleistung", "prüfung", "verkehr", "dokumentation"],
    paramsJson: { defaultParams: variantParams({}) },
    components: baseComponents(`nebenleistung-${extraKey.toLowerCase()}`),
    variants,
  });
}

async function main() {
  console.log("[seed] RLC massive auto templates", {
    templates: templates.length,
    variants: templates.reduce((s, t) => s + t.variants.length, 0),
  });

  let tplCount = 0;
  let compCount = 0;
  let variantCount = 0;

  for (const t of templates) {
    const tpl = await prisma.recipeTemplate.upsert({
      where: { key: t.key },
      update: {
        title: t.title,
        category: t.category,
        unit: t.unit,
        description: `Automatisch generiertes RLC Profi-Rezept: ${t.title}`,
        paramsJson: t.paramsJson,
        tags: t.tags,
      },
      create: {
        key: t.key,
        title: t.title,
        category: t.category,
        unit: t.unit,
        description: `Automatisch generiertes RLC Profi-Rezept: ${t.title}`,
        paramsJson: t.paramsJson,
        tags: t.tags,
      },
    });

    tplCount++;

    await prisma.recipeComponent.deleteMany({ where: { templateId: tpl.id } });

    for (const [i, c] of t.components.entries()) {
      await prisma.recipeComponent.create({
        data: {
          templateId: tpl.id,
          type: c.type,
          refKey: c.refKey,
          qtyFormula: c.qtyFormula,
          sort: c.sort ?? i,
          note: c.note,
          mandatory: true,
        },
      });
      compCount++;
    }

    await prisma.recipeVariant.deleteMany({ where: { templateId: tpl.id } });

    const variantRows = t.variants.map((params) => ({
      templateId: tpl.id,
      key: `${t.key}|${hashKey(t.key, params)}`,
      params,
      unit: t.unit,
      enabled: true,
    }));

    const batchSize = 1000;

    for (let i = 0; i < variantRows.length; i += batchSize) {
      const batch = variantRows.slice(i, i + batchSize);

      await prisma.recipeVariant.createMany({
        data: batch,
        skipDuplicates: true,
      });

      variantCount += batch.length;
    }
  }

  console.log("[seed] done", { templates: tplCount, components: compCount, variants: variantCount });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

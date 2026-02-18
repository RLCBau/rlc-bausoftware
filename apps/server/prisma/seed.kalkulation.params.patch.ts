import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * PATCH defaultParams (punto 2)
 * - Garantisce che i template NON-extreme abbiano paramsJson.defaultParams sensati
 * - Evita template "statici" (smart(1)) perché senza defaultParams non si possono generare varianti
 * - Idempotente: merge, non sovrascrive ciò che esiste già
 */

type ParamsJson = {
  defaultParams?: Record<string, any>;
  [k: string]: any;
};

const EXTREME_KEYS = new Set<string>([
  "TB_GRABEN_AUSHUB_STANDARD",
  "TB_GRABEN_VERBAU",
  "TB_WIEDERVERFUELLUNG_RINNE",
  "TB_ENTSORGUNG_AUSHUB",
  "WASSER_ROHR_PEHD_VERLEGEN",
  "KANAL_ROHR_PVC_VERLEGEN",
  "TB_BETTUNG_SAND",
  "OBERFLAECHE_ASPHALT_WIEDERHERSTELLEN",
  "OBERFLAECHE_PFLASTER_WIEDERHERSTELLEN",
  "WASSER_ANSCHLUSS_BESTAND",
]);

function isObject(x: any): x is Record<string, any> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function getDefaultParams(paramsJson: any): Record<string, any> {
  const d = paramsJson?.defaultParams;
  return isObject(d) ? d : {};
}

function hasEmptyDefaultParams(paramsJson: any): boolean {
  const d = getDefaultParams(paramsJson);
  return !Object.keys(d).length;
}

/** Merge: keep existing keys, only fill missing keys */
function mergeDefaults(
  existing: Record<string, any>,
  additions: Record<string, any>
): Record<string, any> {
  const out: Record<string, any> = { ...existing };
  for (const [k, v] of Object.entries(additions)) {
    if (out[k] === undefined) out[k] = v;
  }
  return out;
}

/** Family defaults (conservativi ma utili) */
function familyDefaults(templateKey: string): Record<string, any> | null {
  // TELEKOM
  if (templateKey.startsWith("TELEKOM_MICRODUCT_")) {
    // tenta di estrarre DN dal nome: TELEKOM_MICRODUCT_7_...
    const m = templateKey.match(/TELEKOM_MICRODUCT_(\d+)_/);
    const dn = m ? Number(m[1]) : 10;
    return {
      length: 10, // base per formule tipo length/...
      dn_mm: dn,
      depth_m: 1.2,
      width_m: 0.4,
      restricted: false,
      bedding: true,
    };
  }

  if (
    templateKey.startsWith("TELEKOM_") ||
    templateKey.includes("MICRODUCT") ||
    templateKey.includes("SPEEDPIPE") ||
    templateKey.includes("SEEDPIPE")
  ) {
    return {
      length: 10,
      dn_mm: 10,
      depth_m: 1.2,
      width_m: 0.4,
      restricted: false,
      bedding: true,
    };
  }

  // WASSER (condotte / prove / allacci)
  if (templateKey.startsWith("WASSER_LEITUNG_")) {
    // tenta estrazione DN: WASSER_LEITUNG_DN110_VERLEGEN
    const m = templateKey.match(/_DN(\d+)_/);
    const dn = m ? Number(m[1]) : 63;
    return {
      length: 10,
      dn_mm: dn,
      pressureBar: 10,
      fittings_per_10m: 1,
      depth_m: 1.2,
      width_m: 0.4,
      soilClass: "BK3",
      restricted: false,
      groundwater: false,
    };
  }

  if (templateKey.startsWith("WASSER_")) {
    // fallback acqua
    return {
      length: 10,
      dn_mm: 63,
      pressureBar: 10,
      fittings_per_10m: 1,
      depth_m: 1.2,
      width_m: 0.4,
      soilClass: "BK3",
      restricted: false,
      groundwater: false,
    };
  }

  // KANAL
  if (templateKey.startsWith("KANAL_")) {
    return {
      length: 10,
      dn_mm: 200,
      bedding: true,
      depth_m: 1.5,
      width_m: 0.6,
      soilClass: "BK4",
      groundwater: false,
    };
  }

  // TB (Tiefbau generico: scavi, rinterri, compattazioni, ecc.)
  if (templateKey.startsWith("TB_")) {
    return {
      length: 10,
      area: 10, // utile per alcuni template che usano area
      depth_m: 1.2,
      width_m: 0.6,
      thickness_m: 0.1,
      soilClass: "BK3",
      restricted: false,
      groundwater: false,
      materialType: "AUSHUB",
      disposalClass: "DK0",
      distance_km: 10,
    };
  }

  // OBERFLAECHE
  if (templateKey.startsWith("OBERFLAECHE_") || templateKey.startsWith("OB_")) {
    return {
      area: 10,
      depth_m: 0.1,
      thickness_m: 0.04,
      deck_cm: 4,
      trag_cm: 10,
      bedding_cm: 4,
    };
  }

  // Default: nessuna famiglia
  return null;
}

async function main() {
  console.log("[seed] patch defaultParams: start");

  const templates = await prisma.recipeTemplate.findMany({
    select: { id: true, key: true, paramsJson: true },
    orderBy: { key: "asc" },
  });

  let scanned = 0;
  let skippedExtreme = 0;
  let noNeed = 0;
  let patched = 0;
  let stillEmpty = 0;

  for (const tpl of templates) {
    scanned++;

    if (EXTREME_KEYS.has(tpl.key)) {
      skippedExtreme++;
      continue;
    }

    // se già ha defaultParams non vuoto => non tocchiamo (per non stravolgere)
    if (!hasEmptyDefaultParams(tpl.paramsJson)) {
      noNeed++;
      continue;
    }

    const add = familyDefaults(tpl.key);
    if (!add) {
      stillEmpty++;
      continue;
    }

    const current: ParamsJson = isObject(tpl.paramsJson) ? (tpl.paramsJson as any) : {};
    const currentDefaults = getDefaultParams(current);

    const mergedDefaults = mergeDefaults(currentDefaults, add);

    // se per qualche motivo resta vuoto, skip
    if (!Object.keys(mergedDefaults).length) {
      stillEmpty++;
      continue;
    }

    const next: ParamsJson = {
      ...current,
      defaultParams: mergedDefaults,
    };

    await prisma.recipeTemplate.update({
      where: { id: tpl.id },
      data: { paramsJson: next as any },
    });

    patched++;
    console.log(`  -> patched: ${tpl.key}`);
  }

  console.log("[seed] patch defaultParams: done", {
    scanned,
    skippedExtreme,
    noNeed,
    patched,
    stillEmpty,
  });
}

main()
  .catch((e) => {
    console.error("[seed] error", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * PATCH defaultParams v2 (mirato):
 * - Solo famiglie: GAS_*, STROM_*, SCHUTZROHR_*
 * - Idempotente: merge (non sovrascrive valori già presenti)
 * - Patcha sia quando defaultParams è vuoto, sia quando mancano chiavi "necessarie"
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

/** Merge: keep existing keys, only fill missing keys */
function mergeDefaults(existing: Record<string, any>, additions: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { ...existing };
  for (const [k, v] of Object.entries(additions)) {
    if (out[k] === undefined) out[k] = v;
  }
  return out;
}

/** true se manca almeno una delle chiavi richieste */
function missingAny(existing: Record<string, any>, required: string[]): boolean {
  for (const k of required) {
    if (existing[k] === undefined) return true;
  }
  return false;
}

/** Estrai DN da chiavi tipo GAS_LEITUNG_DN32_VERLEGEN o SCHUTZROHR_DN110_VERLEGEN */
function extractDn(templateKey: string, fallback: number): number {
  const m = templateKey.match(/_DN(\d+)_/);
  return m ? Number(m[1]) : fallback;
}

/** Defaults mirati per famiglia */
function familyDefaults(templateKey: string): { add: Record<string, any>; required: string[] } | null {
  // GAS
  if (templateKey.startsWith("GAS_LEITUNG_")) {
    const dn = extractDn(templateKey, 63);
    const add = {
      length: 10,
      dn_mm: dn,
      depth_m: 1.2,
      width_m: 0.4,
      soilClass: "BK3",
      restricted: false,
      groundwater: false,
    };
    const required = ["length", "dn_mm", "depth_m", "width_m", "soilClass", "restricted", "groundwater"];
    return { add, required };
  }

  // SCHUTZROHR
  if (templateKey.startsWith("SCHUTZROHR_")) {
    const dn = extractDn(templateKey, 110);
    const add = {
      length: 10,
      dn_mm: dn,
      depth_m: 1.2,
      width_m: 0.4,
      soilClass: "BK3",
      restricted: false,
      groundwater: false,
    };
    const required = ["length", "dn_mm", "depth_m", "width_m", "soilClass", "restricted", "groundwater"];
    return { add, required };
  }

  // STROM (cavi)
  if (templateKey.startsWith("STROM_KABEL_")) {
    const add = {
      length: 10,
      depth_m: 0.8,      // tipico più basso rispetto acqua/gas
      width_m: 0.3,
      soilClass: "BK3",
      restricted: false,
      groundwater: false,
    };
    const required = ["length", "depth_m", "width_m", "soilClass", "restricted", "groundwater"];
    return { add, required };
  }

  return null;
}

async function main() {
  console.log("[seed] patch defaultParams v2 (GAS/STROM/SCHUTZROHR): start");

  const templates = await prisma.recipeTemplate.findMany({
    select: { id: true, key: true, paramsJson: true },
    orderBy: { key: "asc" },
  });

  let scanned = 0;
  let skippedExtreme = 0;
  let notTarget = 0;
  let noNeed = 0;
  let patched = 0;

  for (const tpl of templates) {
    scanned++;

    if (EXTREME_KEYS.has(tpl.key)) {
      skippedExtreme++;
      continue;
    }

    const fam = familyDefaults(tpl.key);
    if (!fam) {
      notTarget++;
      continue;
    }

    const current: ParamsJson = isObject(tpl.paramsJson) ? (tpl.paramsJson as any) : {};
    const currentDefaults = getDefaultParams(current);

    // patcha solo se defaultParams è vuoto O mancano chiavi importanti
    const needPatch = !Object.keys(currentDefaults).length || missingAny(currentDefaults, fam.required);
    if (!needPatch) {
      noNeed++;
      continue;
    }

    const mergedDefaults = mergeDefaults(currentDefaults, fam.add);

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

  console.log("[seed] patch defaultParams v2: done", {
    scanned,
    skippedExtreme,
    notTarget,
    noNeed,
    patched,
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

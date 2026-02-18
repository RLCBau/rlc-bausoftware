import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();

/**
 * Seed VARIANTS:
 * A) Varianti "B/extreme" SOLO per i 10 template base (come già fai)
 * B) Per TUTTI gli altri template: 1 variante default (defaultParams)
 *
 * Obiettivo: ogni RecipeTemplate ha almeno 1 RecipeVariant.
 */

function stableStringify(obj: any): string {
  const seen = new WeakSet();
  const helper = (x: any): any => {
    if (x && typeof x === "object") {
      if (seen.has(x)) return null;
      seen.add(x);
      if (Array.isArray(x)) return x.map(helper);
      const keys = Object.keys(x).sort();
      const out: any = {};
      for (const k of keys) out[k] = helper(x[k]);
      return out;
    }
    return x;
  };
  return JSON.stringify(helper(obj));
}

function makeVariantKey(templateKey: string, params: any): string {
  const s = stableStringify(params);
  const h = crypto
    .createHash("sha1")
    .update(templateKey + "|" + s)
    .digest("hex")
    .slice(0, 12);
  return `${templateKey}|${h}`;
}

function getDefaultParams(paramsJson: any): any {
  const d = paramsJson?.defaultParams;
  return d && typeof d === "object" ? d : {};
}

type VariantSpec = { params: any; unit?: string; enabled?: boolean };

/**
 * Cartesian product tipizzato (2..5 argomenti) + fallback variadico.
 * ✅ Mantiene i tuoi for-of con destructuring senza modifiche.
 */
function cartesian<A, B>(a: A[], b: B[]): Array<[A, B]>;
function cartesian<A, B, C>(a: A[], b: B[], c: C[]): Array<[A, B, C]>;
function cartesian<A, B, C, D>(
  a: A[],
  b: B[],
  c: C[],
  d: D[]
): Array<[A, B, C, D]>;
function cartesian<A, B, C, D, E>(
  a: A[],
  b: B[],
  c: C[],
  d: D[],
  e: E[]
): Array<[A, B, C, D, E]>;
function cartesian(...arrays: any[][]): any[] {
  return arrays.reduce<any[]>(
    (acc, cur) => acc.flatMap((a) => cur.map((b) => [...a, b])),
    [[]]
  );
}

async function main() {
  console.log("[seed] kalkulation variants (B/extreme + default for others): start");

  const templates = await prisma.recipeTemplate.findMany({
    select: { id: true, key: true, unit: true, category: true, paramsJson: true },
    orderBy: { key: "asc" },
  });

  const byKey = new Map(templates.map((t) => [t.key, t] as const));

  function buildVariants(templateKey: string, variants: VariantSpec[]): VariantSpec[] {
    const tpl = byKey.get(templateKey);
    if (!tpl) return [];
    const base = getDefaultParams(tpl.paramsJson);

    return variants.map((v) => ({
      params: { ...base, ...(v.params || {}) },
      unit: v.unit || tpl.unit,
      enabled: v.enabled ?? true,
    }));
  }

  // ---------- VARIANT GENERATORS (B/extreme) ----------

  // 1) TB_GRABEN_AUSHUB_STANDARD
  const v_graben_aushub: VariantSpec[] = [];
  {
    const depth = [0.8, 1.0, 1.2, 1.4, 1.6, 1.8];
    const width = [0.4, 0.6, 0.8];
    const soil = ["BK2", "BK3", "BK4", "BK5", "BK6"];
    const restricted = [false, true];
    const groundwater = [false, true];

    const combos = cartesian(depth, width, soil, restricted, groundwater);
    for (const [d, w, s, r, g] of combos) {
      v_graben_aushub.push({
        params: {
          depth_m: d,
          width_m: w,
          soilClass: s,
          restricted: r,
          groundwater: g,
        },
      });
    }
  }

  // 2) TB_GRABEN_VERBAU
  const v_graben_verbau: VariantSpec[] = [];
  {
    const depth = [0.8, 1.0, 1.2, 1.4, 1.6, 1.8];
    const restricted = [false, true];
    for (const [d, r] of cartesian(depth, restricted)) {
      v_graben_verbau.push({ params: { depth_m: d, restricted: r } });
    }
  }

  // 3) TB_WIEDERVERFUELLUNG_RINNE
  const v_wiederverfuellung: VariantSpec[] = [];
  {
    const depth = [0.8, 1.0, 1.2, 1.4, 1.6, 1.8];
    const width = [0.4, 0.6, 0.8];
    const materialType = ["AUSHUB", "FROSTSCHUTZ", "KIES_SAND"];
    for (const [d, w, m] of cartesian(depth, width, materialType)) {
      v_wiederverfuellung.push({ params: { depth_m: d, width_m: w, materialType: m } });
    }
  }

  // 4) TB_ENTSORGUNG_AUSHUB
  const v_entsorgung: VariantSpec[] = [];
  {
    const disposalClass = ["DK0", "DKI", "DKII", "Z1.1", "Z2"];
    const distance = [0, 10, 25];
    for (const [dc, km] of cartesian(disposalClass, distance)) {
      v_entsorgung.push({ params: { disposalClass: dc, distance_km: km } });
    }
  }

  // 5) WASSER_ROHR_PEHD_VERLEGEN
  const v_pehd: VariantSpec[] = [];
  {
    const dn = [32, 40, 50, 63, 90, 110];
    const pressureBar = [10, 16];
    const fittings = [0.5, 1, 2];
    for (const [dn_mm, p, f] of cartesian(dn, pressureBar, fittings)) {
      v_pehd.push({ params: { dn_mm, pressureBar: p, fittings_per_10m: f } });
    }
  }

  // 6) KANAL_ROHR_PVC_VERLEGEN
  const v_kanal: VariantSpec[] = [];
  {
    const dn = [160, 200, 250, 300, 400];
    const bedding = [true, false];
    for (const [dn_mm, b] of cartesian(dn, bedding)) {
      v_kanal.push({ params: { dn_mm, bedding: b } });
    }
  }

  // 7) TB_BETTUNG_SAND
  const v_bettung: VariantSpec[] = [];
  {
    const dn = [32, 40, 50, 63, 90, 110];
    const thickness = [0.08, 0.10];
    for (const [dn_mm, t] of cartesian(dn, thickness)) {
      v_bettung.push({ params: { dn_mm, thickness_m: t } });
    }
  }

  // 8) OBERFLAECHE_ASPHALT_WIEDERHERSTELLEN
  const v_asphalt: VariantSpec[] = [];
  {
    const deck = [3, 4, 5];
    const trag = [8, 10, 14];
    for (const [deck_cm, trag_cm] of cartesian(deck, trag)) {
      v_asphalt.push({ params: { deck_cm, trag_cm } });
    }
  }

  // 9) OBERFLAECHE_PFLASTER_WIEDERHERSTELLEN
  const v_pflaster: VariantSpec[] = [];
  {
    const bedding = [3, 4, 5];
    for (const bedding_cm of bedding) v_pflaster.push({ params: { bedding_cm } });
  }

  // 10) WASSER_ANSCHLUSS_BESTAND
  const v_anschluss: VariantSpec[] = [];
  {
    const dn = [32, 50, 63, 110];
    const shutoff = [true, false];
    for (const [dn_mm, s] of cartesian(dn, shutoff)) {
      v_anschluss.push({ params: { dn_mm, shutoffValve: s } });
    }
  }

  // Plan “extreme” SOLO per questi 10
  const plan: Array<{ key: string; variants: VariantSpec[] }> = [
    { key: "TB_GRABEN_AUSHUB_STANDARD", variants: buildVariants("TB_GRABEN_AUSHUB_STANDARD", v_graben_aushub) },
    { key: "TB_GRABEN_VERBAU", variants: buildVariants("TB_GRABEN_VERBAU", v_graben_verbau) },
    { key: "TB_WIEDERVERFUELLUNG_RINNE", variants: buildVariants("TB_WIEDERVERFUELLUNG_RINNE", v_wiederverfuellung) },
    { key: "TB_ENTSORGUNG_AUSHUB", variants: buildVariants("TB_ENTSORGUNG_AUSHUB", v_entsorgung) },
    { key: "WASSER_ROHR_PEHD_VERLEGEN", variants: buildVariants("WASSER_ROHR_PEHD_VERLEGEN", v_pehd) },
    { key: "KANAL_ROHR_PVC_VERLEGEN", variants: buildVariants("KANAL_ROHR_PVC_VERLEGEN", v_kanal) },
    { key: "TB_BETTUNG_SAND", variants: buildVariants("TB_BETTUNG_SAND", v_bettung) },
    { key: "OBERFLAECHE_ASPHALT_WIEDERHERSTELLEN", variants: buildVariants("OBERFLAECHE_ASPHALT_WIEDERHERSTELLEN", v_asphalt) },
    { key: "OBERFLAECHE_PFLASTER_WIEDERHERSTELLEN", variants: buildVariants("OBERFLAECHE_PFLASTER_WIEDERHERSTELLEN", v_pflaster) },
    { key: "WASSER_ANSCHLUSS_BESTAND", variants: buildVariants("WASSER_ANSCHLUSS_BESTAND", v_anschluss) },
  ];

  // Mappa veloce key -> variants extreme
  const extremeByKey = new Map<string, VariantSpec[]>(
    plan.map((p) => [p.key, p.variants] as const)
  );

  let totalCreated = 0;
  let extremeTemplatesFound = 0;
  let defaultTemplatesCreated = 0;

  // ✅ ESECUZIONE PROFESSIONALE:
  // - gira su TUTTI i templates
  // - se è uno dei 10: usa le varianti estreme
  // - altrimenti: crea 1 variante defaultParams
  for (const tpl of templates) {
    const extreme = extremeByKey.get(tpl.key);
    const base = getDefaultParams(tpl.paramsJson);

    const variantsToCreate: VariantSpec[] =
      extreme && extreme.length
        ? extreme
        : [{ params: base, unit: tpl.unit, enabled: true }];

    if (extreme && extreme.length) extremeTemplatesFound++;
    else defaultTemplatesCreated++;

    console.log(`  -> ${tpl.key}: regen variants (${variantsToCreate.length})`);

    await prisma.recipeVariant.deleteMany({ where: { templateId: tpl.id } });

    const rows = variantsToCreate.map((v) => ({
      templateId: tpl.id,
      key: makeVariantKey(tpl.key, v.params),
      unit: v.unit || tpl.unit,
      params: v.params,
      enabled: v.enabled ?? true,
    }));

    await prisma.recipeVariant.createMany({ data: rows });

    totalCreated += rows.length;
  }

  const [templatesCount, componentsCount, variantsCount] = await Promise.all([
    prisma.recipeTemplate.count(),
    prisma.recipeComponent.count(),
    prisma.recipeVariant.count(),
  ]);

  console.log("[seed] done", {
    templatesCount,
    componentsCount,
    variantsCount,
    totalCreated,
    extremeTemplatesFound,
    defaultTemplatesCreated,
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

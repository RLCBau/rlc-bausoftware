// apps/server/prisma/seed.kalkulation.variants.smart.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();

/**
 * SMART VARIANTS 2 (Premium-ready, NO DB schema changes)
 *
 * Regole:
 * 1) EXTREME: per alcuni template "core" (cartesian come il file B/extreme)
 * 2) SMART: per tutti gli altri genera poche varianti utili (default + low/high + combinazioni),
 *           limitate da CAP per template (config via env)
 * 3) Se un template NON ha defaultParams, NON tocchiamo il DB:
 *    - usiamo fallback "familyDefaults" SOLO per generare varianti (evita smart(1) inutili)
 * 4) Premium meta: aggiunge __meta dentro params (label/tags/scoreHint/changedKeys)
 *
 * Obiettivi:
 * - Niente esplosione combinatoria
 * - Deterministico / idempotente
 * - Liste gestibili e pronte per UI/API
 */

type VariantSpec = { params: any; unit?: string; enabled?: boolean };

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
  // IMPORTANT: key stabile SOLO sui params “reali”
  const clean = stripMeta(params ?? {});
  const s = stableStringify(clean);
  const h = crypto
    .createHash("sha1")
    .update(templateKey + "|" + s)
    .digest("hex")
    .slice(0, 12);
  return `${templateKey}|${h}`;
}

function getDefaultParams(paramsJson: any): any {
  const d = paramsJson?.defaultParams;
  return d && typeof d === "object" && !Array.isArray(d) ? d : {};
}

function isObject(x: any): x is Record<string, any> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

/** =========================================================
 * CAP config (senza toccare codice)
 * =========================================================
 * - KALK_VARIANTS_CAP: cap default (es. 20)
 * - KALK_VARIANTS_CAP_WASSER / _TELEKOM / _KANAL / _TB / _OB / _BA / _STROM / _GAS
 */
const DEFAULT_CAP_PER_TEMPLATE = Number(process.env.KALK_VARIANTS_CAP || 8);

function capForTemplateKey(key: string): number {
  const envNum = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const pick = (envKey: string) => envNum((process.env as any)[envKey]);

  if (key.startsWith("WASSER_")) return pick("KALK_VARIANTS_CAP_WASSER") ?? DEFAULT_CAP_PER_TEMPLATE;
  if (key.startsWith("TELEKOM_")) return pick("KALK_VARIANTS_CAP_TELEKOM") ?? DEFAULT_CAP_PER_TEMPLATE;
  if (key.startsWith("KANAL_")) return pick("KALK_VARIANTS_CAP_KANAL") ?? DEFAULT_CAP_PER_TEMPLATE;
  if (key.startsWith("TB_")) return pick("KALK_VARIANTS_CAP_TB") ?? DEFAULT_CAP_PER_TEMPLATE;
  if (key.startsWith("OBERFLAECHE_") || key.startsWith("OB_")) return pick("KALK_VARIANTS_CAP_OB") ?? DEFAULT_CAP_PER_TEMPLATE;
  if (key.startsWith("BA_")) return pick("KALK_VARIANTS_CAP_BA") ?? DEFAULT_CAP_PER_TEMPLATE;
  if (key.startsWith("STROM_")) return pick("KALK_VARIANTS_CAP_STROM") ?? DEFAULT_CAP_PER_TEMPLATE;
  if (key.startsWith("GAS_")) return pick("KALK_VARIANTS_CAP_GAS") ?? DEFAULT_CAP_PER_TEMPLATE;

  return DEFAULT_CAP_PER_TEMPLATE;
}

/** =========================================================
 * EXTREME templates
 * ========================================================= */
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

/** Se vuoi includere famiglie intere in EXTREME (attenzione alle quantità!) */
const EXTREME_PREFIXES: string[] = [
  // "WASSER_LEITUNG_",
];

function isExtremeTemplate(key: string): boolean {
  if (EXTREME_KEYS.has(key)) return true;
  for (const p of EXTREME_PREFIXES) if (key.startsWith(p)) return true;
  return false;
}

/** =========================================================
 * Fallback defaults (NO DB update) – evita smart(1) inutili
 * ========================================================= */
function familyDefaults(templateKey: string): Record<string, any> | null {
  // TELEKOM
  if (templateKey.startsWith("TELEKOM_MICRODUCT_")) {
    const m = templateKey.match(/TELEKOM_MICRODUCT_(\d+)_/);
    const dn = m ? Number(m[1]) : 10;
    return {
      length: 10,
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

  // WASSER
  if (templateKey.startsWith("WASSER_LEITUNG_")) {
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

  // STROM
  if (templateKey.startsWith("STROM_")) {
    return {
      length: 10,
      depth_m: 1.0,
      width_m: 0.4,
      soilClass: "BK3",
      restricted: false,
    };
  }

  // GAS
  if (templateKey.startsWith("GAS_")) {
    // spesso DN è nel key, es. GAS_LEITUNG_DN63_...
    const m = templateKey.match(/_DN(\d+)_/);
    const dn = m ? Number(m[1]) : 63;
    return {
      length: 10,
      dn_mm: dn,
      depth_m: 1.2,
      width_m: 0.4,
      soilClass: "BK3",
      restricted: false,
      groundwater: false,
    };
  }

  // BA (Baustelle/Tag/Provisorium ecc.)
  if (templateKey.startsWith("BA_")) {
    return {
      days: 1,
      count: 1,
    };
  }

  // TB (Tiefbau generico)
  if (templateKey.startsWith("TB_")) {
    return {
      length: 10,
      area: 10,
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
      thickness_m: 0.04,
      deck_cm: 4,
      trag_cm: 10,
      bedding_cm: 4,
    };
  }

  return null;
}

function resolveBaseParams(templateKey: string, paramsJson: any): Record<string, any> {
  const base = getDefaultParams(paramsJson);
  if (isObject(base) && Object.keys(base).length) return base;
  return familyDefaults(templateKey) ?? {};
}

/** =========================================================
 * Cartesian product tipizzato (2..5) + variadico
 * ========================================================= */
function cartesian<A, B>(a: A[], b: B[]): Array<[A, B]>;
function cartesian<A, B, C>(a: A[], b: B[], c: C[]): Array<[A, B, C]>;
function cartesian<A, B, C, D>(a: A[], b: B[], c: C[], d: D[]): Array<[A, B, C, D]>;
function cartesian<A, B, C, D, E>(a: A[], b: B[], c: C[], d: D[], e: E[]): Array<[A, B, C, D, E]>;
function cartesian(...arrays: any[][]): any[] {
  return arrays.reduce<any[]>(
    (acc, cur) => acc.flatMap((a) => cur.map((b) => [...a, b])),
    [[]]
  );
}

/** =========================================================
 * SMART suggestions
 * ========================================================= */
function numeric3(defaultValue: number, step: number, min?: number, max?: number): number[] {
  const low = defaultValue - step;
  const high = defaultValue + step;
  const arr = [low, defaultValue, high].map((v) => Number(v.toFixed(4)));

  const uniq = Array.from(new Set(arr.map((x) => String(x)))).map((s) => Number(s));

  return uniq.map((v) => {
    let out = v;
    if (typeof min === "number") out = Math.max(min, out);
    if (typeof max === "number") out = Math.min(max, out);
    return Number(out.toFixed(4));
  });
}

function suggestedValuesForKey(key: string, defaultParams: any): any[] | null {
  const dv = defaultParams?.[key];

  if (typeof dv === "boolean") return [false, true];

  if (key === "soilClass") return ["BK2", "BK3", "BK4", "BK5", "BK6"];
  if (key === "disposalClass") return ["DK0", "DKI", "DKII", "Z1.1", "Z2"];
  if (key === "materialType") return ["AUSHUB", "FROSTSCHUTZ", "KIES_SAND"];

  if (key === "depth_m") return [0.8, 1.2, 1.6];
  if (key === "width_m") return [0.4, 0.6, 0.8];
  if (key === "thickness_m") return [0.08, 0.1];

  if (key === "deck_cm") return [3, 4, 5];
  if (key === "trag_cm") return [8, 10, 14];
  if (key === "bedding_cm") return [3, 4, 5];

  if (key === "dn_mm") {
    if (typeof dv === "number") {
      const common = [32, 40, 50, 63, 90, 110, 160, 200, 250, 300, 400];
      const near = common.filter((x) => Math.abs(x - dv) <= 80);
      const list = Array.from(new Set([dv, ...near])).slice(0, 5);
      return list.length ? list : [dv];
    }
    return [32, 40, 50, 63, 90];
  }

  if (key === "pressureBar") return [10, 16];
  if (key === "fittings_per_10m") return [0.5, 1, 2];

  if (key === "distance_km") return [0, 10, 25];

  // fallback numerico
  if (typeof dv === "number") {
    const step =
      Math.abs(dv) >= 10
        ? Math.max(1, Math.round(Math.abs(dv) * 0.2))
        : Math.max(0.05, Math.abs(dv) * 0.2);
    return numeric3(dv, step);
  }

  return null;
}

function buildSmartVariants(defaultParams: any, cap: number): VariantSpec[] {
  const base = defaultParams || {};
  const keys = Object.keys(base);

  if (!keys.length) return [{ params: { ...base } }];

  const dims: Array<{ key: string; values: any[] }> = [];
  for (const k of keys) {
    const values = suggestedValuesForKey(k, base);
    if (!values?.length) continue;

    let limited = values.length > 3 ? values.slice(0, 3) : values;

    const dv = base[k];
    if (dv !== undefined) {
      const hasDefault = limited.some((x) => stableStringify(x) === stableStringify(dv));
      if (!hasDefault) limited = [dv, ...limited].slice(0, 3);
    }

    dims.push({ key: k, values: limited });
  }

  if (!dims.length) return [{ params: { ...base } }];

  const out: VariantSpec[] = [];
  out.push({ params: { ...base } });

  // one-at-a-time
  for (const d of dims) {
    if (out.length >= cap) break;
    const dv = base[d.key];

    const first = d.values[0];
    const last = d.values[d.values.length - 1];

    const mk = (val: any) => ({ params: { ...base, [d.key]: val } });

    if (stableStringify(first) !== stableStringify(dv) && out.length < cap) out.push(mk(first));
    if (
      stableStringify(last) !== stableStringify(dv) &&
      stableStringify(last) !== stableStringify(first) &&
      out.length < cap
    ) {
      out.push(mk(last));
    }
  }

  // combinazioni 2D: prime 2 dimensioni utili
  if (out.length < cap && dims.length >= 2) {
    const d1 = dims[0];
    const d2 = dims[1];

    const pairs = cartesian(d1.values, d2.values) as Array<[any, any]>;
    for (const [v1, v2] of pairs) {
      if (out.length >= cap) break;

      const isDefaultPair =
        stableStringify(v1) === stableStringify(base[d1.key]) &&
        stableStringify(v2) === stableStringify(base[d2.key]);
      if (isDefaultPair) continue;

      out.push({ params: { ...base, [d1.key]: v1, [d2.key]: v2 } });
    }
  }

  // dedup + cap
  const seen = new Set<string>();
  const deduped: VariantSpec[] = [];
  for (const v of out) {
    const s = stableStringify(v.params);
    if (seen.has(s)) continue;
    seen.add(s);
    deduped.push(v);
    if (deduped.length >= cap) break;
  }

  return deduped.length ? deduped : [{ params: { ...base } }];
}

/** =========================================================
 * EXTREME generators (i tuoi 10)
 * ========================================================= */
function buildExtremeVariantsForTemplate(templateKey: string): VariantSpec[] {
  const v: VariantSpec[] = [];

  if (templateKey === "TB_GRABEN_AUSHUB_STANDARD") {
    const depth = [0.8, 1.0, 1.2, 1.4, 1.6, 1.8];
    const width = [0.4, 0.6, 0.8];
    const soil = ["BK2", "BK3", "BK4", "BK5", "BK6"];
    const restricted = [false, true];
    const groundwater = [false, true];
    for (const [d, w, s, r, g] of cartesian(depth, width, soil, restricted, groundwater)) {
      v.push({ params: { depth_m: d, width_m: w, soilClass: s, restricted: r, groundwater: g } });
    }
    return v;
  }

  if (templateKey === "TB_GRABEN_VERBAU") {
    const depth = [0.8, 1.0, 1.2, 1.4, 1.6, 1.8];
    const restricted = [false, true];
    for (const [d, r] of cartesian(depth, restricted)) v.push({ params: { depth_m: d, restricted: r } });
    return v;
  }

  if (templateKey === "TB_WIEDERVERFUELLUNG_RINNE") {
    const depth = [0.8, 1.0, 1.2, 1.4, 1.6, 1.8];
    const width = [0.4, 0.6, 0.8];
    const materialType = ["AUSHUB", "FROSTSCHUTZ", "KIES_SAND"];
    for (const [d, w, m] of cartesian(depth, width, materialType)) {
      v.push({ params: { depth_m: d, width_m: w, materialType: m } });
    }
    return v;
  }

  if (templateKey === "TB_ENTSORGUNG_AUSHUB") {
    const disposalClass = ["DK0", "DKI", "DKII", "Z1.1", "Z2"];
    const distance = [0, 10, 25];
    for (const [dc, km] of cartesian(disposalClass, distance)) {
      v.push({ params: { disposalClass: dc, distance_km: km } });
    }
    return v;
  }

  if (templateKey === "WASSER_ROHR_PEHD_VERLEGEN") {
    const dn = [32, 40, 50, 63, 90, 110];
    const pressureBar = [10, 16];
    const fittings = [0.5, 1, 2];
    for (const [dn_mm, p, f] of cartesian(dn, pressureBar, fittings)) {
      v.push({ params: { dn_mm, pressureBar: p, fittings_per_10m: f } });
    }
    return v;
  }

  if (templateKey === "KANAL_ROHR_PVC_VERLEGEN") {
    const dn = [160, 200, 250, 300, 400];
    const bedding = [true, false];
    for (const [dn_mm, b] of cartesian(dn, bedding)) v.push({ params: { dn_mm, bedding: b } });
    return v;
  }

  if (templateKey === "TB_BETTUNG_SAND") {
    const dn = [32, 40, 50, 63, 90, 110];
    const thickness = [0.08, 0.1];
    for (const [dn_mm, t] of cartesian(dn, thickness)) v.push({ params: { dn_mm, thickness_m: t } });
    return v;
  }

  if (templateKey === "OBERFLAECHE_ASPHALT_WIEDERHERSTELLEN") {
    const deck = [3, 4, 5];
    const trag = [8, 10, 14];
    for (const [deck_cm, trag_cm] of cartesian(deck, trag)) v.push({ params: { deck_cm, trag_cm } });
    return v;
  }

  if (templateKey === "OBERFLAECHE_PFLASTER_WIEDERHERSTELLEN") {
    const bedding = [3, 4, 5];
    for (const bedding_cm of bedding) v.push({ params: { bedding_cm } });
    return v;
  }

  if (templateKey === "WASSER_ANSCHLUSS_BESTAND") {
    const dn = [32, 50, 63, 110];
    const shutoff = [true, false];
    for (const [dn_mm, s] of cartesian(dn, shutoff)) v.push({ params: { dn_mm, shutoffValve: s } });
    return v;
  }

  return v;
}

/** =========================================================
 * PREMIUM META (NO DB schema change) -> params.__meta
 * ========================================================= */
type Meta = {
  label: string;
  tags: string[];
  scoreHint: number; // 0..1
  family?: string;
  changedKeys?: string[];
};

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function stripMeta(params: any) {
  if (!isObject(params)) return params ?? {};
  const { __meta, ...rest } = params as any;
  return rest;
}

function familyFromKey(templateKey: string): string {
  if (templateKey.startsWith("WASSER_")) return "WASSER";
  if (templateKey.startsWith("KANAL_")) return "KANAL";
  if (templateKey.startsWith("STROM_")) return "STROM";
  if (templateKey.startsWith("GAS_")) return "GAS";
  if (templateKey.startsWith("BA_")) return "BAUSTELLE";
  if (templateKey.startsWith("TB_")) return "TIEFBAU";
  if (templateKey.startsWith("OBERFLAECHE_") || templateKey.startsWith("OB_")) return "OBERFLAECHE";
  if (templateKey.startsWith("TELEKOM_")) return "TELEKOM";
  return "GENERIC";
}

function tagsFromKey(templateKey: string): string[] {
  const fam = familyFromKey(templateKey);
  const tags = new Set<string>([fam]);

  if (templateKey.includes("ROHR") || templateKey.includes("LEITUNG")) tags.add("LEITUNG");
  if (templateKey.includes("KABEL")) tags.add("KABEL");
  if (templateKey.includes("VERLEGEN")) tags.add("VERLEGEN");
  if (templateKey.includes("EINBLASEN")) tags.add("EINBLASEN");
  if (templateKey.includes("DRUCKPROBE")) tags.add("PRUEFUNG");
  if (templateKey.includes("ENTSORGUNG")) tags.add("ENTSORGUNG");
  if (templateKey.includes("VERBAU")) tags.add("VERBAU");
  if (templateKey.includes("PFLASTER")) tags.add("PFLASTER");
  if (templateKey.includes("ASPHALT")) tags.add("ASPHALT");
  if (templateKey.includes("PROVISORIUM")) tags.add("PROVISORIUM");
  if (templateKey.includes("LOGISTIK")) tags.add("LOGISTIK");

  return Array.from(tags);
}

function diffKeys(base: any, params: any): string[] {
  const a = stripMeta(base || {});
  const b = stripMeta(params || {});
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  keys.delete("__meta");
  const out: string[] = [];
  for (const k of keys) {
    if (stableStringify(a?.[k]) !== stableStringify(b?.[k])) out.push(k);
  }
  return out;
}

function buildLabel(base: any, params: any): string {
  const changed = diffKeys(base, params);
  if (!changed.length) return "Standard";

  const p = stripMeta(params);

  const parts: string[] = [];
  const push = (s: string) => {
    if (s && parts.length < 3) parts.push(s);
  };

  // Preferenze leggibili
  if (typeof p.dn_mm === "number") push(`DN ${p.dn_mm}`);
  if (typeof p.pressureBar === "number") push(`${p.pressureBar} bar`);

  if (typeof p.depth_m === "number") push(`Tiefe ${p.depth_m} m`);
  if (typeof p.width_m === "number") push(`Breite ${p.width_m} m`);

  if (typeof p.soilClass === "string") push(`Boden ${p.soilClass}`);

  if (typeof p.restricted === "boolean") push(p.restricted ? "eng/innerorts" : "frei");
  if (typeof p.groundwater === "boolean") push(p.groundwater ? "mit Grundwasser" : "ohne Grundwasser");

  if (typeof p.distance_km === "number" && p.distance_km > 0) push(`${p.distance_km} km`);

  if (!parts.length) return changed.slice(0, 2).join(", ");
  return parts.join(" · ");
}

function scoreHint(templateKey: string, params: any): number {
  const p = stripMeta(params);

  let s = 0;

  const depth = typeof p.depth_m === "number" ? p.depth_m : null;
  const dn = typeof p.dn_mm === "number" ? p.dn_mm : null;
  const dist = typeof p.distance_km === "number" ? p.distance_km : null;

  // depth 0.8..1.8 -> 0..0.25
  if (depth !== null) s += clamp01((depth - 0.8) / (1.8 - 0.8)) * 0.25;

  // dn 32..400 -> 0..0.20
  if (dn !== null) s += clamp01((dn - 32) / (400 - 32)) * 0.20;

  // distance 0..25 -> 0..0.10
  if (dist !== null) s += clamp01(dist / 25) * 0.10;

  // booleans
  if (p.restricted === true) s += 0.12;
  if (p.groundwater === true) s += 0.18;
  if (p.bedding === true) s += 0.05;

  // soilClass BK2..BK6 -> 0..0.12
  const soil = p.soilClass;
  if (typeof soil === "string" && /^BK\d$/.test(soil)) {
    const n = Number(soil.replace("BK", ""));
    s += clamp01((n - 2) / (6 - 2)) * 0.12;
  }

  // leggero bias famiglia
  const fam = familyFromKey(templateKey);
  if (fam === "BAUSTELLE") s += 0.03;
  if (fam === "TELEKOM") s += 0.02;

  return clamp01(Number(s.toFixed(4)));
}

function attachMeta(templateKey: string, base: any, params: any): any {
  const changedKeys = diffKeys(base, params);
  const meta: Meta = {
    family: familyFromKey(templateKey),
    tags: tagsFromKey(templateKey),
    label: buildLabel(base, params),
    scoreHint: scoreHint(templateKey, params),
    changedKeys,
  };
  return { ...stripMeta(params), __meta: meta };
}

/** =========================================================
 * Main
 * ========================================================= */
async function main() {
  console.log("[seed] kalkulation variants (SMART 2): start");

  const templates = await prisma.recipeTemplate.findMany({
    select: { id: true, key: true, unit: true, paramsJson: true },
    orderBy: { key: "asc" },
  });

  let totalCreated = 0;
  let extremeTemplatesFound = 0;
  let smartTemplatesCreated = 0;
  let usedFallbackDefaults = 0;

  for (const tpl of templates) {
    const extreme = isExtremeTemplate(tpl.key);

    // base params: defaultParams se presenti, altrimenti fallback familyDefaults (NO DB update)
    const baseFromDb = getDefaultParams(tpl.paramsJson);
    const base =
      isObject(baseFromDb) && Object.keys(baseFromDb).length
        ? baseFromDb
        : (familyDefaults(tpl.key) ?? {});
    if (!(isObject(baseFromDb) && Object.keys(baseFromDb).length) && Object.keys(base).length) {
      usedFallbackDefaults++;
    }

    let variants: VariantSpec[] = [];

    if (extreme) {
      extremeTemplatesFound++;
      const ext = buildExtremeVariantsForTemplate(tpl.key);

      // EXTREME: merge base + override ext
      variants = ext.length
        ? ext.map((v) => ({ params: { ...base, ...(v.params || {}) } }))
        : [{ params: { ...base } }];
    } else {
      smartTemplatesCreated++;
      const cap = capForTemplateKey(tpl.key);
      variants = buildSmartVariants(base, cap);
    }

    // sicurezza: almeno 1 variante
    if (!variants.length) variants = [{ params: { ...base } }];

    // idempotente: rigenera per template
    await prisma.recipeVariant.deleteMany({ where: { templateId: tpl.id } });

    const rows = variants.map((v) => {
      const realParams = stripMeta(v.params ?? {});
      const withMeta = attachMeta(tpl.key, base, realParams);

      return {
        templateId: tpl.id,
        key: makeVariantKey(tpl.key, realParams), // ✅ stabile, non include __meta
        unit: v.unit || tpl.unit,
        params: withMeta,
        enabled: v.enabled ?? true,
      };
    });

    await prisma.recipeVariant.createMany({ data: rows });
    totalCreated += rows.length;

    const capInfo = extreme ? "" : ` (cap=${capForTemplateKey(tpl.key)})`;
    console.log(`  -> ${tpl.key}: ${extreme ? "EXTREME" : "smart"} (${rows.length})${capInfo}`);
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
    smartTemplatesCreated,
    usedFallbackDefaults,
    capDefault: DEFAULT_CAP_PER_TEMPLATE,
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

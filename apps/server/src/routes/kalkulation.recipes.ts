// apps/server/src/routes/kalkulation.recipes.ts
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { Parser } from "expr-eval";

const router = Router();

/**
 * DEV guard (usa DEV_AUTH=on)
 */
function requireDev(req: any, res: any, next: any) {
  const devOn = (process.env.DEV_AUTH || "").toLowerCase() === "on";
  if (!devOn) return res.status(403).json({ ok: false, error: "DEV_AUTH required" });
  next();
}

/* =========================
 * Helpers (Premium)
 * - ignore _meta / _* keys in diff/scoring
 * ========================= */

function isPlainObject(x: any): x is Record<string, any> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function getDefaultParams(paramsJson: any): Record<string, any> {
  const d = paramsJson?.defaultParams;
  return isPlainObject(d) ? d : {};
}

function stripMeta(obj: any): any {
  if (!isPlainObject(obj)) return obj;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith("_")) continue; // ✅ ignore _meta, _anything
    out[k] = v;
  }
  return out;
}

function stableStringify(obj: any): string {
  const seen = new WeakSet();
  const helper = (x: any): any => {
    if (x && typeof x === "object") {
      if (seen.has(x)) return null;
      seen.add(x);
      if (Array.isArray(x)) return x.map(helper);
      const keys = Object.keys(x).sort();
      const out: any = {};
      for (const k of keys) out[k] = helper((x as any)[k]);
      return out;
    }
    return x;
  };
  return JSON.stringify(helper(obj));
}

function changedKeys(baseParams: Record<string, any>, variantParams: Record<string, any>): string[] {
  const base = stripMeta(baseParams || {});
  const v = stripMeta(variantParams || {});
  const keys = new Set<string>([...Object.keys(base), ...Object.keys(v)]);

  const out: string[] = [];
  for (const k of keys) {
    if (k.startsWith("_")) continue;
    const a = (base as any)[k];
    const b = (v as any)[k];
    if (stableStringify(a) !== stableStringify(b)) out.push(k);
  }
  out.sort();
  return out;
}

function labelFromParams(tplKey: string, params: Record<string, any>, base?: Record<string, any>) {
  // Label “business friendly”
  const p = stripMeta(params || {});
  const b = stripMeta(base || {});
  const pick = (k: string) => (p as any)[k] ?? (b as any)[k];

  const dn = pick("dn_mm");
  const pressure = pick("pressureBar");
  const depth = pick("depth_m");
  const width = pick("width_m");
  const length = pick("length");
  const soil = pick("soilClass");
  const gw = pick("groundwater");
  const restricted = pick("restricted");

  const parts: string[] = [];
  if (dn !== undefined) parts.push(`DN${dn}`);
  if (pressure !== undefined) parts.push(`${pressure} bar`);
  if (depth !== undefined) parts.push(`Tiefe ${depth} m`);
  if (width !== undefined) parts.push(`B ${width} m`);
  if (length !== undefined) parts.push(`${length} m`);
  if (soil !== undefined) parts.push(String(soil));
  if (restricted === true) parts.push("beengt");
  if (gw === true) parts.push("GW");

  if (!parts.length) return tplKey;
  return parts.join(" / ");
}

/* =========================
 * Suggest scoring (Premium)
 * ========================= */

function normalizeNumberDistance(a: number, b: number): number {
  const denom = Math.max(1e-6, Math.abs(a) + Math.abs(b), 1);
  return Math.min(1, Math.abs(a - b) / denom);
}

function scoreVariantAgainstContext(
  params: Record<string, any>,
  context: Record<string, any>
): { score: number; details: { key: string; weight: number; partial: number }[] } {
  const p = stripMeta(params || {});
  const c = stripMeta(context || {});

  const WEIGHTS: Record<string, number> = {
    dn_mm: 3,
    depth_m: 3,
    width_m: 2,
    soilClass: 2,
    pressureBar: 2,
    fittings_per_10m: 1.5,
    restricted: 2,
    groundwater: 2,
    length: 0.5,
    distance_km: 1,
    disposalClass: 1.5,
    thickness_m: 1,
    deck_cm: 1,
    trag_cm: 1,
    bedding_cm: 1,
    bedding: 0.5,
  };

  let wSum = 0;
  let sSum = 0;
  const details: { key: string; weight: number; partial: number }[] = [];

  for (const [k, vCtx] of Object.entries(c)) {
    if (k.startsWith("_")) continue;
    const vPar = (p as any)[k];

    const w = WEIGHTS[k] ?? 1;
    wSum += w;

    let partial = 0.5;

    if (typeof vCtx === "number" && typeof vPar === "number") {
      const dist = normalizeNumberDistance(vCtx, vPar);
      partial = 1 - dist;
    } else if (typeof vCtx === "boolean" && typeof vPar === "boolean") {
      partial = vCtx === vPar ? 1 : 0;
    } else if (typeof vCtx === "string" && typeof vPar === "string") {
      partial = vCtx.toLowerCase() === vPar.toLowerCase() ? 1 : 0;
    } else {
      partial = vPar === undefined ? 0.35 : 0.6;
    }

    sSum += partial * w;
    details.push({ key: k, weight: w, partial: Number(partial.toFixed(4)) });
  }

  const score = wSum > 0 ? sSum / wSum : 0.0;
  return { score: Number(score.toFixed(6)), details };
}

/* ============================================================
   Formula eval (expr-eval)
   ============================================================ */

const parser = new Parser({
  operators: {
    add: true,
    subtract: true,
    multiply: true,
    divide: true,
    remainder: true,
    power: true,
    comparison: true,
    logical: true,
    conditional: true,
    // disabilitati:
    factorial: false,
    concatenate: false,
    in: false,
    assignment: false,
  },
});

function toNum(x: any, fallback = 0): number {
  const n = typeof x === "number" ? x : Number(String(x ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function safeNumber(x: any, fallback = 0) {
  const n = typeof x === "number" ? x : Number(String(x ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function evalFormula(formula: string, scope: Record<string, any>): number {
  try {
    const expr = parser.parse(String(formula || "0"));
    const v = expr.evaluate(scope);
    return toNum(v, 0);
  } catch {
    return 0;
  }
}

/* ============================================================
   Pricing helpers (NEW)
   - choose the latest CompanyPrice valid for a given pricingDate:
     validFrom <= pricingDate AND (validTo is null OR validTo > pricingDate)
   ============================================================ */

function parsePricingDate(input: any): Date | null {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;

  // allow "YYYY-MM-DD" or full ISO
  const d = s.length === 10 ? new Date(`${s}T00:00:00.000Z`) : new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/* =========================================================
 * ensureCompanyId (ALIGN with projects.ts)
 * =======================================================*/
async function ensureCompanyId(req: any): Promise<string> {
  const auth: any = req?.auth;

  if (auth && typeof auth.company === "string") {
    const found = await prisma.company.findUnique({ where: { id: auth.company } });
    if (found) return found.id;
  }

  if (process.env.DEV_COMPANY_ID) {
    const found = await prisma.company.findUnique({ where: { id: process.env.DEV_COMPANY_ID } });
    if (found) return found.id;
  }

  const first = await prisma.company.findFirst();
  if (first) return first.id;

  const created = await prisma.company.create({
    data: { name: "Standard Firma", code: "STANDARD" },
  });

  return created.id;
}

async function resolveCompanyId(req: any, bodyCompanyId?: string): Promise<string | null> {
  // 1) body
  if (bodyCompanyId) return bodyCompanyId;

  // 2) header (utile per Postman/PowerShell)
  const h = req.header?.("x-company-id");
  if (h) return String(h);

  // 3) auth user/company (allineato)
  const auth: any = req?.auth;
  if (auth?.company) return String(auth.company);

  // 4) legacy user (se un domani)
  const u = (req as any).user;
  if (u?.companyId) return String(u.companyId);

  // 5) fallback robust: garantisce esistenza Company
  return await ensureCompanyId(req);
}

function resolvePricingDate(req: any, bodyPricingDate?: string): Date {
  const d1 = parsePricingDate(bodyPricingDate);
  if (d1) return d1;

  const h = req.header?.("x-pricing-date");
  const d2 = parsePricingDate(h);
  if (d2) return d2;

  // default: today at 12:00 UTC (prevents timezone day-shift)
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0, 0));
}

type CompanyPriceRow = {
  refKey: string;
  price: any;
  unit: string | null;
  validFrom: Date; // ✅ in Prisma type it is not nullable -> keep it Date
  validTo: Date | null;
  note: string | null;
};

async function loadCompanyPricesForRefKeys(args: {
  companyId: string;
  refKeys: string[];
  pricingDate: Date;
}): Promise<Map<string, CompanyPriceRow>> {
  const { companyId, refKeys, pricingDate } = args;

  if (!refKeys.length) return new Map();

  // ✅ validFrom is NOT nullable in Prisma type, so we must NOT query { validFrom: null }.
  const rows = await prisma.companyPrice.findMany({
    where: {
      companyId,
      refKey: { in: refKeys },
      AND: [
        { validFrom: { lte: pricingDate } },
        {
          OR: [{ validTo: null }, { validTo: { gt: pricingDate } }],
        },
      ],
    },
    select: { refKey: true, price: true, unit: true, validFrom: true, validTo: true, note: true },
    take: 100000,
  });

  // pick "best" per refKey = latest validFrom
  const best = new Map<string, CompanyPriceRow>();
  for (const r of rows as any as CompanyPriceRow[]) {
    const prev = best.get(r.refKey);
    if (!prev) {
      best.set(r.refKey, r);
      continue;
    }
    const pv = prev.validFrom.getTime();
    const rv = r.validFrom.getTime();
    if (rv > pv) best.set(r.refKey, r);
  }
  return best;
}

/* ============================================================
   ROUTES (esistenti)
   ============================================================ */

/**
 * GET /api/kalkulation/recipes/templates
 * optional: ?q=wasser&category=WASSER&take=200
 */
router.get("/recipes/templates", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const category = String(req.query.category || "").trim();
    const take = Math.min(1000, Math.max(1, Number(req.query.take || 200)));

    const where: any = {};
    if (category) where.category = category;

    if (q) {
      where.OR = [
        { key: { contains: q, mode: "insensitive" } },
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ];
    }

    const rows = await prisma.recipeTemplate.findMany({
      where,
      orderBy: [{ category: "asc" }, { key: "asc" }],
      take,
      select: {
        id: true,
        key: true,
        title: true,
        category: true,
        unit: true,
        description: true,
        paramsJson: true,
        tags: true,
      },
    });

    res.json({ ok: true, templates: rows });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ ok: false, error: e?.message || "failed" });
  }
});

/**
 * GET /api/kalkulation/recipes/templates/:key
 */
router.get("/recipes/templates/:key", async (req, res) => {
  try {
    const key = String(req.params.key);

    const tpl = await prisma.recipeTemplate.findUnique({
      where: { key },
      include: {
        components: { orderBy: { sort: "asc" } },
      },
    });

    if (!tpl) return res.status(404).json({ ok: false, error: "not found" });
    res.json({ ok: true, template: tpl });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ ok: false, error: e?.message || "failed" });
  }
});

/**
 * POST /api/kalkulation/recipes/templates
 * Crea/aggiorna un template (manuale, dev)
 */
const upsertSchema = z.object({
  key: z.string().min(2),
  title: z.string().min(2),
  category: z.string().min(1),
  unit: z.string().min(1),
  description: z.string().optional().nullable(),
  paramsJson: z.any().optional().nullable(),
  tags: z.array(z.string()).optional().default([]),

  components: z
    .array(
      z.object({
        type: z.enum(["LABOR", "MACHINE", "MATERIAL", "DISPOSAL", "SURFACE", "OTHER"]),
        refKey: z.string().min(3),
        qtyFormula: z.string().min(1),
        mandatory: z.boolean().optional().default(true),
        riskFactor: z.number().optional().default(1.0),
        sort: z.number().int().optional().default(0),
        note: z.string().optional().nullable(),
      })
    )
    .optional()
    .default([]),
});

router.post("/recipes/templates", requireDev, async (req, res) => {
  try {
    const data = upsertSchema.parse(req.body);

    const tpl = await prisma.recipeTemplate.upsert({
      where: { key: data.key },
      update: {
        title: data.title,
        category: data.category,
        unit: data.unit,
        description: data.description ?? null,
        paramsJson: data.paramsJson ?? null,
        tags: data.tags ?? [],
      },
      create: {
        key: data.key,
        title: data.title,
        category: data.category,
        unit: data.unit,
        description: data.description ?? null,
        paramsJson: data.paramsJson ?? null,
        tags: data.tags ?? [],
      },
      select: { id: true, key: true },
    });

    // components: sostituiamo tutto
    if (data.components?.length) {
      await prisma.recipeComponent.deleteMany({ where: { templateId: tpl.id } });
      await prisma.recipeComponent.createMany({
        data: data.components.map((c) => ({
          templateId: tpl.id,
          type: c.type as any,
          refKey: c.refKey,
          qtyFormula: c.qtyFormula,
          mandatory: c.mandatory ?? true,
          riskFactor: c.riskFactor ?? 1.0,
          sort: c.sort ?? 0,
          note: c.note ?? null,
        })),
      });
    }

    res.json({ ok: true, template: tpl });
  } catch (e: any) {
    const msg = e?.issues ? "validation failed" : e?.message || "failed";
    res.status(400).json({ ok: false, error: msg, details: e?.issues || undefined });
  }
});

/**
 * DELETE /api/kalkulation/recipes/templates/:key
 */
router.delete("/recipes/templates/:key", requireDev, async (req, res) => {
  try {
    const key = String(req.params.key);
    await prisma.recipeTemplate.delete({ where: { key } });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "failed" });
  }
});

/**
 * GET /api/kalkulation/recipes/stats
 */
router.get("/recipes/stats", async (_req, res) => {
  try {
    const [templates, components, variants] = await Promise.all([
      prisma.recipeTemplate.count(),
      prisma.recipeComponent.count(),
      prisma.recipeVariant.count(),
    ]);
    res.json({ ok: true, templates, components, variants });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "failed" });
  }
});

/* ============================================================
   Variants list (DB-first) + Premium suggest
   ============================================================ */

/**
 * GET /api/kalkulation/recipes/templates/:key/variants
 */
router.get("/recipes/templates/:key/variants", async (req, res) => {
  try {
    const key = String(req.params.key);

    const tpl = await prisma.recipeTemplate.findUnique({
      where: { key },
      select: {
        id: true,
        key: true,
        title: true,
        unit: true,
        category: true,
        paramsJson: true,
        tags: true,
      },
    });
    if (!tpl) return res.status(404).json({ ok: false, error: "not found" });

    const base = getDefaultParams(tpl.paramsJson);

    const dbVariants = await prisma.recipeVariant.findMany({
      where: { templateId: tpl.id, enabled: true },
      orderBy: [{ key: "asc" }],
      select: {
        id: true,
        key: true,
        unit: true,
        enabled: true,
        params: true,
      },
      take: 5000,
    });

    const virtualDefault = {
      id: `virtual-default-${tpl.key}`,
      key: `virtual-default-${tpl.key}`,
      unit: tpl.unit,
      enabled: true,
      params: { ...base, _meta: { virtual: true } },
      label: labelFromParams(tpl.key, base, base),
      scoreHint: 1,
      changedKeys: [] as string[],
      isDefault: true,
      virtual: true,
    };

    const variants = dbVariants.map((v) => {
      const params = (v.params || {}) as any;
      const mergedForLabel = { ...base, ...stripMeta(params) };
      const ck = changedKeys(base, params);

      return {
        id: v.id,
        key: v.key,
        unit: v.unit || tpl.unit,
        enabled: v.enabled,
        params,
        label: labelFromParams(tpl.key, mergedForLabel, base),
        changedKeys: ck,
        isDefault: ck.length === 0,
        virtual: false,
      };
    });

    res.json({
      ok: true,
      template: {
        id: tpl.id,
        key: tpl.key,
        title: tpl.title,
        unit: tpl.unit,
        category: tpl.category,
        defaultParams: base,
        tags: tpl.tags || [],
      },
      variants: [virtualDefault, ...variants],
    });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ ok: false, error: e?.message || "failed" });
  }
});

/**
 * POST /api/kalkulation/recipes/templates/:key/suggest
 * Body: { context: {...}, take?: number }
 *
 * (companyId/pricingDate non servono per il suggest puro, ma li accettiamo per compatibilità UI)
 */
const suggestSchema = z.object({
  context: z.record(z.string(), z.unknown()).optional().default({}),
  take: z.number().int().min(1).max(20).optional().default(5),
  companyId: z.string().optional(),
  pricingDate: z.string().optional(),
});

router.post("/recipes/templates/:key/suggest", async (req, res) => {
  try {
    const key = String(req.params.key);
    const { context, take } = suggestSchema.parse(req.body || {});

    const tpl = await prisma.recipeTemplate.findUnique({
      where: { key },
      select: {
        id: true,
        key: true,
        title: true,
        unit: true,
        category: true,
        paramsJson: true,
        tags: true,
      },
    });
    if (!tpl) return res.status(404).json({ ok: false, error: "not found" });

    const base = getDefaultParams(tpl.paramsJson);

    const dbVariants = await prisma.recipeVariant.findMany({
      where: { templateId: tpl.id, enabled: true },
      select: {
        id: true,
        key: true,
        unit: true,
        enabled: true,
        params: true,
      },
      take: 5000,
    });

    const candidates = [
      {
        id: `virtual-default-${tpl.key}`,
        key: `virtual-default-${tpl.key}`,
        unit: tpl.unit,
        enabled: true,
        params: { ...base, _meta: { virtual: true } },
        virtual: true,
      },
      ...dbVariants.map((v) => ({
        id: v.id,
        key: v.key,
        unit: v.unit || tpl.unit,
        enabled: v.enabled,
        params: (v.params || {}) as any,
        virtual: false,
      })),
    ];

    const scored = candidates.map((c) => {
      const merged = { ...base, ...stripMeta(c.params || {}) };

      // ✅ changedKeys deve confrontare base vs override params
      const ck = changedKeys(base, c.virtual ? {} : stripMeta(c.params || {}));

      const { score, details } = scoreVariantAgainstContext(merged, (context || {}) as any);

      return {
        id: c.id,
        key: c.key,
        unit: c.unit,
        enabled: true,
        params: merged,
        label: labelFromParams(tpl.key, merged, base),
        changedKeys: ck,
        score,
        details,
        virtual: c.virtual,
      };
    });

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.changedKeys.length !== b.changedKeys.length) return a.changedKeys.length - b.changedKeys.length;
      return String(a.key).localeCompare(String(b.key));
    });

    const best = scored[0] || null;
    const alternatives = scored.slice(1, 1 + take);

    res.json({
      ok: true,
      template: {
        id: tpl.id,
        key: tpl.key,
        title: tpl.title,
        unit: tpl.unit,
        category: tpl.category,
        defaultParams: base,
        tags: tpl.tags || [],
      },
      best,
      alternatives,
    });
  } catch (e: any) {
    console.error(e);
    const msg = e?.issues ? "validation failed" : e?.message || "failed";
    res.status(400).json({ ok: false, error: msg, details: e?.issues || undefined });
  }
});

/* ============================================================
   CALC (Premium): template + variant + CompanyPrice lookup (DATE-AWARE)
   POST /api/kalkulation/recipes/calc
============================================================ */

const calcSchema = z.object({
  templateKey: z.string().min(2),
  qty: z.number().finite().nonnegative(),
  variantKey: z.string().optional(),
  variantId: z.string().optional(),
  params: z.record(z.string(), z.any()).optional().default({}),
  includeDisabled: z.boolean().optional().default(false),

  // opzionale: per DEV senza auth
  companyId: z.string().optional(),

  // NEW: date per selezione prezzi
  pricingDate: z.string().optional(),
});

router.post("/recipes/calc", async (req, res) => {
  try {
    const {
      templateKey,
      qty,
      variantId,
      variantKey,
      params: overrideParams,
      includeDisabled,
      companyId,
      pricingDate,
    } = calcSchema.parse(req.body || {});

    const tpl = await prisma.recipeTemplate.findUnique({
      where: { key: templateKey },
      include: { components: { orderBy: { sort: "asc" } } },
    });
    if (!tpl) return res.status(404).json({ ok: false, error: "template not found" });

    const base = getDefaultParams((tpl as any).paramsJson);
    let variantParams: Record<string, any> = {};
    let variantMeta: { id: string; key: string; unit: string; enabled: boolean } | null = null;

    // variant dal DB (opzionale)
    if (variantId || variantKey) {
      const v = await prisma.recipeVariant.findFirst({
        where: {
          templateId: tpl.id,
          ...(variantId ? { id: variantId } : {}),
          ...(variantKey ? { key: variantKey } : {}),
          ...(includeDisabled ? {} : { enabled: true }),
        },
        select: { id: true, key: true, unit: true, enabled: true, params: true },
      });

      if (v) {
        variantMeta = { id: v.id, key: v.key, unit: v.unit || tpl.unit, enabled: !!v.enabled };
        if (v.params && isPlainObject(v.params)) variantParams = v.params as any;
      }
    }

    // merge params (base + variant + override) con meta strip
    const mergedParams = {
      ...stripMeta(base),
      ...stripMeta(variantParams),
      ...stripMeta(overrideParams || {}),
    };

    // prepara environment per formule
    const env: Record<string, any> = {
      qty,
      QTY: qty,
      ...mergedParams,
    };

    // companyId per prezzi
    const cid = await resolveCompanyId(req, companyId);
    if (!cid) return res.status(400).json({ ok: false, error: "Missing companyId (no Company found in DB)" });

    const pDate = resolvePricingDate(req, pricingDate);

    // price lookup (tutti refKey componenti) -> CompanyPrice (DATE-AWARE)
    const refKeys = (tpl.components || []).map((c: any) => c.refKey).filter(Boolean);
    const priceMap = await loadCompanyPricesForRefKeys({ companyId: cid, refKeys, pricingDate: pDate });

    const breakdownComponents: any[] = [];
    let totalNet = 0;

    for (const c of (tpl.components || []) as any[]) {
      if (!c?.refKey || !c?.qtyFormula) continue;

      let qtyComputed = 0;
      let formulaOk = true;
      let formulaError: string | null = null;

      try {
        const expr = parser.parse(String(c.qtyFormula));
        qtyComputed = safeNumber(expr.evaluate(env), 0);
      } catch (e: any) {
        formulaOk = false;
        formulaError = e?.message || String(e);
        qtyComputed = 0;
      }

      const price = priceMap.get(c.refKey);
      const unitPrice = price ? safeNumber(price.price, 0) : 0;
      const lineNet = qtyComputed * unitPrice;

      totalNet += lineNet;

      breakdownComponents.push({
        type: c.type,
        refKey: c.refKey,
        title: c.refKey,
        qtyFormula: c.qtyFormula,
        qty: Number(qtyComputed.toFixed(6)),
        unit: (price?.unit as any) || c.unit || tpl.unit || null,
        unitPriceNet: Number(unitPrice.toFixed(4)),
        lineNet: Number(lineNet.toFixed(4)),
        mandatory: !!c.mandatory,
        riskFactor: safeNumber(c.riskFactor, 1.0),
        sort: c.sort ?? 0,
        note: c.note ?? null,
        formulaOk,
        formulaError,
        priceFound: !!price,
        priceValidFrom: price?.validFrom ? price.validFrom.toISOString() : null,
        priceValidTo: price?.validTo ? price.validTo.toISOString() : null,
      });
    }

    const perUnit = qty > 0 ? totalNet / qty : totalNet;

    return res.json({
      ok: true,
      template: {
        id: tpl.id,
        key: tpl.key,
        title: tpl.title,
        unit: tpl.unit,
        category: tpl.category,
        defaultParams: base,
        tags: (tpl as any).tags || [],
      },
      variant: variantMeta,
      pricing: {
  companyId: cid,
  pricingDate: pDate.toISOString(),

  // ✅ label corta per UI
  mode: "CompanyPrice (date-aware)",

  // ✅ dettaglio debug, se ti serve in futuro
  modeDebug: "validFrom <= pricingDate AND (validTo is null OR validTo > pricingDate); pick latest validFrom",
},

      input: {
        qty,
        params: mergedParams,
      },
      breakdown: {
        components: breakdownComponents,
        totals: {
          totalNet: Number(totalNet.toFixed(4)),
          currency: "EUR",
          netPerUnit: Number(perUnit.toFixed(4)),
          unit: tpl.unit,
          missingPrices: breakdownComponents.filter((x) => !x.priceFound).map((x) => x.refKey),
          formulaErrors: breakdownComponents
            .filter((x) => !x.formulaOk)
            .map((x) => ({ refKey: x.refKey, error: x.formulaError })),
        },
      },
    });
  } catch (e: any) {
    console.error(e);
    const msg = e?.issues ? "validation failed" : e?.message || "failed";
    res.status(400).json({ ok: false, error: msg, details: e?.issues || undefined });
  }
});

/* ============================================================
   PREMIUM PIPELINE: suggest + calc in one shot (DATE-AWARE)
   POST /api/kalkulation/recipes/calc-suggest
============================================================ */

const calcSuggestSchema = z.object({
  templateKey: z.string().min(2),
  qty: z.number().finite().nonnegative(),
  context: z.record(z.string(), z.any()).default({}),
  take: z.number().int().min(1).max(20).optional().default(5),
  companyId: z.string().optional(),
  pricingDate: z.string().optional(), // NEW
});

router.post("/recipes/calc-suggest", async (req, res) => {
  try {
    const { templateKey, qty, context, take, companyId, pricingDate } = calcSuggestSchema.parse(req.body || {});

    const tpl = await prisma.recipeTemplate.findUnique({
      where: { key: templateKey },
      select: { id: true, key: true, title: true, unit: true, category: true, paramsJson: true, tags: true },
    });
    if (!tpl) return res.status(404).json({ ok: false, error: "not found" });

    const base = getDefaultParams(tpl.paramsJson);

    const dbVariants = await prisma.recipeVariant.findMany({
      where: { templateId: tpl.id, enabled: true },
      select: { id: true, key: true, unit: true, params: true },
      take: 5000,
    });

    const candidates = [
      {
        id: `virtual-default-${tpl.key}`,
        key: `virtual-default-${tpl.key}`,
        unit: tpl.unit,
        params: { ...base, _meta: { virtual: true } },
        virtual: true,
      },
      ...dbVariants.map((v) => ({
        id: v.id,
        key: v.key,
        unit: v.unit || tpl.unit,
        params: (v.params || {}) as any,
        virtual: false,
      })),
    ];

    const scored = candidates
      .map((c) => {
        const merged = { ...stripMeta(base), ...stripMeta(c.params || {}) };

        // ✅ qui changedKeys deve confrontare base vs override params
        const ck = changedKeys(base, c.virtual ? {} : stripMeta(c.params || {}));

        const { score } = scoreVariantAgainstContext(merged, context || {});
        return { ...c, merged, changedKeys: ck, score, label: labelFromParams(tpl.key, merged, base) };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.changedKeys.length !== b.changedKeys.length) return a.changedKeys.length - b.changedKeys.length;
        return String(a.key).localeCompare(String(b.key));
      });

    const best = scored[0];
    const alternatives = scored.slice(1, 1 + take);

    // calcolo con BEST params
    const tplFull = await prisma.recipeTemplate.findUnique({
      where: { key: templateKey },
      include: { components: { orderBy: { sort: "asc" } } },
    });
    if (!tplFull) return res.status(404).json({ ok: false, error: "template not found" });

    const env: Record<string, any> = { qty, QTY: qty, ...best.merged };

    // prezzi company
    const cid = await resolveCompanyId(req, companyId);
    if (!cid) return res.status(400).json({ ok: false, error: "Missing companyId (no Company found in DB)" });

    const pDate = resolvePricingDate(req, pricingDate);

    const refKeys = (tplFull.components || []).map((c: any) => c.refKey).filter(Boolean);
    const priceMap = await loadCompanyPricesForRefKeys({ companyId: cid, refKeys, pricingDate: pDate });

    const breakdownComponents: any[] = [];
    let totalNet = 0;

    for (const c of (tplFull.components || []) as any[]) {
      if (!c?.refKey || !c?.qtyFormula) continue;

      let qtyComputed = 0;
      let formulaOk = true;
      let formulaError: string | null = null;

      try {
        qtyComputed = safeNumber(parser.parse(String(c.qtyFormula)).evaluate(env), 0);
      } catch (e: any) {
        formulaOk = false;
        formulaError = e?.message || String(e);
        qtyComputed = 0;
      }

      const price = priceMap.get(c.refKey);
      const unitPrice = price ? safeNumber(price.price, 0) : 0;
      const lineNet = qtyComputed * unitPrice;
      totalNet += lineNet;

      breakdownComponents.push({
        type: c.type,
        refKey: c.refKey,
        title: c.refKey,
        qtyFormula: c.qtyFormula,
        qty: Number(qtyComputed.toFixed(6)),
        unit: (price?.unit as any) || c.unit || tplFull.unit || null,
        unitPriceNet: Number(unitPrice.toFixed(4)),
        lineNet: Number(lineNet.toFixed(4)),
        formulaOk,
        formulaError,
        priceFound: !!price,
        priceValidFrom: price?.validFrom ? price.validFrom.toISOString() : null,
        priceValidTo: price?.validTo ? price.validTo.toISOString() : null,
      });
    }

    const perUnit = qty > 0 ? totalNet / qty : totalNet;

    return res.json({
      ok: true,
      template: {
        id: tpl.id,
        key: tpl.key,
        title: tpl.title,
        unit: tpl.unit,
        category: tpl.category,
        defaultParams: base,
        tags: tpl.tags || [],
      },
      suggest: {
        best: {
          id: best.id,
          key: best.key,
          score: best.score,
          label: best.label,
          params: best.merged,
          virtual: best.virtual,
        },
        alternatives: alternatives.map((a) => ({
          id: a.id,
          key: a.key,
          score: a.score,
          label: a.label,
          params: a.merged,
          virtual: a.virtual,
        })),
      },
      pricing: {
  companyId: cid,
  pricingDate: pDate.toISOString(),

  // ✅ label corta per UI
  mode: "CompanyPrice (date-aware)",

  // ✅ dettaglio debug, se ti serve in futuro
  modeDebug: "validFrom <= pricingDate AND (validTo is null OR validTo > pricingDate); pick latest validFrom",
},

      input: { qty, context },
      breakdown: {
        components: breakdownComponents,
        totals: {
          totalNet: Number(totalNet.toFixed(4)),
          currency: "EUR",
          netPerUnit: Number(perUnit.toFixed(4)),
          unit: tpl.unit,
          missingPrices: breakdownComponents.filter((x) => !x.priceFound).map((x) => x.refKey),
          formulaErrors: breakdownComponents
            .filter((x) => !x.formulaOk)
            .map((x) => ({ refKey: x.refKey, error: x.formulaError })),
        },
      },
    });
  } catch (e: any) {
    console.error(e);
    const msg = e?.issues ? "validation failed" : e?.message || "failed";
    res.status(400).json({ ok: false, error: msg, details: e?.issues || undefined });
  }
});

export default router;

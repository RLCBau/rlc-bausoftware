// apps/server/src/routes/kalkulation.variants.ts
import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma";

const router = Router();

/* =========================
   Helpers
   ========================= */

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

function isObject(x: any): x is Record<string, any> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function getDefaultParams(paramsJson: any): Record<string, any> {
  const d = paramsJson?.defaultParams;
  return isObject(d) ? d : {};
}

function hashParams(templateKey: string, params: any) {
  const s = stableStringify(params ?? {});
  return crypto
    .createHash("sha1")
    .update(templateKey + "|" + s)
    .digest("hex")
    .slice(0, 12);
}

/** label "premium": compatto, leggibile in UI */
function buildLabel(params: Record<string, any>): string {
  const parts: string[] = [];

  // ordine “umano”
  if (typeof params.dn_mm === "number") parts.push(`DN${params.dn_mm}`);
  if (typeof params.pressureBar === "number") parts.push(`${params.pressureBar} bar`);
  if (typeof params.depth_m === "number") parts.push(`${Number(params.depth_m).toFixed(2)}m`);
  if (typeof params.width_m === "number") parts.push(`B ${Number(params.width_m).toFixed(2)}m`);
  if (typeof params.thickness_m === "number") parts.push(`t ${Number(params.thickness_m).toFixed(2)}m`);
  if (typeof params.area === "number") parts.push(`${Number(params.area).toFixed(0)} m²`);
  if (typeof params.length === "number") parts.push(`${Number(params.length).toFixed(0)} m`);

  if (typeof params.soilClass === "string") parts.push(params.soilClass);
  if (typeof params.materialType === "string") parts.push(params.materialType);
  if (typeof params.disposalClass === "string") parts.push(params.disposalClass);
  if (typeof params.distance_km === "number") parts.push(`${params.distance_km} km`);

  if (typeof params.deck_cm === "number") parts.push(`Deck ${params.deck_cm}cm`);
  if (typeof params.trag_cm === "number") parts.push(`Trag ${params.trag_cm}cm`);
  if (typeof params.bedding_cm === "number") parts.push(`Bett ${params.bedding_cm}cm`);

  if (typeof params.restricted === "boolean") parts.push(params.restricted ? "beengt" : "normal");
  if (typeof params.groundwater === "boolean") parts.push(params.groundwater ? "GW" : "kein GW");
  if (typeof params.bedding === "boolean") parts.push(params.bedding ? "Bettung" : "ohne Bettung");
  if (typeof params.shutoffValve === "boolean") parts.push(params.shutoffValve ? "mit Schieber" : "ohne Schieber");

  // fallback: se è vuoto, almeno “Variant”
  if (!parts.length) return "Variant";
  return parts.join(" / ");
}

function changedKeys(defaultParams: Record<string, any>, params: Record<string, any>) {
  const keys = new Set<string>([...Object.keys(defaultParams || {}), ...Object.keys(params || {})]);
  const out: string[] = [];
  for (const k of keys) {
    const a = defaultParams?.[k];
    const b = params?.[k];
    if (stableStringify(a) !== stableStringify(b)) out.push(k);
  }
  out.sort();
  return out;
}

/* =========================
   Routes
   ========================= */

/**
 * GET /api/kalkulation/templates/:key/variants
 *
 * Output premium:
 * - default variant (se esiste) sempre prima
 * - poi meno modifiche rispetto al default
 * - poi stabile per key
 */
router.get("/templates/:key/variants", async (req, res) => {
  try {
    const templateKey = String(req.params.key || "").trim();
    if (!templateKey) return res.status(400).json({ ok: false, error: "Missing template key" });

    const tpl = await prisma.recipeTemplate.findUnique({
      where: { key: templateKey },
      select: { id: true, key: true, unit: true, category: true, title: true, paramsJson: true },
    });

    if (!tpl) return res.status(404).json({ ok: false, error: "Template not found" });

    const def = getDefaultParams(tpl.paramsJson);

    const variants = await prisma.recipeVariant.findMany({
      where: { templateId: tpl.id, enabled: true },
      select: { id: true, key: true, unit: true, enabled: true, params: true },
      orderBy: { key: "asc" }, // base stable, poi riordiniamo noi
    });

    // costruisci oggetti premium
    const enriched = variants.map((v) => {
      const p = isObject(v.params) ? (v.params as Record<string, any>) : {};
      const isDefault = stableStringify(p) === stableStringify(def);
      const ck = changedKeys(def, p);
      return {
        id: v.id,
        key: v.key,
        unit: v.unit || tpl.unit,
        enabled: v.enabled,
        params: p,
        label: buildLabel(p),
        changedKeys: ck,
        isDefault,
      };
    });

    // se non esiste una variante “default” identica, la “virtualizziamo” (premium UX)
    const hasDefault = enriched.some((x) => x.isDefault);
    const virtualDefault = !hasDefault
      ? [
          {
            id: `virtual-default-${tpl.key}-${hashParams(tpl.key, def)}`,
            key: `${tpl.key}|${hashParams(tpl.key, def)}`,
            unit: tpl.unit,
            enabled: true,
            params: def,
            label: buildLabel(def),
            changedKeys: [] as string[],
            isDefault: true,
            virtual: true as const,
          },
        ]
      : [];

    const finalList = [...virtualDefault, ...enriched];

    // ordering premium
    finalList.sort((a: any, b: any) => {
      if (!!a.isDefault !== !!b.isDefault) return a.isDefault ? -1 : 1;
      const al = (a.changedKeys?.length ?? 0);
      const bl = (b.changedKeys?.length ?? 0);
      if (al !== bl) return al - bl;
      return String(a.key).localeCompare(String(b.key));
    });

    res.json({
      ok: true,
      template: {
        id: tpl.id,
        key: tpl.key,
        title: (tpl as any).title ?? null,
        unit: tpl.unit,
        category: tpl.category,
        defaultParams: def,
      },
      variants: finalList,
    });
  } catch (e: any) {
    console.error("[kalkulation.variants] error", e);
    res.status(500).json({ ok: false, error: e?.message || "Internal error" });
  }
});

export default router;

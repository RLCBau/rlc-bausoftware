// apps/web/src/pages/kalkulation/Recipes.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchTemplates,
  fetchVariants,
  suggestTemplate,
  calcTemplate,
  calcSuggestTemplate,
  RecipeTemplate,
  RecipeVariant,
} from "../../lib/recipesApi";
import { useProject } from "../../store/useProject";

function pretty(x: any) {
  try {
    return JSON.stringify(x, null, 2);
  } catch {
    return String(x);
  }
}

function eur(n: any) {
  const num = Number(n || 0);
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(num);
}

type CalcComponent = {
  type?: string;
  refKey?: string;
  title?: string;
  qtyFormula?: string;
  qty?: number;
  unit?: string;
  unitPriceNet?: number;
  lineNet?: number;
  priceFound?: boolean;
  formulaOk?: boolean;
  formulaError?: string | null;
};

function toIsoStartOfDay(dateStr: string) {
  // dateStr: "YYYY-MM-DD"
  if (!dateStr) return undefined;
  const [y, m, d] = dateStr.split("-").map((x) => Number(x));
  if (!y || !m || !d) return undefined;
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
  return dt.toISOString();
}

/**
 * ✅ UI-only formatting (non cambia la logica backend).
 * Accetta:
 * - "YYYY-MM-DD"
 * - ISO "2026-01-13T23:00:00.000Z"
 * - qualsiasi stringa -> fallback
 */
function formatPricingDateForUi(v?: string) {
  const s = String(v || "").trim();
  if (!s) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-");
    return `${d}.${m}.${y}`;
  }

  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) {
    return new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(dt);
  }
  return s;
}

/* =========================
   Bridge: Rezepte -> Kalkulation (Manuell/KI)
   - sessionStorage draft, poi navigate
   ========================= */

type KalkulationDraftRow = {
  pos?: string;
  text: string;
  unit: string;
  qty: number;
  ep: number;
  total?: number;
  meta?: any;
};

type KalkulationDraft = {
  projectId?: string;
  projectCode?: string;
  source: "rezepte";
  recipeKey: string;
  variantId?: string;
  pricingDate?: string; // ISO
  params?: any;
  context?: any;
  qty?: number;
  totalNet?: number;
  rows: KalkulationDraftRow[];
  createdAt: number;
};

function safeNum(x: any, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function makeDraftStorageKey(projectCodeOrId: string, recipeKey: string) {
  const p = String(projectCodeOrId || "unknown").trim() || "unknown";
  const r = String(recipeKey || "recipe").trim() || "recipe";
  return `kalkulation:draft:${p}:${r}`;
}

/* =========================
   ✅ Rezepte UI persistence
   - salva / ripristina lo stato quando torni nella pagina
   ========================= */
const RECIPES_UI_STATE_KEY = "rlc_recipes_ui_state_v1";

/* =========================
   ✅ KI handoff (persistente)
   - il KI screen ora legge questa chiave
   ========================= */
const KI_HANDOFF_KEY = "rlc_kalkulation_ki_handoff_v1";

type RecipesUiState = {
  // basic ui
  selectedKey?: string;
  q?: string;
  category?: string;

  // inputs
  qty?: number;

  dnMm?: number;
  depthM?: number;
  soilClass?: string;
  restricted?: boolean;
  groundwater?: boolean;
  take?: number;

  days?: number;
  count?: number;

  pricingDate?: string; // yyyy-mm-dd

  // results
  suggestRes?: any;
  calcRes?: any;
  pipeRes?: any;

  // meta to avoid restoring across different projects accidentally
  projectKey?: string; // code or id
  updatedAt?: number;
};

export default function Recipes() {
  const nav = useNavigate();
  const project = useProject();

  const projectCodeOrId = String((project as any)?.code || (project as any)?.projectCode || (project as any)?.id || "").trim() || "unknown";

  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const [templates, setTemplates] = React.useState<RecipeTemplate[]>([]);
  const [selectedKey, setSelectedKey] = React.useState<string>("");

  const [variants, setVariants] = React.useState<RecipeVariant[]>([]);
  const [variantInfo, setVariantInfo] = React.useState<any>(null);

  // Filters
  const [q, setQ] = React.useState("");
  const [category, setCategory] = React.useState<string>("ALL");

  // Guided inputs
  const [qty, setQty] = React.useState<number>(10);

  // Suggest context (guided)
  const [dnMm, setDnMm] = React.useState<number>(150);
  const [depthM, setDepthM] = React.useState<number>(1.2);
  const [soilClass, setSoilClass] = React.useState<string>("3");
  const [restricted, setRestricted] = React.useState<boolean>(false);
  const [groundwater, setGroundwater] = React.useState<boolean>(false);
  const [take, setTake] = React.useState<number>(5);

  // Calc params (guided)
  const [days, setDays] = React.useState<number>(1.2);
  const [count, setCount] = React.useState<number>(0.8);

  // ✅ Pricing date (important for validFrom / validTo)
  const [pricingDate, setPricingDate] = React.useState<string>(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });

  // Results
  const [suggestRes, setSuggestRes] = React.useState<any>(null);
  const [calcRes, setCalcRes] = React.useState<any>(null);
  const [pipeRes, setPipeRes] = React.useState<any>(null);

  // UI toggles
  const [showCalcDebug, setShowCalcDebug] = React.useState<boolean>(false);

  const categories = React.useMemo(() => {
    const set = new Set<string>();
    for (const t of templates) if (t.category) set.add(String(t.category));
    return ["ALL", ...Array.from(set).sort()];
  }, [templates]);

  const filteredTemplates = React.useMemo(() => {
    const qq = q.trim().toLowerCase();
    return templates.filter((t) => {
      const okCat = category === "ALL" ? true : String(t.category || "") === category;
      if (!okCat) return false;
      if (!qq) return true;
      const hay = `${t.key} ${t.title} ${t.category || ""}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [templates, q, category]);

  async function loadTemplates() {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetchTemplates(200);
      setTemplates(res.templates || []);

      // ✅ non sovrascrivere selectedKey se l’utente l’ha già
      if (!selectedKey && res.templates?.[0]?.key) setSelectedKey(res.templates[0].key);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadVariants() {
    if (!selectedKey) return;
    setErr(null);
    setLoading(true);
    try {
      const res = await fetchVariants(selectedKey);
      setVariants(res.variants || []);
      setVariantInfo(res);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  function buildContext() {
    return {
      dn_mm: dnMm,
      depth_m: depthM,
      soilClass,
      restricted,
      groundwater,
    };
  }

  function buildParams() {
    return {
      days,
      count,
    };
  }

  function applyBestParams(best: any) {
    if (!best?.params) return;
    if (typeof best.params.days === "number") setDays(best.params.days);
    if (typeof best.params.count === "number") setCount(best.params.count);
  }

  async function doSuggest() {
    if (!selectedKey) return;
    setErr(null);
    setLoading(true);
    try {
      const res = await suggestTemplate(selectedKey, { context: buildContext(), take });
      setSuggestRes(res);
      if (res?.best) applyBestParams(res.best);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function doCalc() {
    if (!selectedKey) return;
    setErr(null);
    setLoading(true);
    try {
      const isoPricingDate = toIsoStartOfDay(pricingDate);
      const res = await calcTemplate({
        templateKey: selectedKey,
        qty: Number(qty) || 0,
        params: buildParams(),
        pricingDate: isoPricingDate,
      } as any);
      setCalcRes(res);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function doCalcSuggest() {
    if (!selectedKey) return;
    setErr(null);
    setLoading(true);
    try {
      const isoPricingDate = toIsoStartOfDay(pricingDate);

      const res = await calcSuggestTemplate({
        templateKey: selectedKey,
        qty: Number(qty) || 0,
        context: buildContext(),
        take,
        pricingDate: isoPricingDate,
      } as any);

      setPipeRes(res);

      const best = res?.suggest?.best;
      if (best) {
        applyBestParams(best);

        const calcRes2 = await calcTemplate({
          templateKey: selectedKey,
          qty: Number(qty) || 0,
          params: best.params || {},
          pricingDate: isoPricingDate,
        } as any);
        setCalcRes(calcRes2);
      }
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  /* =========================
     ✅ Restore UI state (Rezepte)
     ========================= */
  React.useEffect(() => {
    try {
      const raw = sessionStorage.getItem(RECIPES_UI_STATE_KEY);
      if (!raw) return;
      const st: RecipesUiState = JSON.parse(raw);

      // restore solo se è lo stesso progetto (evita mix)
      if (st?.projectKey && st.projectKey !== projectCodeOrId) return;

      if (typeof st.selectedKey === "string") setSelectedKey(st.selectedKey);
      if (typeof st.q === "string") setQ(st.q);
      if (typeof st.category === "string") setCategory(st.category);

      if (typeof st.qty === "number") setQty(st.qty);

      if (typeof st.dnMm === "number") setDnMm(st.dnMm);
      if (typeof st.depthM === "number") setDepthM(st.depthM);
      if (typeof st.soilClass === "string") setSoilClass(st.soilClass);
      if (typeof st.restricted === "boolean") setRestricted(st.restricted);
      if (typeof st.groundwater === "boolean") setGroundwater(st.groundwater);
      if (typeof st.take === "number") setTake(st.take);

      if (typeof st.days === "number") setDays(st.days);
      if (typeof st.count === "number") setCount(st.count);

      if (typeof st.pricingDate === "string") setPricingDate(st.pricingDate);

      if (st.suggestRes != null) setSuggestRes(st.suggestRes);
      if (st.calcRes != null) setCalcRes(st.calcRes);
      if (st.pipeRes != null) setPipeRes(st.pipeRes);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectCodeOrId]);

  /* =========================
     ✅ Persist UI state (Rezepte)
     - debounce leggero per non scrivere 1000 volte
     ========================= */
  React.useEffect(() => {
    const t = window.setTimeout(() => {
      const st: RecipesUiState = {
        projectKey: projectCodeOrId,
        updatedAt: Date.now(),
        selectedKey,
        q,
        category,
        qty,
        dnMm,
        depthM,
        soilClass,
        restricted,
        groundwater,
        take,
        days,
        count,
        pricingDate,
        suggestRes,
        calcRes,
        pipeRes,
      };
      try {
        sessionStorage.setItem(RECIPES_UI_STATE_KEY, JSON.stringify(st));
      } catch {
        // ignore
      }
    }, 120);

    return () => window.clearTimeout(t);
  }, [
    projectCodeOrId,
    selectedKey,
    q,
    category,
    qty,
    dnMm,
    depthM,
    soilClass,
    restricted,
    groundwater,
    take,
    days,
    count,
    pricingDate,
    suggestRes,
    calcRes,
    pipeRes,
  ]);

  React.useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (selectedKey) {
      loadVariants();
      // ✅ non azzerare sempre: se torno indietro voglio vedere gli ultimi risultati
      // Se preferisci reset quando cambi template, lascia il reset ma solo se selectedKey cambia davvero rispetto a prima.
      setShowCalcDebug(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  const best = suggestRes?.best || pipeRes?.suggest?.best || pipeRes?.best;

  // ===== Calc view helpers =====
  const calcComponents: CalcComponent[] = React.useMemo(() => {
    const c = calcRes?.breakdown?.components;
    return Array.isArray(c) ? c : [];
  }, [calcRes]);

  const calcTotals = calcRes?.breakdown?.totals || null;
  const totalNet = Number(calcTotals?.totalNet ?? 0);

  const pricingInfo = calcRes?.pricing || pipeRes?.pricing || null;
  const missingPrices: string[] = Array.isArray(calcTotals?.missingPrices) ? calcTotals.missingPrices : [];
  const formulaErrors: any[] = Array.isArray(calcTotals?.formulaErrors) ? calcTotals.formulaErrors : [];

  const pricingDateUsed =
    (calcRes?.pricing?.pricingDate as string | undefined) ||
    (pipeRes?.pricing?.pricingDate as string | undefined) ||
    toIsoStartOfDay(pricingDate);

  function buildDraft(): KalkulationDraft | null {
    if (!selectedKey) return null;

    // progetto: preferisci code (FS-key), fallback id
    const projectId = String((project as any)?.id || "").trim() || undefined;
    const projectCode = String((project as any)?.code || (project as any)?.projectCode || "").trim() || undefined;

    // prendi componenti come righe “pronte” (se non ci sono, non esportare)
    if (!calcComponents.length) return null;

    const rows: KalkulationDraftRow[] = calcComponents.map((c) => {
      const unit = String(c.unit || "Stk");
      const qn = safeNum(c.qty, 0);
      const ep = safeNum(c.unitPriceNet, 0);
      const line = safeNum(c.lineNet, qn * ep);

      return {
        pos: c.refKey || c.title || "",
        text: c.title || c.refKey || "",
        unit,
        qty: qn,
        ep,
        total: line,
        meta: {
          type: c.type,
          qtyFormula: c.qtyFormula,
          priceFound: c.priceFound,
          formulaOk: c.formulaOk,
          formulaError: c.formulaError ?? null,
        },
      };
    });

    const draft: KalkulationDraft = {
      projectId,
      projectCode,
      source: "rezepte",
      recipeKey: selectedKey,
      variantId: best?.key,
      pricingDate: pricingDateUsed,
      params: best?.params || buildParams(),
      context: pipeRes?.suggest?.context || buildContext(),
      qty,
      totalNet,
      rows,
      createdAt: Date.now(),
    };

    // key stabile (per Manuell/KI legacy)
    const key = makeDraftStorageKey(projectCodeOrId || "unknown", selectedKey);
    sessionStorage.setItem(key, JSON.stringify(draft));
    sessionStorage.setItem("kalkulation:lastDraftKey", key);

    // ✅ KI handoff persistente (per il nuovo bridge KI)
    // Nota: salvo un payload "semplice" di righe che il KI screen sa leggere
    try {
      const handoff = {
        ts: draft.createdAt,
        source: "rezepte",
        projectKey: projectCodeOrId,
        recipeKey: selectedKey,
        rows: draft.rows.map((r) => ({
          posNr: r.pos || "",
          kurztext: r.text || "",
          einheit: r.unit || "",
          menge: r.qty || 0,
          preis: r.ep || 0,
          confidence: typeof r?.meta?.confidence === "number" ? r.meta.confidence : undefined,
        })),
      };
      localStorage.setItem(KI_HANDOFF_KEY, JSON.stringify(handoff));
    } catch {
      // ignore
    }

    return draft;
  }

  function pushToManuell() {
    const d = buildDraft();
    if (!d) {
      alert("Bitte zuerst Calc / Calc+Suggest ausführen, damit es etwas zu übernehmen gibt.");
      return;
    }
    nav("/kalkulation/manuell?from=rezepte");
  }

  function pushToKI() {
    const d = buildDraft();
    if (!d) {
      alert("Bitte zuerst Calc / Calc+Suggest ausführen, damit es etwas zu übernehmen gibt.");
      return;
    }
    nav("/kalkulation/mit-ki?from=rezepte");
  }

  return (
    <div style={{ padding: 16, display: "grid", gridTemplateColumns: "380px 1fr", gap: 16 }}>
      {/* LEFT: Templates */}
      <div style={{ border: "1px solid #2a2a2a", borderRadius: 12, padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div style={{ fontWeight: 700 }}>Kalkulation mit KI – Rezepte</div>
          <button onClick={loadTemplates} disabled={loading} style={{ padding: "6px 10px" }}>
            Reload
          </button>
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search key/title…"
            style={{ padding: 10, borderRadius: 10, border: "1px solid #333", background: "transparent", color: "inherit" }}
          />

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #333", background: "transparent", color: "inherit" }}
          >
            {categories.map((c) => (
              <option key={c} value={c} style={{ background: "#111" }}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginTop: 12, maxHeight: "70vh", overflow: "auto" }}>
          {filteredTemplates.map((t) => (
            <div
              key={t.key}
              onClick={() => setSelectedKey(t.key)}
              style={{
                cursor: "pointer",
                padding: 10,
                borderRadius: 10,
                border: t.key === selectedKey ? "1px solid #6b6b6b" : "1px solid #2a2a2a",
                marginBottom: 8,
                background: t.key === selectedKey ? "rgba(255,255,255,0.04)" : "transparent",
              }}
            >
              <div style={{ fontWeight: 700 }}>{t.title}</div>
              <div style={{ opacity: 0.8, fontSize: 12 }}>{t.key}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 6, opacity: 0.85, fontSize: 12 }}>
                <span>{t.category || "-"}</span>
                <span>•</span>
                <span>{t.unit || "-"}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT */}
      <div style={{ border: "1px solid #2a2a2a", borderRadius: 12, padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{selectedKey || "—"}</div>
            <div style={{ opacity: 0.8, fontSize: 12 }}>
              Variants: {variants.length} {loading ? "• loading…" : ""}
            </div>

            {pricingInfo?.companyId && (
              <div style={{ opacity: 0.8, fontSize: 12, marginTop: 4 }}>
                Pricing: <span style={{ fontFamily: "monospace" }}>{pricingInfo.companyId}</span>{" "}
                {pricingInfo.mode ? <span style={{ opacity: 0.85 }}>• {String(pricingInfo.mode)}</span> : null}
              </div>
            )}

            <div style={{ opacity: 0.8, fontSize: 12, marginTop: 4 }}>
              Pricing Date: <span style={{ fontFamily: "monospace" }}>{formatPricingDateForUi(pricingDateUsed || "")}</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button onClick={loadVariants} disabled={loading || !selectedKey} style={{ padding: "8px 12px" }}>
              Load Variants
            </button>
            <button onClick={doSuggest} disabled={loading || !selectedKey} style={{ padding: "8px 12px" }}>
              Suggest
            </button>
            <button onClick={doCalc} disabled={loading || !selectedKey} style={{ padding: "8px 12px" }}>
              Calc
            </button>
            <button onClick={doCalcSuggest} disabled={loading || !selectedKey} style={{ padding: "8px 12px" }}>
              Calc+Suggest
            </button>

            {/* ✅ Bridge buttons */}
            <button onClick={pushToManuell} disabled={!calcComponents.length} style={{ padding: "8px 12px" }}>
              → Kalkulation Manuell
            </button>
            <button onClick={pushToKI} disabled={!calcComponents.length} style={{ padding: "8px 12px" }}>
              → Kalkulation mit KI
            </button>
          </div>
        </div>

        {err && (
          <div style={{ marginTop: 10, padding: 10, borderRadius: 10, border: "1px solid #663", background: "rgba(255,200,0,0.08)" }}>
            <div style={{ fontWeight: 700 }}>Error</div>
            <div style={{ fontFamily: "monospace", whiteSpace: "pre-wrap" }}>{err}</div>
          </div>
        )}

        {/* Guided inputs */}
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ border: "1px solid #2a2a2a", borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Suggest Context</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={{ display: "grid", gap: 6, fontSize: 12 }}>
                dn_mm
                <input
                  type="number"
                  value={dnMm}
                  onChange={(e) => setDnMm(Number(e.target.value))}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #333", background: "transparent", color: "inherit" }}
                />
              </label>

              <label style={{ display: "grid", gap: 6, fontSize: 12 }}>
                depth_m
                <input
                  type="number"
                  step="0.1"
                  value={depthM}
                  onChange={(e) => setDepthM(Number(e.target.value))}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #333", background: "transparent", color: "inherit" }}
                />
              </label>

              <label style={{ display: "grid", gap: 6, fontSize: 12 }}>
                soilClass
                <input
                  value={soilClass}
                  onChange={(e) => setSoilClass(e.target.value)}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #333", background: "transparent", color: "inherit" }}
                />
              </label>

              <label style={{ display: "grid", gap: 6, fontSize: 12 }}>
                take
                <input
                  type="number"
                  value={take}
                  onChange={(e) => setTake(Number(e.target.value))}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #333", background: "transparent", color: "inherit" }}
                />
              </label>
            </div>

            <div style={{ display: "flex", gap: 14, marginTop: 10, alignItems: "center" }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
                <input type="checkbox" checked={restricted} onChange={(e) => setRestricted(e.target.checked)} />
                restricted
              </label>

              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
                <input type="checkbox" checked={groundwater} onChange={(e) => setGroundwater(e.target.checked)} />
                groundwater
              </label>
            </div>

            <div style={{ marginTop: 10, opacity: 0.8, fontSize: 12, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
              {pretty(buildContext())}
            </div>
          </div>

          <div style={{ border: "1px solid #2a2a2a", borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Calc Inputs</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={{ display: "grid", gap: 6, fontSize: 12 }}>
                qty
                <input
                  type="number"
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value))}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #333", background: "transparent", color: "inherit" }}
                />
              </label>

              <label style={{ display: "grid", gap: 6, fontSize: 12 }}>
                pricingDate
                <input
                  type="date"
                  value={pricingDate}
                  onChange={(e) => setPricingDate(e.target.value)}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #333", background: "transparent", color: "inherit" }}
                />
              </label>

              <label style={{ display: "grid", gap: 6, fontSize: 12 }}>
                days
                <input
                  type="number"
                  step="0.1"
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #333", background: "transparent", color: "inherit" }}
                />
              </label>

              <label style={{ display: "grid", gap: 6, fontSize: 12 }}>
                count
                <input
                  type="number"
                  step="0.1"
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #333", background: "transparent", color: "inherit" }}
                />
              </label>
            </div>

            <div style={{ marginTop: 10, opacity: 0.8, fontSize: 12, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
              {pretty({ ...buildParams(), pricingDate: toIsoStartOfDay(pricingDate) })}
            </div>
          </div>
        </div>

        {/* Best + Results */}
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div style={{ border: "1px solid #2a2a2a", borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Best Variant</div>
            {best ? (
              <div style={{ fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap" }}>
                {pretty({
                  key: best.key,
                  label: best.label,
                  score: best.score,
                  virtual: best.virtual,
                  isDefault: best.isDefault,
                  params: best.params,
                  changedKeys: best.changedKeys,
                })}
              </div>
            ) : (
              <div style={{ opacity: 0.7, fontSize: 12 }}>Run Suggest / Calc+Suggest</div>
            )}
          </div>

          <div style={{ border: "1px solid #2a2a2a", borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Suggest Result</div>
            <pre style={{ margin: 0, fontSize: 12, overflow: "auto", maxHeight: 260 }}>{pretty(suggestRes)}</pre>
          </div>

          {/* CALC RESULT (table + debug) */}
          <div style={{ border: "1px solid #2a2a2a", borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Calc Result</div>

            {calcComponents.length ? (
              <>
                <div style={{ border: "1px solid #2a2a2a", borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 110px", background: "rgba(255,255,255,0.03)" }}>
                    <div style={{ padding: "8px 10px", fontSize: 12, fontWeight: 700 }}>Komponente</div>
                    <div style={{ padding: "8px 10px", fontSize: 12, fontWeight: 700, textAlign: "right" }}>Formel</div>
                  </div>

                  {calcComponents.map((c, idx) => (
                    <div
                      key={`${c.refKey || c.title || idx}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 110px",
                        borderTop: "1px solid #2a2a2a",
                      }}
                    >
                      <div style={{ padding: "8px 10px", fontSize: 12 }}>
                        <div style={{ fontWeight: 700 }}>{c.refKey || c.title || "-"}</div>
                        <div style={{ opacity: 0.75, marginTop: 2 }}>
                          EP: {eur(c.unitPriceNet)} • Linie: {eur(c.lineNet)}{" "}
                          {c.priceFound === false ? <span style={{ opacity: 0.9 }}>• Preis fehlt</span> : null}
                          {c.formulaOk === false ? <span style={{ opacity: 0.9 }}>• Formel-Fehler</span> : null}
                        </div>
                      </div>
                      <div style={{ padding: "8px 10px", fontSize: 12, textAlign: "right", fontFamily: "monospace" }}>
                        {String(c.qtyFormula ?? "")}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10, fontWeight: 800 }}>
                  Netto: {eur(totalNet)}
                </div>

                {(missingPrices.length > 0 || formulaErrors.length > 0) && (
                  <div style={{ marginTop: 10, fontSize: 12, opacity: 0.9 }}>
                    {missingPrices.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontWeight: 700 }}>Missing prices</div>
                        <div style={{ fontFamily: "monospace", whiteSpace: "pre-wrap" }}>{pretty(missingPrices)}</div>
                      </div>
                    )}
                    {formulaErrors.length > 0 && (
                      <div>
                        <div style={{ fontWeight: 700 }}>Formula errors</div>
                        <div style={{ fontFamily: "monospace", whiteSpace: "pre-wrap" }}>{pretty(formulaErrors)}</div>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ marginTop: 10 }}>
                  <button onClick={() => setShowCalcDebug((v) => !v)} style={{ padding: "6px 10px", fontSize: 12 }}>
                    {showCalcDebug ? "▼ Debug JSON" : "▶ Debug JSON"}
                  </button>

                  {showCalcDebug && (
                    <pre style={{ marginTop: 8, marginBottom: 0, fontSize: 12, overflow: "auto", maxHeight: 260 }}>
                      {pretty(calcRes)}
                    </pre>
                  )}
                </div>
              </>
            ) : (
              <div style={{ opacity: 0.7, fontSize: 12 }}>Run Calc / Calc+Suggest</div>
            )}
          </div>
        </div>

        <div style={{ marginTop: 12, border: "1px solid #2a2a2a", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Calc+Suggest Result</div>
          <pre style={{ margin: 0, fontSize: 12, overflow: "auto", maxHeight: 360 }}>{pretty(pipeRes)}</pre>
        </div>

        <div style={{ marginTop: 12, border: "1px solid #2a2a2a", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Variants (raw)</div>
          <pre style={{ margin: 0, fontSize: 12, overflow: "auto", maxHeight: 260 }}>
            {pretty({
              count: variants.length,
              first: variants[0],
              last: variants[variants.length - 1],
            })}
          </pre>
        </div>

        <div style={{ marginTop: 12, border: "1px solid #2a2a2a", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Variants Response (meta)</div>
          <pre style={{ margin: 0, fontSize: 12, overflow: "auto", maxHeight: 200 }}>{pretty(variantInfo)}</pre>
        </div>
      </div>
    </div>
  );
}

import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// apps/web/src/pages/kalkulation/Recipes.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { fetchTemplates, fetchVariants, suggestTemplate, calcTemplate, calcSuggestTemplate, } from "../../lib/recipesApi";
import { useProject } from "../../store/useProject";
function pretty(x) {
    try {
        return JSON.stringify(x, null, 2);
    }
    catch {
        return String(x);
    }
}
function eur(n) {
    const num = Number(n || 0);
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(num);
}
function toIsoStartOfDay(dateStr) {
    // dateStr: "YYYY-MM-DD"
    if (!dateStr)
        return undefined;
    const [y, m, d] = dateStr.split("-").map((x) => Number(x));
    if (!y || !m || !d)
        return undefined;
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
function formatPricingDateForUi(v) {
    const s = String(v || "").trim();
    if (!s)
        return "";
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
function safeNum(x, fallback = 0) {
    const n = Number(x);
    return Number.isFinite(n) ? n : fallback;
}
function makeDraftStorageKey(projectCodeOrId, recipeKey) {
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
export default function Recipes() {
    const nav = useNavigate();
    const project = useProject();
    const projectCodeOrId = String(project?.code || project?.projectCode || project?.id || "").trim() || "unknown";
    const [loading, setLoading] = React.useState(false);
    const [err, setErr] = React.useState(null);
    const [templates, setTemplates] = React.useState([]);
    const [selectedKey, setSelectedKey] = React.useState("");
    const [variants, setVariants] = React.useState([]);
    const [variantInfo, setVariantInfo] = React.useState(null);
    // Filters
    const [q, setQ] = React.useState("");
    const [category, setCategory] = React.useState("ALL");
    // Guided inputs
    const [qty, setQty] = React.useState(10);
    // Suggest context (guided)
    const [dnMm, setDnMm] = React.useState(150);
    const [depthM, setDepthM] = React.useState(1.2);
    const [soilClass, setSoilClass] = React.useState("3");
    const [restricted, setRestricted] = React.useState(false);
    const [groundwater, setGroundwater] = React.useState(false);
    const [take, setTake] = React.useState(5);
    // Calc params (guided)
    const [days, setDays] = React.useState(1.2);
    const [count, setCount] = React.useState(0.8);
    // ✅ Pricing date (important for validFrom / validTo)
    const [pricingDate, setPricingDate] = React.useState(() => {
        const today = new Date();
        const y = today.getFullYear();
        const m = String(today.getMonth() + 1).padStart(2, "0");
        const d = String(today.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    });
    // Results
    const [suggestRes, setSuggestRes] = React.useState(null);
    const [calcRes, setCalcRes] = React.useState(null);
    const [pipeRes, setPipeRes] = React.useState(null);
    // UI toggles
    const [showCalcDebug, setShowCalcDebug] = React.useState(false);
    const categories = React.useMemo(() => {
        const set = new Set();
        for (const t of templates)
            if (t.category)
                set.add(String(t.category));
        return ["ALL", ...Array.from(set).sort()];
    }, [templates]);
    const filteredTemplates = React.useMemo(() => {
        const qq = q.trim().toLowerCase();
        return templates.filter((t) => {
            const okCat = category === "ALL" ? true : String(t.category || "") === category;
            if (!okCat)
                return false;
            if (!qq)
                return true;
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
            if (!selectedKey && res.templates?.[0]?.key)
                setSelectedKey(res.templates[0].key);
        }
        catch (e) {
            setErr(e?.message || String(e));
        }
        finally {
            setLoading(false);
        }
    }
    async function loadVariants() {
        if (!selectedKey)
            return;
        setErr(null);
        setLoading(true);
        try {
            const res = await fetchVariants(selectedKey);
            setVariants(res.variants || []);
            setVariantInfo(res);
        }
        catch (e) {
            setErr(e?.message || String(e));
        }
        finally {
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
    function applyBestParams(best) {
        if (!best?.params)
            return;
        if (typeof best.params.days === "number")
            setDays(best.params.days);
        if (typeof best.params.count === "number")
            setCount(best.params.count);
    }
    async function doSuggest() {
        if (!selectedKey)
            return;
        setErr(null);
        setLoading(true);
        try {
            const res = await suggestTemplate(selectedKey, { context: buildContext(), take });
            setSuggestRes(res);
            if (res?.best)
                applyBestParams(res.best);
        }
        catch (e) {
            setErr(e?.message || String(e));
        }
        finally {
            setLoading(false);
        }
    }
    async function doCalc() {
        if (!selectedKey)
            return;
        setErr(null);
        setLoading(true);
        try {
            const isoPricingDate = toIsoStartOfDay(pricingDate);
            const res = await calcTemplate({
                templateKey: selectedKey,
                qty: Number(qty) || 0,
                params: buildParams(),
                pricingDate: isoPricingDate,
            });
            setCalcRes(res);
        }
        catch (e) {
            setErr(e?.message || String(e));
        }
        finally {
            setLoading(false);
        }
    }
    async function doCalcSuggest() {
        if (!selectedKey)
            return;
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
            });
            setPipeRes(res);
            const best = res?.suggest?.best;
            if (best) {
                applyBestParams(best);
                const calcRes2 = await calcTemplate({
                    templateKey: selectedKey,
                    qty: Number(qty) || 0,
                    params: best.params || {},
                    pricingDate: isoPricingDate,
                });
                setCalcRes(calcRes2);
            }
        }
        catch (e) {
            setErr(e?.message || String(e));
        }
        finally {
            setLoading(false);
        }
    }
    /* =========================
       ✅ Restore UI state (Rezepte)
       ========================= */
    React.useEffect(() => {
        try {
            const raw = sessionStorage.getItem(RECIPES_UI_STATE_KEY);
            if (!raw)
                return;
            const st = JSON.parse(raw);
            // restore solo se è lo stesso progetto (evita mix)
            if (st?.projectKey && st.projectKey !== projectCodeOrId)
                return;
            if (typeof st.selectedKey === "string")
                setSelectedKey(st.selectedKey);
            if (typeof st.q === "string")
                setQ(st.q);
            if (typeof st.category === "string")
                setCategory(st.category);
            if (typeof st.qty === "number")
                setQty(st.qty);
            if (typeof st.dnMm === "number")
                setDnMm(st.dnMm);
            if (typeof st.depthM === "number")
                setDepthM(st.depthM);
            if (typeof st.soilClass === "string")
                setSoilClass(st.soilClass);
            if (typeof st.restricted === "boolean")
                setRestricted(st.restricted);
            if (typeof st.groundwater === "boolean")
                setGroundwater(st.groundwater);
            if (typeof st.take === "number")
                setTake(st.take);
            if (typeof st.days === "number")
                setDays(st.days);
            if (typeof st.count === "number")
                setCount(st.count);
            if (typeof st.pricingDate === "string")
                setPricingDate(st.pricingDate);
            if (st.suggestRes != null)
                setSuggestRes(st.suggestRes);
            if (st.calcRes != null)
                setCalcRes(st.calcRes);
            if (st.pipeRes != null)
                setPipeRes(st.pipeRes);
        }
        catch {
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
            const st = {
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
            }
            catch {
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
    const calcComponents = React.useMemo(() => {
        const c = calcRes?.breakdown?.components;
        return Array.isArray(c) ? c : [];
    }, [calcRes]);
    const calcTotals = calcRes?.breakdown?.totals || null;
    const totalNet = Number(calcTotals?.totalNet ?? 0);
    const pricingInfo = calcRes?.pricing || pipeRes?.pricing || null;
    const missingPrices = Array.isArray(calcTotals?.missingPrices) ? calcTotals.missingPrices : [];
    const formulaErrors = Array.isArray(calcTotals?.formulaErrors) ? calcTotals.formulaErrors : [];
    const pricingDateUsed = calcRes?.pricing?.pricingDate ||
        pipeRes?.pricing?.pricingDate ||
        toIsoStartOfDay(pricingDate);
    function buildDraft() {
        if (!selectedKey)
            return null;
        // progetto: preferisci code (FS-key), fallback id
        const projectId = String(project?.id || "").trim() || undefined;
        const projectCode = String(project?.code || project?.projectCode || "").trim() || undefined;
        // prendi componenti come righe “pronte” (se non ci sono, non esportare)
        if (!calcComponents.length)
            return null;
        const rows = calcComponents.map((c) => {
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
        const draft = {
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
        }
        catch {
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
    return (_jsxs("div", { style: { padding: 16, display: "grid", gridTemplateColumns: "380px 1fr", gap: 16 }, children: [_jsxs("div", { style: { border: "1px solid #2a2a2a", borderRadius: 12, padding: 12 }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }, children: [_jsx("div", { style: { fontWeight: 700 }, children: "Kalkulation mit KI \u2013 Rezepte" }), _jsx("button", { onClick: loadTemplates, disabled: loading, style: { padding: "6px 10px" }, children: "Reload" })] }), _jsxs("div", { style: { marginTop: 10, display: "grid", gap: 8 }, children: [_jsx("input", { value: q, onChange: (e) => setQ(e.target.value), placeholder: "Search key/title\u2026", style: { padding: 10, borderRadius: 10, border: "1px solid #333", background: "transparent", color: "inherit" } }), _jsx("select", { value: category, onChange: (e) => setCategory(e.target.value), style: { padding: 10, borderRadius: 10, border: "1px solid #333", background: "transparent", color: "inherit" }, children: categories.map((c) => (_jsx("option", { value: c, style: { background: "#111" }, children: c }, c))) })] }), _jsx("div", { style: { marginTop: 12, maxHeight: "70vh", overflow: "auto" }, children: filteredTemplates.map((t) => (_jsxs("div", { onClick: () => setSelectedKey(t.key), style: {
                                cursor: "pointer",
                                padding: 10,
                                borderRadius: 10,
                                border: t.key === selectedKey ? "1px solid #6b6b6b" : "1px solid #2a2a2a",
                                marginBottom: 8,
                                background: t.key === selectedKey ? "rgba(255,255,255,0.04)" : "transparent",
                            }, children: [_jsx("div", { style: { fontWeight: 700 }, children: t.title }), _jsx("div", { style: { opacity: 0.8, fontSize: 12 }, children: t.key }), _jsxs("div", { style: { display: "flex", gap: 8, marginTop: 6, opacity: 0.85, fontSize: 12 }, children: [_jsx("span", { children: t.category || "-" }), _jsx("span", { children: "\u2022" }), _jsx("span", { children: t.unit || "-" })] })] }, t.key))) })] }), _jsxs("div", { style: { border: "1px solid #2a2a2a", borderRadius: 12, padding: 12 }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontWeight: 800, fontSize: 16 }, children: selectedKey || "—" }), _jsxs("div", { style: { opacity: 0.8, fontSize: 12 }, children: ["Variants: ", variants.length, " ", loading ? "• loading…" : ""] }), pricingInfo?.companyId && (_jsxs("div", { style: { opacity: 0.8, fontSize: 12, marginTop: 4 }, children: ["Pricing: ", _jsx("span", { style: { fontFamily: "monospace" }, children: pricingInfo.companyId }), " ", pricingInfo.mode ? _jsxs("span", { style: { opacity: 0.85 }, children: ["\u2022 ", String(pricingInfo.mode)] }) : null] })), _jsxs("div", { style: { opacity: 0.8, fontSize: 12, marginTop: 4 }, children: ["Pricing Date: ", _jsx("span", { style: { fontFamily: "monospace" }, children: formatPricingDateForUi(pricingDateUsed || "") })] })] }), _jsxs("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }, children: [_jsx("button", { onClick: loadVariants, disabled: loading || !selectedKey, style: { padding: "8px 12px" }, children: "Load Variants" }), _jsx("button", { onClick: doSuggest, disabled: loading || !selectedKey, style: { padding: "8px 12px" }, children: "Suggest" }), _jsx("button", { onClick: doCalc, disabled: loading || !selectedKey, style: { padding: "8px 12px" }, children: "Calc" }), _jsx("button", { onClick: doCalcSuggest, disabled: loading || !selectedKey, style: { padding: "8px 12px" }, children: "Calc+Suggest" }), _jsx("button", { onClick: pushToManuell, disabled: !calcComponents.length, style: { padding: "8px 12px" }, children: "\u2192 Kalkulation Manuell" }), _jsx("button", { onClick: pushToKI, disabled: !calcComponents.length, style: { padding: "8px 12px" }, children: "\u2192 Kalkulation mit KI" })] })] }), err && (_jsxs("div", { style: { marginTop: 10, padding: 10, borderRadius: 10, border: "1px solid #663", background: "rgba(255,200,0,0.08)" }, children: [_jsx("div", { style: { fontWeight: 700 }, children: "Error" }), _jsx("div", { style: { fontFamily: "monospace", whiteSpace: "pre-wrap" }, children: err })] })), _jsxs("div", { style: { marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }, children: [_jsxs("div", { style: { border: "1px solid #2a2a2a", borderRadius: 12, padding: 12 }, children: [_jsx("div", { style: { fontWeight: 700, marginBottom: 8 }, children: "Suggest Context" }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }, children: [_jsxs("label", { style: { display: "grid", gap: 6, fontSize: 12 }, children: ["dn_mm", _jsx("input", { type: "number", value: dnMm, onChange: (e) => setDnMm(Number(e.target.value)), style: { padding: 10, borderRadius: 10, border: "1px solid #333", background: "transparent", color: "inherit" } })] }), _jsxs("label", { style: { display: "grid", gap: 6, fontSize: 12 }, children: ["depth_m", _jsx("input", { type: "number", step: "0.1", value: depthM, onChange: (e) => setDepthM(Number(e.target.value)), style: { padding: 10, borderRadius: 10, border: "1px solid #333", background: "transparent", color: "inherit" } })] }), _jsxs("label", { style: { display: "grid", gap: 6, fontSize: 12 }, children: ["soilClass", _jsx("input", { value: soilClass, onChange: (e) => setSoilClass(e.target.value), style: { padding: 10, borderRadius: 10, border: "1px solid #333", background: "transparent", color: "inherit" } })] }), _jsxs("label", { style: { display: "grid", gap: 6, fontSize: 12 }, children: ["take", _jsx("input", { type: "number", value: take, onChange: (e) => setTake(Number(e.target.value)), style: { padding: 10, borderRadius: 10, border: "1px solid #333", background: "transparent", color: "inherit" } })] })] }), _jsxs("div", { style: { display: "flex", gap: 14, marginTop: 10, alignItems: "center" }, children: [_jsxs("label", { style: { display: "flex", gap: 8, alignItems: "center", fontSize: 12 }, children: [_jsx("input", { type: "checkbox", checked: restricted, onChange: (e) => setRestricted(e.target.checked) }), "restricted"] }), _jsxs("label", { style: { display: "flex", gap: 8, alignItems: "center", fontSize: 12 }, children: [_jsx("input", { type: "checkbox", checked: groundwater, onChange: (e) => setGroundwater(e.target.checked) }), "groundwater"] })] }), _jsx("div", { style: { marginTop: 10, opacity: 0.8, fontSize: 12, fontFamily: "monospace", whiteSpace: "pre-wrap" }, children: pretty(buildContext()) })] }), _jsxs("div", { style: { border: "1px solid #2a2a2a", borderRadius: 12, padding: 12 }, children: [_jsx("div", { style: { fontWeight: 700, marginBottom: 8 }, children: "Calc Inputs" }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }, children: [_jsxs("label", { style: { display: "grid", gap: 6, fontSize: 12 }, children: ["qty", _jsx("input", { type: "number", value: qty, onChange: (e) => setQty(Number(e.target.value)), style: { padding: 10, borderRadius: 10, border: "1px solid #333", background: "transparent", color: "inherit" } })] }), _jsxs("label", { style: { display: "grid", gap: 6, fontSize: 12 }, children: ["pricingDate", _jsx("input", { type: "date", value: pricingDate, onChange: (e) => setPricingDate(e.target.value), style: { padding: 10, borderRadius: 10, border: "1px solid #333", background: "transparent", color: "inherit" } })] }), _jsxs("label", { style: { display: "grid", gap: 6, fontSize: 12 }, children: ["days", _jsx("input", { type: "number", step: "0.1", value: days, onChange: (e) => setDays(Number(e.target.value)), style: { padding: 10, borderRadius: 10, border: "1px solid #333", background: "transparent", color: "inherit" } })] }), _jsxs("label", { style: { display: "grid", gap: 6, fontSize: 12 }, children: ["count", _jsx("input", { type: "number", step: "0.1", value: count, onChange: (e) => setCount(Number(e.target.value)), style: { padding: 10, borderRadius: 10, border: "1px solid #333", background: "transparent", color: "inherit" } })] })] }), _jsx("div", { style: { marginTop: 10, opacity: 0.8, fontSize: 12, fontFamily: "monospace", whiteSpace: "pre-wrap" }, children: pretty({ ...buildParams(), pricingDate: toIsoStartOfDay(pricingDate) }) })] })] }), _jsxs("div", { style: { marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }, children: [_jsxs("div", { style: { border: "1px solid #2a2a2a", borderRadius: 12, padding: 12 }, children: [_jsx("div", { style: { fontWeight: 700, marginBottom: 8 }, children: "Best Variant" }), best ? (_jsx("div", { style: { fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap" }, children: pretty({
                                            key: best.key,
                                            label: best.label,
                                            score: best.score,
                                            virtual: best.virtual,
                                            isDefault: best.isDefault,
                                            params: best.params,
                                            changedKeys: best.changedKeys,
                                        }) })) : (_jsx("div", { style: { opacity: 0.7, fontSize: 12 }, children: "Run Suggest / Calc+Suggest" }))] }), _jsxs("div", { style: { border: "1px solid #2a2a2a", borderRadius: 12, padding: 12 }, children: [_jsx("div", { style: { fontWeight: 700, marginBottom: 8 }, children: "Suggest Result" }), _jsx("pre", { style: { margin: 0, fontSize: 12, overflow: "auto", maxHeight: 260 }, children: pretty(suggestRes) })] }), _jsxs("div", { style: { border: "1px solid #2a2a2a", borderRadius: 12, padding: 12 }, children: [_jsx("div", { style: { fontWeight: 700, marginBottom: 8 }, children: "Calc Result" }), calcComponents.length ? (_jsxs(_Fragment, { children: [_jsxs("div", { style: { border: "1px solid #2a2a2a", borderRadius: 10, overflow: "hidden" }, children: [_jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 110px", background: "rgba(255,255,255,0.03)" }, children: [_jsx("div", { style: { padding: "8px 10px", fontSize: 12, fontWeight: 700 }, children: "Komponente" }), _jsx("div", { style: { padding: "8px 10px", fontSize: 12, fontWeight: 700, textAlign: "right" }, children: "Formel" })] }), calcComponents.map((c, idx) => (_jsxs("div", { style: {
                                                            display: "grid",
                                                            gridTemplateColumns: "1fr 110px",
                                                            borderTop: "1px solid #2a2a2a",
                                                        }, children: [_jsxs("div", { style: { padding: "8px 10px", fontSize: 12 }, children: [_jsx("div", { style: { fontWeight: 700 }, children: c.refKey || c.title || "-" }), _jsxs("div", { style: { opacity: 0.75, marginTop: 2 }, children: ["EP: ", eur(c.unitPriceNet), " \u2022 Linie: ", eur(c.lineNet), " ", c.priceFound === false ? _jsx("span", { style: { opacity: 0.9 }, children: "\u2022 Preis fehlt" }) : null, c.formulaOk === false ? _jsx("span", { style: { opacity: 0.9 }, children: "\u2022 Formel-Fehler" }) : null] })] }), _jsx("div", { style: { padding: "8px 10px", fontSize: 12, textAlign: "right", fontFamily: "monospace" }, children: String(c.qtyFormula ?? "") })] }, `${c.refKey || c.title || idx}`)))] }), _jsxs("div", { style: { display: "flex", justifyContent: "flex-end", marginTop: 10, fontWeight: 800 }, children: ["Netto: ", eur(totalNet)] }), (missingPrices.length > 0 || formulaErrors.length > 0) && (_jsxs("div", { style: { marginTop: 10, fontSize: 12, opacity: 0.9 }, children: [missingPrices.length > 0 && (_jsxs("div", { style: { marginBottom: 6 }, children: [_jsx("div", { style: { fontWeight: 700 }, children: "Missing prices" }), _jsx("div", { style: { fontFamily: "monospace", whiteSpace: "pre-wrap" }, children: pretty(missingPrices) })] })), formulaErrors.length > 0 && (_jsxs("div", { children: [_jsx("div", { style: { fontWeight: 700 }, children: "Formula errors" }), _jsx("div", { style: { fontFamily: "monospace", whiteSpace: "pre-wrap" }, children: pretty(formulaErrors) })] }))] })), _jsxs("div", { style: { marginTop: 10 }, children: [_jsx("button", { onClick: () => setShowCalcDebug((v) => !v), style: { padding: "6px 10px", fontSize: 12 }, children: showCalcDebug ? "▼ Debug JSON" : "▶ Debug JSON" }), showCalcDebug && (_jsx("pre", { style: { marginTop: 8, marginBottom: 0, fontSize: 12, overflow: "auto", maxHeight: 260 }, children: pretty(calcRes) }))] })] })) : (_jsx("div", { style: { opacity: 0.7, fontSize: 12 }, children: "Run Calc / Calc+Suggest" }))] })] }), _jsxs("div", { style: { marginTop: 12, border: "1px solid #2a2a2a", borderRadius: 12, padding: 12 }, children: [_jsx("div", { style: { fontWeight: 700, marginBottom: 8 }, children: "Calc+Suggest Result" }), _jsx("pre", { style: { margin: 0, fontSize: 12, overflow: "auto", maxHeight: 360 }, children: pretty(pipeRes) })] }), _jsxs("div", { style: { marginTop: 12, border: "1px solid #2a2a2a", borderRadius: 12, padding: 12 }, children: [_jsx("div", { style: { fontWeight: 700, marginBottom: 8 }, children: "Variants (raw)" }), _jsx("pre", { style: { margin: 0, fontSize: 12, overflow: "auto", maxHeight: 260 }, children: pretty({
                                    count: variants.length,
                                    first: variants[0],
                                    last: variants[variants.length - 1],
                                }) })] }), _jsxs("div", { style: { marginTop: 12, border: "1px solid #2a2a2a", borderRadius: 12, padding: 12 }, children: [_jsx("div", { style: { fontWeight: 700, marginBottom: 8 }, children: "Variants Response (meta)" }), _jsx("pre", { style: { margin: 0, fontSize: 12, overflow: "auto", maxHeight: 200 }, children: pretty(variantInfo) })] })] })] }));
}

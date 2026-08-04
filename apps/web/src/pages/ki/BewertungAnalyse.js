import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/ki/BewertungAnalyse.tsx
import React from "react";
import * as XLSX from "xlsx";
import { useProject } from "../../store/useProject";
import { apiUrl } from "../../lib/apiBase";
import { saveProjectLvPosition } from "../../api/projectLvCompat";
const card = {
    border: "1px solid #E5E7EB",
    borderRadius: 16,
    padding: 16,
    background: "#FFFFFF",
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)"
};
const inp = {
    border: "1px solid #D1D5DB",
    borderRadius: 10,
    padding: "9px 11px",
    fontSize: 13,
    color: "#0F172A",
    background: "#FFFFFF"
};
const button = {
    border: "1px solid #CBD5E1",
    borderRadius: 10,
    padding: "9px 12px",
    background: "#FFFFFF",
    color: "#0F172A",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer"
};
const tbl = {
    width: "100%",
    borderCollapse: "collapse"
};
const th = {
    textAlign: "left",
    padding: "10px 12px",
    borderBottom: "1px solid #CBD5E1",
    whiteSpace: "nowrap",
    background: "#F8FAFC",
    color: "#334155",
    fontSize: 12,
    fontWeight: 700
};
const td = {
    padding: "9px 12px",
    borderBottom: "1px solid #E5E7EB",
    verticalAlign: "top",
    color: "#0F172A",
    fontSize: 13
};
function num(n) {
    return Number.isFinite(n) ?
        n.toLocaleString("de-DE", { maximumFractionDigits: 2 }) :
        "";
}
function toNumber(v) {
    if (v == null || v === "")
        return undefined;
    const raw = String(v).trim();
    if (!raw)
        return undefined;
    const normalized = raw.
        replace(/\s/g, "").
        replace(/\.(?=\d{3}(?:\D|$))/g, "").
        replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : undefined;
}
function normalizeHeader(h) {
    const s = h.trim().toLowerCase();
    if (/^pos/.test(s) || s === "position" || s === "positionsnummer" || s === "nr") {
        return "posNr";
    }
    if (/kurz|kurztext|bezeichnung|beschreibung|langtext/.test(s)) {
        return "kurztext";
    }
    if (/einheit|me|unit/.test(s)) {
        return "einheit";
    }
    if (/menge|qty|anzahl|mengen?/.test(s)) {
        return "menge";
    }
    if (/^ep$|einheitspreis|preis/.test(s)) {
        return "ep";
    }
    return s;
}
function rowFromObj(o) {
    const m = {};
    for (const [k, v] of Object.entries(o)) {
        m[normalizeHeader(k)] = v;
    }
    const pos = String(m.posNr ?? "").trim();
    if (!pos)
        return null;
    return {
        posNr: pos,
        kurztext: String(m.kurztext ?? "").trim(),
        einheit: String(m.einheit ?? "").trim(),
        menge: toNumber(m.menge),
        ep: toNumber(m.ep)
    };
}
async function readXlsxOrCsv(file) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const firstSheet = wb.SheetNames[0];
    const ws = wb.Sheets[firstSheet];
    const json = XLSX.utils.sheet_to_json(ws, {
        raw: false,
        defval: ""
    });
    const rows = [];
    for (const obj of json) {
        const r = rowFromObj(obj);
        if (r)
            rows.push(r);
    }
    return rows;
}
function textSim(a, b) {
    const aa = String(a || "").toLowerCase().trim();
    const bb = String(b || "").toLowerCase().trim();
    if (!aa && !bb)
        return 1;
    if (!aa || !bb)
        return 0;
    const A = new Set(aa.split(/\W+/).filter(Boolean));
    const B = new Set(bb.split(/\W+/).filter(Boolean));
    if (!A.size && !B.size)
        return 1;
    if (!A.size || !B.size)
        return 0;
    let inter = 0;
    for (const w of A) {
        if (B.has(w))
            inter++;
    }
    return inter / Math.max(A.size, B.size);
}
function compare(lv, angebot) {
    const mapLV = new Map(lv.map((r) => [r.posNr, r]));
    const mapAG = new Map(angebot.map((r) => [r.posNr, r]));
    const allKeys = new Set([...mapLV.keys(), ...mapAG.keys()]);
    const diffs = [];
    for (const key of Array.from(allKeys).sort()) {
        const L = mapLV.get(key) || null;
        const A = mapAG.get(key) || null;
        if (L && !A) {
            diffs.push({
                posNr: key,
                lv: L,
                angebot: null,
                type: "missing_in_offer",
                details: ["Im Angebot fehlt diese Position."]
            });
            continue;
        }
        if (!L && A) {
            diffs.push({
                posNr: key,
                lv: null,
                angebot: A,
                type: "missing_in_lv",
                details: ["Im LV fehlt diese Position."]
            });
            continue;
        }
        const details = [];
        let type = "match";
        if ((L.kurztext || "").trim() !== (A.kurztext || "").trim()) {
            details.push("Kurztext unterschiedlich");
            type = "text_diff";
        }
        if ((L.einheit || "").trim() !== (A.einheit || "").trim()) {
            details.push(`Einheit: LV=${L.einheit || "—"} • Angebot=${A.einheit || "—"}`);
            if (type === "match")
                type = "unit_diff";
        }
        const lvQty = L.menge ?? 0;
        const agQty = A.menge ?? 0;
        const dQty = lvQty - agQty;
        if (Math.abs(dQty) > 1e-6) {
            details.push(`Menge: LV=${num(lvQty)} • Angebot=${num(agQty)} (Δ ${num(-dQty)})`);
            if (type === "match")
                type = "qty_diff";
        }
        const lvEP = L.ep ?? 0;
        const agEP = A.ep ?? 0;
        const dEP = lvEP - agEP;
        if (Math.abs(dEP) > 1e-6) {
            details.push(`EP (netto): LV=${num(lvEP)} • Angebot=${num(agEP)} (Δ ${num(-dEP)})`);
            if (type === "match")
                type = "price_diff";
        }
        diffs.push({
            posNr: key,
            lv: L,
            angebot: A,
            type,
            details
        });
    }
    return diffs;
}
function badge(t) {
    const base = {
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        display: "inline-block"
    };
    const map = {
        match: { background: "#eaf7ef", color: "#0a6b3a" },
        text_diff: { background: "#fff7ed", color: "#9a3412" },
        unit_diff: { background: "#fef9c3", color: "#a16207" },
        qty_diff: { background: "#fef9c3", color: "#a16207" },
        price_diff: { background: "#e0e7ff", color: "#3730a3" },
        missing_in_offer: { background: "#fee2e2", color: "#991b1b" },
        missing_in_lv: { background: "#fae8ff", color: "#6b21a8" }
    };
    const label = {
        match: "ok",
        text_diff: "Text",
        unit_diff: "Einheit",
        qty_diff: "Menge",
        price_diff: "Preis",
        missing_in_offer: "Fehlt im Angebot",
        missing_in_lv: "Fehlt im LV"
    };
    return _jsx("span", { className: rlcClass(null, { ...base, ...(map[t] || {}) }), children: label[t] });
}
function authHeaders(extra) {
    let token = "";
    try {
        token =
            localStorage.getItem("token") ||
                localStorage.getItem("authToken") ||
                localStorage.getItem("accessToken") ||
                localStorage.getItem("rlc_token") ||
                "";
    }
    catch {
        // Browser-Speicher nicht verfügbar
    }
    return {
        ...(extra || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
}
function normalizeWeights(w) {
    const safe = {
        price: clamp01(w.price),
        unit: clamp01(w.unit),
        qty: clamp01(w.qty),
        text: clamp01(w.text)
    };
    const sum = safe.price + safe.unit + safe.qty + safe.text;
    if (sum <= 0) {
        return { price: 0.25, unit: 0.25, qty: 0.25, text: 0.25 };
    }
    return {
        price: safe.price / sum,
        unit: safe.unit / sum,
        qty: safe.qty / sum,
        text: safe.text / sum
    };
}
function clamp01(v) {
    if (!Number.isFinite(v))
        return 0;
    return Math.max(0, Math.min(1, v));
}
export default function BewertungAnalyse({ embedded = false }) {
    const projectCtx = useProject();
    const contextProjectId = String(projectCtx?.projectCode ||
        projectCtx?.currentProject?.code ||
        projectCtx?.projectId ||
        projectCtx?.currentProjectId ||
        projectCtx?.currentProject?.id ||
        "").trim();
    const [projectId, setProjectId] = React.useState(contextProjectId);
    const [lv, setLV] = React.useState([]);
    const [offers, setOffers] = React.useState([]);
    const [weights, setWeights] = React.useState({
        price: 0.6,
        unit: 0.15,
        qty: 0.15,
        text: 0.1
    });
    const [aiSummary, setAiSummary] = React.useState("");
    const [selectedOfferId, setSelectedOfferId] = React.useState(null);
    const [diffs, setDiffs] = React.useState([]);
    const [serverStatus, setServerStatus] = React.useState("");
    React.useEffect(() => {
        if (!projectId.trim() && contextProjectId)
            setProjectId(contextProjectId);
    }, [contextProjectId, projectId]);
    const validOffers = React.useMemo(() => offers.filter(Boolean).filter((o) => !!o?.id), [offers]);
    const normalizedWeights = React.useMemo(() => normalizeWeights(weights), [weights]);
    async function loadLV(files) {
        if (!files || !files[0])
            return;
        const rows = await readXlsxOrCsv(files[0]);
        setLV(rows);
        setDiffs([]);
        setAiSummary("");
    }
    async function loadOffer(i, files) {
        if (!files || !files[0])
            return;
        const rows = await readXlsxOrCsv(files[0]);
        const totals = {
            sumEPxQty: rows.reduce((s, r) => s + (r.menge ?? 0) * (r.ep ?? 0), 0)
        };
        setOffers((prev) => {
            const id = prev[i]?.id || crypto.randomUUID();
            const name = files[0].name;
            const next = [...prev];
            next[i] = { id, name, rows, totals };
            return next;
        });
        setDiffs([]);
        setAiSummary("");
    }
    function calcScores() {
        if (!lv.length || !validOffers.length) {
            alert("LV und mindestens ein Angebot sind erforderlich.");
            return;
        }
        const totals = validOffers.map((o) => o.totals.sumEPxQty || 0);
        const min = Math.min(...totals);
        const max = Math.max(...totals);
        const mapLV = new Map(lv.map((r) => [r.posNr, r]));
        const results = validOffers.
            map((off) => {
            const priceScore = max === min ? 1 : 1 - (off.totals.sumEPxQty - min) / (max - min);
            let unitOK = 0;
            let unitTot = 0;
            let qtyScore = 0;
            let qtyTot = 0;
            let textScoreAcc = 0;
            let textTot = 0;
            for (const r of off.rows) {
                const L = mapLV.get(r.posNr);
                if (!L)
                    continue;
                unitTot++;
                if ((L.einheit || "").trim() === (r.einheit || "").trim())
                    unitOK++;
                qtyTot++;
                const lq = L.menge ?? 0;
                const aq = r.menge ?? 0;
                const q = lq === 0 && aq === 0 ?
                    1 :
                    1 - Math.min(1, Math.abs(lq - aq) / Math.max(1e-9, Math.abs(lq)));
                qtyScore += Math.max(0, q);
                textTot++;
                textScoreAcc += textSim(L.kurztext, r.kurztext);
            }
            const unitScore = unitTot ? unitOK / unitTot : 0.5;
            const qtySc = qtyTot ? qtyScore / qtyTot : 0.5;
            const textSc = textTot ? textScoreAcc / textTot : 0.5;
            const total = normalizedWeights.price * priceScore +
                normalizedWeights.unit * unitScore +
                normalizedWeights.qty * qtySc +
                normalizedWeights.text * textSc;
            return {
                ...off,
                score: Math.round(total * 1000) / 1000
            };
        }).
            sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
        setOffers(results);
    }
    async function runAIReview() {
        if (!validOffers.length)
            return;
        try {
            const body = {
                projectId,
                lv: lv.slice(0, 60),
                offers: validOffers.map((o) => ({
                    id: o.id,
                    name: o.name,
                    total: o.totals.sumEPxQty,
                    score: o.score ?? 0,
                    sample: o.rows.slice(0, 40)
                })),
                weights: normalizedWeights
            };
            const res = await fetch(apiUrl("/api/ki/offer-review"), {
                method: "POST",
                credentials: "include",
                headers: authHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify(body)
            });
            if (!res.ok)
                throw new Error(await res.text());
            const data = await res.json();
            setAiSummary(data.summary || "");
            if (Array.isArray(data.perOffer)) {
                setOffers((prev) => prev.map((o) => {
                    const match = data.perOffer.find((x) => x?.id === o.id || x?.name === o.name);
                    return { ...o, notes: match?.notes || o.notes };
                }));
            }
        }
        catch (e) {
            alert(e?.message || "KI-Review fehlgeschlagen");
        }
    }
    function showDiffs(i) {
        const off = validOffers[i];
        if (!off)
            return;
        setSelectedOfferId(off.id);
        setDiffs(compare(lv, off.rows));
        window.scrollTo({
            top: document.body.scrollHeight,
            behavior: "smooth"
        });
    }
    function gotoNachtrag(prefill) {
        const payload = {
            projectId,
            kurztext: prefill.kurztext ?? "",
            einheit: prefill.einheit ?? "",
            menge: prefill.menge ?? "",
            ep: prefill.ep ?? "",
            posNr: prefill.posNr ?? "",
            grund: "KI: Abweichung in Angebotsanalyse"
        };
        const url = `/kalkulation/nachtraege?projectId=${encodeURIComponent(projectId)}&prefill=${encodeURIComponent(JSON.stringify(payload))}`;
        window.location.href = url;
    }
    async function updateLV(r) {
        if (!r)
            return;
        if (!projectId.trim()) {
            alert("Projekt-ID fehlt.");
            return;
        }
        try {
            await saveProjectLvPosition(projectId.trim(), {
                posNr: r.posNr,
                kurztext: r.kurztext,
                einheit: r.einheit,
                menge: r.menge ?? null,
                preis: r.ep ?? null,
                quelle: "Bewertung/Angebotsanalyse"
            });
            alert("LV-Position hinzugefügt/aktualisiert.");
        }
        catch (e) {
            alert(e?.message || "LV-Update fehlgeschlagen");
        }
    }
    async function saveRankingToServer() {
        if (!projectId.trim()) {
            setServerStatus("Kein Projekt gewählt.");
            return;
        }
        try {
            setServerStatus("Speichere Angebotsranking auf Server …");
            const res = await fetch(apiUrl(`/api/kalkulation/storage/angebotsranking/${encodeURIComponent(projectId.trim())}/save`), {
                method: "POST",
                credentials: "include",
                headers: authHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({
                    data: {
                        projectId: projectId.trim(),
                        lv,
                        offers,
                        weights,
                        aiSummary,
                        selectedOfferId,
                        diffs,
                        savedAt: new Date().toISOString()
                    }
                })
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || json?.ok === false) {
                throw new Error(json?.error || `HTTP ${res.status}`);
            }
            setServerStatus("Angebotsranking auf Server gespeichert.");
        }
        catch (e) {
            setServerStatus(`Server-Speichern fehlgeschlagen: ${e?.message || e}`);
        }
    }
    async function loadRankingFromServer() {
        if (!projectId.trim()) {
            setServerStatus("Kein Projekt gewählt.");
            return;
        }
        try {
            setServerStatus("Lade Angebotsranking vom Server …");
            const res = await fetch(apiUrl(`/api/kalkulation/storage/angebotsranking/${encodeURIComponent(projectId.trim())}`), { credentials: "include", headers: authHeaders() });
            const json = await res.json().catch(() => null);
            if (!res.ok || json?.ok === false) {
                throw new Error(json?.error || `HTTP ${res.status}`);
            }
            const data = json?.data || {};
            setLV(Array.isArray(data.lv) ? data.lv : []);
            setOffers(Array.isArray(data.offers) ? data.offers : []);
            if (data.weights)
                setWeights(data.weights);
            setAiSummary(String(data.aiSummary || ""));
            setSelectedOfferId(data.selectedOfferId || null);
            setDiffs(Array.isArray(data.diffs) ? data.diffs : []);
            setServerStatus(json?.exists ? "Angebotsranking vom Server geladen." : "Kein gespeichertes Ranking gefunden.");
        }
        catch (e) {
            setServerStatus(`Server-Laden fehlgeschlagen: ${e?.message || e}`);
        }
    }
    const selectedOffer = validOffers.find((o) => o.id === selectedOfferId) || null;
    return (_jsxs("div", { className: "rlc-migrated-pages-ki-bewertunganalyse-tsx-956", children: [!embedded ? _jsx("h1", { children: "Bewertung & Angebotsanalyse" }) : null, _jsxs("div", { className: rlcClass(null, card), children: [_jsx("div", { className: "rlc-migrated-pages-ki-bewertunganalyse-tsx-957", children: _jsxs("div", { children: [_jsx("div", { className: "rlc-migrated-pages-ki-bewertunganalyse-tsx-958", children: "Projekt-ID" }), _jsx("input", { className: rlcClass(null, { ...inp, width: "100%" }), value: projectId, onChange: (e) => setProjectId(e.target.value), placeholder: "z. B. BA-2025-834" })] }) }), _jsxs("div", { className: "rlc-migrated-pages-ki-bewertunganalyse-tsx-959", children: [_jsxs("div", { children: [_jsx("div", { className: "rlc-migrated-pages-ki-bewertunganalyse-tsx-960", children: "LV (CSV/XLSX)" }), _jsx("input", { type: "file", accept: ".xlsx,.xls,.csv", onChange: (e) => loadLV(e.target.files) })] }), _jsx("div", {})] }), _jsx("div", { className: "rlc-migrated-pages-ki-bewertunganalyse-tsx-961", children: [0, 1, 2].map((i) => _jsxs("div", { children: [_jsxs("div", { className: "rlc-migrated-pages-ki-bewertunganalyse-tsx-962", children: ["Angebot ", i + 1] }), _jsx("input", { type: "file", accept: ".xlsx,.xls,.csv", onChange: (e) => loadOffer(i, e.target.files) }), offers[i] &&
                                    _jsxs("div", { className: "rlc-migrated-pages-ki-bewertunganalyse-tsx-963", children: [_jsx("div", { children: _jsx("strong", { children: offers[i].name }) }), _jsxs("div", { children: ["Summe (EP\u00D7Menge): ", num(offers[i].totals.sumEPxQty), " \u20AC"] })] })] }, i)) }), _jsxs("div", { className: "rlc-migrated-pages-ki-bewertunganalyse-tsx-964", children: [_jsx(Weight, { label: "Preis", value: weights.price, onChange: (v) => setWeights((p) => ({ ...p, price: v })) }), _jsx(Weight, { label: "Einheit", value: weights.unit, onChange: (v) => setWeights((p) => ({ ...p, unit: v })) }), _jsx(Weight, { label: "Menge", value: weights.qty, onChange: (v) => setWeights((p) => ({ ...p, qty: v })) }), _jsx(Weight, { label: "Text", value: weights.text, onChange: (v) => setWeights((p) => ({ ...p, text: v })) })] }), _jsxs("div", { className: "rlc-migrated-pages-ki-bewertunganalyse-tsx-965", children: ["Normalisierte Gewichte: Preis ", normalizedWeights.price.toFixed(2), " \u00B7 Einheit", " ", normalizedWeights.unit.toFixed(2), " \u00B7 Menge ", normalizedWeights.qty.toFixed(2), " \u00B7 Text", " ", normalizedWeights.text.toFixed(2)] }), _jsxs("div", { className: "rlc-migrated-pages-ki-bewertunganalyse-tsx-966", children: [_jsx("button", { className: rlcClass(null, button), onClick: calcScores, disabled: !lv.length || !validOffers.length, children: "Punkte berechnen & ranken" }), _jsx("button", { className: rlcClass(null, button), onClick: runAIReview, disabled: !validOffers.length, children: "KI-Bewertung erzeugen" }), _jsx("button", { className: rlcClass(null, button), onClick: saveRankingToServer, disabled: !projectId.trim() || !validOffers.length, children: "Server speichern" }), _jsx("button", { className: rlcClass(null, button), onClick: loadRankingFromServer, disabled: !projectId.trim(), children: "Server laden" }), _jsxs("div", { className: "rlc-migrated-pages-ki-bewertunganalyse-tsx-967", children: ["Geladen: LV ", lv.length, " Pos. \u2022 Angebote ", validOffers.length] })] }), serverStatus ? _jsx("div", { className: "rlc-migrated-pages-ki-bewertunganalyse-tsx-968", children: serverStatus }) : null] }), !!validOffers.length &&
                _jsxs("div", { className: rlcClass(null, card), children: [_jsx("h3", { className: "rlc-migrated-pages-ki-bewertunganalyse-tsx-969", children: "Ranking" }), _jsxs("table", { className: rlcClass(null, tbl), children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "#" }), _jsx("th", { className: rlcClass(null, th), children: "Angebot" }), _jsx("th", { className: rlcClass(null, th), children: "Summe (EP\u00D7Menge)" }), _jsx("th", { className: rlcClass(null, th), children: "Score (0\u20131)" }), _jsx("th", { className: rlcClass(null, th), children: "KI-Hinweise" }), _jsx("th", { className: rlcClass(null, th) })] }) }), _jsx("tbody", { children: validOffers.map((o, i) => _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, td), children: i + 1 }), _jsx("td", { className: rlcClass(null, td), children: _jsx("strong", { children: o.name }) }), _jsxs("td", { className: rlcClass(null, td), children: [num(o.totals.sumEPxQty), " \u20AC"] }), _jsx("td", { className: rlcClass(null, td), children: o.score != null ? o.score.toFixed(3) : "—" }), _jsx("td", { className: rlcClass(null, td), children: o.notes ?
                                                    _jsx("div", { className: "rlc-migrated-pages-ki-bewertunganalyse-tsx-970", children: o.notes }) :
                                                    _jsx("span", { className: "rlc-migrated-pages-ki-bewertunganalyse-tsx-971", children: "\u2014" }) }), _jsx("td", { className: rlcClass(null, td), children: _jsx("button", { className: rlcClass(null, button), onClick: () => showDiffs(i), disabled: !lv.length, children: "Abweichungen anzeigen" }) })] }, o.id)) })] })] }), !!diffs.length &&
                _jsxs("div", { className: rlcClass(null, card), children: [_jsxs("h3", { className: "rlc-migrated-pages-ki-bewertunganalyse-tsx-972", children: ["Abweichungen \u2013 ", selectedOffer ? selectedOffer.name : ""] }), _jsxs("table", { className: rlcClass(null, tbl), children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "Pos" }), _jsx("th", { className: rlcClass(null, th), children: "Typ" }), _jsx("th", { className: rlcClass(null, th), children: "LV" }), _jsx("th", { className: rlcClass(null, th), children: "Angebot" }), _jsx("th", { className: rlcClass(null, th), children: "Details" }), _jsx("th", { className: rlcClass(null, th) })] }) }), _jsx("tbody", { children: diffs.map((d, i) => {
                                        const nachtragBase = d.angebot ?? d.lv;
                                        const canCreateNachtrag = (d.type === "missing_in_lv" ||
                                            d.type === "text_diff" ||
                                            d.type === "unit_diff" ||
                                            d.type === "qty_diff" ||
                                            d.type === "price_diff") &&
                                            !!nachtragBase;
                                        const canUpdateLv = d.type !== "missing_in_offer" && d.angebot != null;
                                        return (_jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, { ...td, fontWeight: 600 }), children: d.posNr }), _jsx("td", { className: rlcClass(null, td), children: badge(d.type) }), _jsx("td", { className: rlcClass(null, td), children: d.lv ?
                                                        _jsxs(_Fragment, { children: [_jsx("div", { className: "rlc-migrated-pages-ki-bewertunganalyse-tsx-973", children: d.lv.kurztext }), _jsxs("div", { className: "rlc-migrated-pages-ki-bewertunganalyse-tsx-974", children: [d.lv.einheit, " \u00B7 Menge ", num(d.lv.menge), " \u00B7 EP ", num(d.lv.ep)] })] }) :
                                                        _jsx("span", { className: "rlc-migrated-pages-ki-bewertunganalyse-tsx-975", children: "\u2014" }) }), _jsx("td", { className: rlcClass(null, td), children: d.angebot ?
                                                        _jsxs(_Fragment, { children: [_jsx("div", { className: "rlc-migrated-pages-ki-bewertunganalyse-tsx-976", children: d.angebot.kurztext }), _jsxs("div", { className: "rlc-migrated-pages-ki-bewertunganalyse-tsx-977", children: [d.angebot.einheit, " \u00B7 Menge ", num(d.angebot.menge), " \u00B7 EP ", num(d.angebot.ep)] })] }) :
                                                        _jsx("span", { className: "rlc-migrated-pages-ki-bewertunganalyse-tsx-978", children: "\u2014" }) }), _jsx("td", { className: rlcClass(null, td), children: _jsx("ul", { className: "rlc-migrated-pages-ki-bewertunganalyse-tsx-979", children: d.details.map((x, k) => _jsx("li", { className: "rlc-migrated-pages-ki-bewertunganalyse-tsx-980", children: x }, k)) }) }), _jsx("td", { className: rlcClass(null, td), children: _jsxs("div", { className: "rlc-migrated-pages-ki-bewertunganalyse-tsx-981", children: [canCreateNachtrag && nachtragBase &&
                                                                _jsx("button", { className: rlcClass(null, button), onClick: () => gotoNachtrag(nachtragBase), children: "\u2192 Nachtrag erstellen" }), (() => {
                                                                const angebotRow = d.angebot ?? undefined;
                                                                if (!canUpdateLv || !angebotRow)
                                                                    return null;
                                                                return (_jsx("button", { className: rlcClass(null, button), onClick: () => updateLV(angebotRow), children: "\u2192 LV aktualisieren" }));
                                                            })()] }) })] }, `${d.posNr}-${i}`));
                                    }) })] })] }), aiSummary &&
                _jsxs("div", { className: rlcClass(null, card), children: [_jsx("h3", { className: "rlc-migrated-pages-ki-bewertunganalyse-tsx-982", children: "KI-Zusammenfassung" }), _jsx("div", { className: "rlc-migrated-pages-ki-bewertunganalyse-tsx-983", children: aiSummary })] })] }));
}
function Weight({ label, value, onChange }) {
    return (_jsxs("label", { className: "rlc-migrated-pages-ki-bewertunganalyse-tsx-984", children: [_jsxs("div", { className: "rlc-migrated-pages-ki-bewertunganalyse-tsx-985", children: [label, " \u2013 ", value.toFixed(2)] }), _jsx("input", { type: "range", min: 0, max: 1, step: 0.05, value: value, onChange: (e) => onChange(Number(e.target.value)) })] }));
}

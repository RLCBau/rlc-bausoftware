import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React from "react";
import * as XLSX from "xlsx";
const card = { border: "1px solid var(--line)", borderRadius: 10, padding: 16, background: "#fff" };
const inp = { border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontSize: 14 };
const tbl = { width: "100%", borderCollapse: "collapse" };
const th = { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap", background: "#f7f7f7" };
const td = { padding: "6px 10px", borderBottom: "1px solid #eee", verticalAlign: "top" };
function num(n) { return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : ""; }
function toNumber(v) {
    if (v == null)
        return undefined;
    const s = String(v).replace(/\./g, "").replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
}
function normalizeHeader(h) {
    const s = h.trim().toLowerCase();
    if (/^pos/.test(s) || s === "position" || s === "positionsnummer" || s === "nr")
        return "posNr";
    if (/kurz|kurztext|bezeichnung|beschreibung|langtext/.test(s))
        return "kurztext";
    if (/einheit|me|unit/.test(s))
        return "einheit";
    if (/menge|qty|anzahl|mengen?/.test(s))
        return "menge";
    if (/ep|einheitspreis|preis/.test(s))
        return "ep";
    return s;
}
function rowFromObj(o) {
    const m = {};
    for (const [k, v] of Object.entries(o))
        m[normalizeHeader(k)] = v;
    const pos = String(m.posNr ?? "").trim();
    if (!pos)
        return null;
    return {
        posNr: pos,
        kurztext: String(m.kurztext ?? "").trim(),
        einheit: String(m.einheit ?? "").trim(),
        menge: toNumber(m.menge),
        ep: toNumber(m.ep),
    };
}
async function readXlsxOrCsv(file) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(ws, { raw: false, defval: "" });
    const rows = [];
    for (const obj of json) {
        const r = rowFromObj(obj);
        if (r)
            rows.push(r);
    }
    return rows;
}
// similarità bag-of-words grezza (0..1)
function textSim(a, b) {
    const A = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
    const B = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
    if (!A.size || !B.size)
        return 0;
    let inter = 0;
    for (const w of A)
        if (B.has(w))
            inter++;
    return inter / Math.max(A.size, B.size);
}
function compare(lv, angebot) {
    const mapLV = new Map(lv.map(r => [r.posNr, r]));
    const mapAG = new Map(angebot.map(r => [r.posNr, r]));
    const allKeys = new Set([...mapLV.keys(), ...mapAG.keys()]);
    const diffs = [];
    for (const key of Array.from(allKeys).sort()) {
        const L = mapLV.get(key) || null;
        const A = mapAG.get(key) || null;
        if (L && !A) {
            diffs.push({ posNr: key, lv: L, angebot: null, type: "missing_in_offer", details: ["Im Angebot fehlt diese Position."] });
            continue;
        }
        if (!L && A) {
            diffs.push({ posNr: key, lv: null, angebot: A, type: "missing_in_lv", details: ["Im LV fehlt diese Position."] });
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
        const dQty = (L.menge ?? 0) - (A.menge ?? 0);
        if (Math.abs(dQty) > 1e-6) {
            details.push(`Menge: LV=${num(L.menge)} • Angebot=${num(A.menge)} (Δ ${num(-dQty)})`);
            if (type === "match")
                type = "qty_diff";
        }
        const dEP = (L.ep ?? 0) - (A.ep ?? 0);
        if (Math.abs(dEP) > 1e-6) {
            details.push(`EP (netto): LV=${num(L.ep)} • Angebot=${num(A.ep)} (Δ ${num(-dEP)})`);
            if (type === "match")
                type = "price_diff";
        }
        diffs.push({ posNr: key, lv: L, angebot: A, type, details });
    }
    return diffs;
}
function badge(t) {
    const base = { padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 600, display: "inline-block" };
    const map = {
        match: { background: "#eaf7ef", color: "#0a6b3a" },
        text_diff: { background: "#fff7ed", color: "#9a3412" },
        unit_diff: { background: "#fef9c3", color: "#a16207" },
        qty_diff: { background: "#fef9c3", color: "#a16207" },
        price_diff: { background: "#e0e7ff", color: "#3730a3" },
        missing_in_offer: { background: "#fee2e2", color: "#991b1b" },
        missing_in_lv: { background: "#fae8ff", color: "#6b21a8" },
    };
    const label = {
        match: "ok",
        text_diff: "Text",
        unit_diff: "Einheit",
        qty_diff: "Menge",
        price_diff: "Preis",
        missing_in_offer: "Fehlt im Angebot",
        missing_in_lv: "Fehlt im LV",
    };
    return _jsx("span", { style: { ...base, ...(map[t] || {}) }, children: label[t] });
}
export default function BewertungAnalyse() {
    const [projectId, setProjectId] = React.useState("");
    const [lv, setLV] = React.useState([]);
    const [offers, setOffers] = React.useState([]);
    const [weights, setWeights] = React.useState({ price: 0.6, unit: 0.15, qty: 0.15, text: 0.1 });
    const [aiSummary, setAiSummary] = React.useState("");
    const [selectedOffer, setSelectedOffer] = React.useState(null);
    const [diffs, setDiffs] = React.useState([]);
    async function loadLV(files) {
        if (!files || !files[0])
            return;
        setLV(await readXlsxOrCsv(files[0]));
        setDiffs([]);
    }
    async function loadOffer(i, files) {
        if (!files || !files[0])
            return;
        const rows = await readXlsxOrCsv(files[0]);
        const totals = { sumEPxQty: rows.reduce((s, r) => s + (r.menge ?? 0) * (r.ep ?? 0), 0) };
        setOffers(prev => {
            const id = prev[i]?.id || crypto.randomUUID();
            const name = files[0].name;
            const next = [...prev];
            next[i] = { id, name, rows, totals };
            return next;
        });
        setDiffs([]);
    }
    function calcScores() {
        if (!lv.length || !offers.length) {
            alert("LV e almeno un’offerta necessari.");
            return;
        }
        const totals = offers.map(o => o?.totals.sumEPxQty || 0);
        const min = Math.min(...totals), max = Math.max(...totals);
        const mapLV = new Map(lv.map(r => [r.posNr, r]));
        const results = offers.map(off => {
            const priceScore = max === min ? 1 : 1 - (off.totals.sumEPxQty - min) / (max - min);
            let unitOK = 0, unitTot = 0, qtyScore = 0, qtyTot = 0, textScore = 0, textTot = 0;
            for (const r of off.rows) {
                const L = mapLV.get(r.posNr);
                if (!L)
                    continue;
                unitTot++;
                if ((L.einheit || "").trim() === (r.einheit || "").trim())
                    unitOK++;
                qtyTot++;
                const lq = L.menge ?? 0, aq = r.menge ?? 0;
                const q = lq === 0 && aq === 0 ? 1 : 1 - Math.min(1, Math.abs(lq - aq) / Math.max(1e-9, lq));
                qtyScore += Math.max(0, q);
                textTot++;
                textScore += textSim(L.kurztext, r.kurztext);
            }
            const unitScore = unitTot ? unitOK / unitTot : 0.5;
            const qtySc = qtyTot ? qtyScore / qtyTot : 0.5;
            const textSc = textTot ? textScore / textTot : 0.5;
            const total = weights.price * priceScore + weights.unit * unitScore + weights.qty * qtySc + weights.text * textSc;
            return { ...off, score: Math.round(total * 1000) / 1000 };
        }).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
        setOffers(results);
    }
    async function runAIReview() {
        if (!offers.length)
            return;
        try {
            const body = {
                projectId,
                lv: lv.slice(0, 60),
                offers: offers.map(o => ({ name: o.name, total: o.totals.sumEPxQty, score: o.score ?? 0, sample: o.rows.slice(0, 40) })),
                weights
            };
            const res = await fetch("/api/ki/offer-review", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!res.ok)
                throw new Error(await res.text());
            const data = await res.json();
            setAiSummary(data.summary || "");
            if (data.perOffer)
                setOffers(prev => prev.map((o, i) => ({ ...o, notes: data.perOffer?.[i]?.notes || o.notes })));
        }
        catch (e) {
            alert(e?.message || "KI-Review fehlgeschlagen");
        }
    }
    function showDiffs(i) {
        setSelectedOffer(i);
        const off = offers[i];
        if (!off)
            return;
        setDiffs(compare(lv, off.rows));
        window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    }
    function gotoNachtrag(prefill) {
        const payload = {
            projectId,
            kurztext: prefill.kurztext ?? "",
            einheit: prefill.einheit ?? "",
            menge: prefill.menge ?? "",
            ep: prefill.ep ?? "",
            posNr: prefill.posNr ?? "",
            grund: "KI: Abweichung in Angebotsanalyse",
        };
        const url = `/kalkulation/nachtraege?projectId=${encodeURIComponent(projectId)}&prefill=${encodeURIComponent(JSON.stringify(payload))}`;
        window.location.href = url;
    }
    async function updateLV(r) {
        if (!r)
            return;
        try {
            const res = await fetch("/api/lv/add", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    projectId,
                    kurztext: r.kurztext,
                    einheit: r.einheit,
                    preis: r.ep ?? null,
                    quelle: "Bewertung/Angebotsanalyse",
                }),
            });
            if (!res.ok)
                throw new Error(await res.text());
            alert("LV-Position hinzugefügt/aktualisiert.");
        }
        catch (e) {
            alert(e?.message || "LV-Update fehlgeschlagen");
        }
    }
    return (_jsxs("div", { style: { display: "grid", gap: 16, padding: 16 }, children: [_jsx("h1", { children: "Bewertung & Angebotsanalyse" }), _jsxs("div", { style: card, children: [_jsx("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }, children: _jsxs("div", { children: [_jsx("div", { style: { marginBottom: 6, fontSize: 13, color: "var(--muted)" }, children: "Projekt-ID" }), _jsx("input", { style: { ...inp, width: "100%" }, value: projectId, onChange: e => setProjectId(e.target.value), placeholder: "z. B. BA-2025-834" })] }) }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 12 }, children: [_jsxs("div", { children: [_jsx("div", { style: { marginBottom: 6, fontSize: 13, color: "var(--muted)" }, children: "LV (CSV/XLSX)" }), _jsx("input", { type: "file", accept: ".xlsx,.xls,.csv", onChange: e => loadLV(e.target.files) })] }), _jsx("div", {})] }), _jsx("div", { style: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 12 }, children: [0, 1, 2].map(i => (_jsxs("div", { children: [_jsxs("div", { style: { marginBottom: 6, fontSize: 13, color: "var(--muted)" }, children: ["Angebot ", i + 1] }), _jsx("input", { type: "file", accept: ".xlsx,.xls,.csv", onChange: e => loadOffer(i, e.target.files) }), offers[i] && (_jsxs("div", { style: { marginTop: 6, fontSize: 12 }, children: [_jsx("div", { children: _jsx("strong", { children: offers[i].name }) }), _jsxs("div", { children: ["Summe (EP\u00D7Menge): ", num(offers[i].totals.sumEPxQty), " \u20AC"] })] }))] }, i))) }), _jsxs("div", { style: { borderTop: "1px dashed var(--line)", marginTop: 12, paddingTop: 12, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }, children: [_jsx(Weight, { label: "Preis", value: weights.price, onChange: v => setWeights(p => ({ ...p, price: v })) }), _jsx(Weight, { label: "Einheit", value: weights.unit, onChange: v => setWeights(p => ({ ...p, unit: v })) }), _jsx(Weight, { label: "Menge", value: weights.qty, onChange: v => setWeights(p => ({ ...p, qty: v })) }), _jsx(Weight, { label: "Text", value: weights.text, onChange: v => setWeights(p => ({ ...p, text: v })) })] }), _jsxs("div", { style: { display: "flex", gap: 8, marginTop: 12 }, children: [_jsx("button", { className: "btn", onClick: calcScores, disabled: !lv.length || !offers.length, children: "Punkte berechnen & ranken" }), _jsx("button", { className: "btn", onClick: runAIReview, disabled: !offers.length, children: "KI-Bewertung erzeugen" }), _jsxs("div", { style: { marginLeft: "auto", fontSize: 12, opacity: .75 }, children: ["Geladen: LV ", lv.length, " Pos. \u2022 Angebote ", offers.filter(Boolean).length] })] })] }), !!offers.length && (_jsxs("div", { style: card, children: [_jsx("h3", { style: { marginTop: 0 }, children: "Ranking" }), _jsxs("table", { style: tbl, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "#" }), _jsx("th", { style: th, children: "Angebot" }), _jsx("th", { style: th, children: "Summe (EP\u00D7Menge)" }), _jsx("th", { style: th, children: "Score (0\u20131)" }), _jsx("th", { style: th, children: "KI-Hinweise" }), _jsx("th", { style: th })] }) }), _jsx("tbody", { children: offers.map((o, i) => (_jsxs("tr", { children: [_jsx("td", { style: td, children: i + 1 }), _jsx("td", { style: td, children: _jsx("strong", { children: o.name }) }), _jsxs("td", { style: td, children: [num(o.totals.sumEPxQty), " \u20AC"] }), _jsx("td", { style: td, children: o.score?.toFixed(3) }), _jsx("td", { style: td, children: o.notes ? _jsx("div", { style: { whiteSpace: "pre-wrap" }, children: o.notes }) : _jsx("span", { style: { opacity: .6 }, children: "\u2014" }) }), _jsx("td", { style: td, children: _jsx("button", { className: "btn", onClick: () => showDiffs(i), disabled: !lv.length, children: "Abweichungen anzeigen" }) })] }, o.id))) })] })] })), !!diffs.length && (_jsxs("div", { style: card, children: [_jsxs("h3", { style: { marginTop: 0 }, children: ["Abweichungen \u2013 ", selectedOffer != null ? offers[selectedOffer]?.name : ""] }), _jsxs("table", { style: tbl, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Pos" }), _jsx("th", { style: th, children: "Typ" }), _jsx("th", { style: th, children: "LV" }), _jsx("th", { style: th, children: "Angebot" }), _jsx("th", { style: th, children: "Details" }), _jsx("th", { style: th })] }) }), _jsx("tbody", { children: diffs.map((d, i) => (_jsxs("tr", { children: [_jsx("td", { style: { ...td, fontWeight: 600 }, children: d.posNr }), _jsx("td", { style: td, children: badge(d.type) }), _jsx("td", { style: td, children: d.lv ? (_jsxs(_Fragment, { children: [_jsx("div", { style: { fontWeight: 600 }, children: d.lv.kurztext }), _jsxs("div", { style: { fontSize: 12, opacity: .8 }, children: [d.lv.einheit, " \u00B7 Menge ", num(d.lv.menge), " \u00B7 EP ", num(d.lv.ep)] })] })) : _jsx("span", { style: { opacity: .6 }, children: "\u2014" }) }), _jsx("td", { style: td, children: d.angebot ? (_jsxs(_Fragment, { children: [_jsx("div", { style: { fontWeight: 600 }, children: d.angebot.kurztext }), _jsxs("div", { style: { fontSize: 12, opacity: .8 }, children: [d.angebot.einheit, " \u00B7 Menge ", num(d.angebot.menge), " \u00B7 EP ", num(d.angebot.ep)] })] })) : _jsx("span", { style: { opacity: .6 }, children: "\u2014" }) }), _jsx("td", { style: td, children: _jsx("ul", { style: { margin: 0, paddingLeft: 18 }, children: d.details.map((x, k) => _jsx("li", { style: { fontSize: 13 }, children: x }, k)) }) }), _jsx("td", { style: td, children: _jsxs("div", { style: { display: "grid", gap: 6 }, children: [(d.type === "missing_in_lv" || d.type === "text_diff" || d.type === "unit_diff" || d.type === "qty_diff" || d.type === "price_diff") && (_jsx("button", { className: "btn", onClick: () => gotoNachtrag(d.angebot || d.lv || undefined), children: "\u2192 Nachtrag erstellen" })), (d.type !== "missing_in_offer") && d.angebot && (_jsx("button", { className: "btn", onClick: () => updateLV(d.angebot), children: "\u2192 LV aktualisieren" }))] }) })] }, `${d.posNr}-${i}`))) })] })] })), aiSummary && (_jsxs("div", { style: card, children: [_jsx("h3", { style: { marginTop: 0 }, children: "KI-Zusammenfassung" }), _jsx("div", { style: { whiteSpace: "pre-wrap" }, children: aiSummary })] }))] }));
}
function Weight({ label, value, onChange }) {
    return (_jsxs("label", { style: { display: "grid", gap: 6 }, children: [_jsxs("div", { style: { fontSize: 13, color: "var(--muted)" }, children: [label, " \u2013 ", value.toFixed(2)] }), _jsx("input", { type: "range", min: 0, max: 1, step: 0.05, value: value, onChange: e => onChange(Number(e.target.value)) })] }));
}

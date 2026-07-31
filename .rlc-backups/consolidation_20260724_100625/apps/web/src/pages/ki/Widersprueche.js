import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// apps/web/src/pages/ki/Widersprueche.tsx
import React from "react";
import * as XLSX from "xlsx";
/* ================== UI helpers ================== */
const card = { border: "1px solid var(--line)", borderRadius: 10, padding: 16, background: "#fff" };
const inp = { border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontSize: 14 };
const tbl = { width: "100%", borderCollapse: "collapse" };
const th = { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap", background: "#f7f7f7" };
const td = { padding: "6px 10px", borderBottom: "1px solid #f0f0f0", verticalAlign: "top" };
function num(n) { return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 3 }) : ""; }
function toNumber(v) {
    if (v == null)
        return undefined;
    const s = String(v).replace(/\./g, "").replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
}
async function api(url, init) {
    const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
/* ================== Import helpers ================== */
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
    for (const [k, v] of Object.entries(o)) {
        const key = normalizeHeader(k);
        m[key] = v;
    }
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
/* ================== Diff ================== */
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
            type = type === "match" ? "unit_diff" : type;
        }
        const dQty = (L.menge ?? 0) - (A.menge ?? 0);
        if (Math.abs(dQty) > 1e-6) {
            details.push(`Menge: LV=${num(L.menge)} • Angebot=${num(A.menge)} (Δ ${num(-dQty)})`);
            type = type === "match" ? "qty_diff" : type;
        }
        const dEP = (L.ep ?? 0) - (A.ep ?? 0);
        if (Math.abs(dEP) > 1e-6) {
            details.push(`EP (netto): LV=${num(L.ep)} • Angebot=${num(A.ep)} (Δ ${num(-dEP)})`);
            type = type === "match" ? "price_diff" : type;
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
    const style = { ...base, ...(map[t] || {}) };
    const label = {
        match: "ok",
        text_diff: "Text",
        unit_diff: "Einheit",
        qty_diff: "Menge",
        price_diff: "Preis",
        missing_in_offer: "Fehlt im Angebot",
        missing_in_lv: "Fehlt im LV",
    };
    return _jsx("span", { style: style, children: label[t] });
}
/* ================== Component ================== */
export default function Widersprueche() {
    const [projectId, setProjectId] = React.useState("");
    const [lv, setLV] = React.useState([]);
    const [ag, setAG] = React.useState([]);
    const [diffs, setDiffs] = React.useState([]);
    const [error, setError] = React.useState(null);
    async function onLoadLV(files) {
        if (!files || !files[0])
            return;
        try {
            setLV(await readXlsxOrCsv(files[0]));
            setDiffs([]);
            setError(null);
        }
        catch (e) {
            setError(e?.message || "Fehler beim Import LV.");
        }
    }
    async function onLoadAG(files) {
        if (!files || !files[0])
            return;
        try {
            setAG(await readXlsxOrCsv(files[0]));
            setDiffs([]);
            setError(null);
        }
        catch (e) {
            setError(e?.message || "Fehler beim Import Angebot.");
        }
    }
    function runCompare() {
        if (!lv.length || !ag.length) {
            alert("Bitte beide Dateien (LV & Angebot) laden.");
            return;
        }
        setDiffs(compare(lv, ag));
    }
    function exportCSV() {
        if (!diffs.length) {
            alert("Kein Report vorhanden.");
            return;
        }
        const data = diffs.map(d => ({
            PosNr: d.posNr,
            Typ: d.type,
            LV_Kurztext: d.lv?.kurztext ?? "",
            LV_Einheit: d.lv?.einheit ?? "",
            LV_Menge: d.lv?.menge ?? "",
            LV_EP: d.lv?.ep ?? "",
            Angebot_Kurztext: d.angebot?.kurztext ?? "",
            Angebot_Einheit: d.angebot?.einheit ?? "",
            Angebot_Menge: d.angebot?.menge ?? "",
            Angebot_EP: d.angebot?.ep ?? "",
            Details: d.details.join(" | "),
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Widersprueche");
        XLSX.writeFile(wb, `Widersprueche_${projectId || "ohneProjekt"}.csv`);
    }
    /** Vai a Nachträge con prefill */
    function gotoNachtrag(prefill) {
        if (!projectId) {
            alert("Bitte Projekt-ID eingeben.");
            return;
        }
        const payload = {
            projectId,
            kurztext: prefill.kurztext ?? "",
            einheit: prefill.einheit ?? "",
            menge: prefill.menge ?? "",
            ep: prefill.ep ?? "",
            posNr: prefill.posNr ?? "",
            grund: "KI: Widerspruch/Abweichung erkannt",
        };
        const url = `/kalkulation/nachtraege?projectId=${encodeURIComponent(projectId)}&prefill=${encodeURIComponent(JSON.stringify(payload))}`;
        window.location.href = url;
    }
    /** Aggiorna davvero il LV usando l'endpoint server /api/lv/update */
    async function updateLV(r) {
        if (!r)
            return;
        if (!projectId) {
            alert("Bitte Projekt-ID eingeben.");
            return;
        }
        const payload = {
            projectId,
            posNr: r.posNr,
            kurztext: r.kurztext,
            einheit: r.einheit,
            ep: r.ep,
            quelle: "KI-Vergleich",
        };
        try {
            const res = await api("/api/lv/update", {
                method: "POST",
                body: JSON.stringify(payload),
            });
            alert(`✅ LV aktualisiert (${res.updated ? "vorhandene Position" : "neu hinzugefügt"})`);
        }
        catch (e) {
            alert("❌ Update fehlgeschlagen: " + (e?.message || e));
        }
    }
    return (_jsxs("div", { style: { display: "grid", gap: 16, padding: 16 }, children: [_jsx("h1", { children: "Widerspr\u00FCche im LV/Angebot" }), _jsxs("div", { style: card, children: [_jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }, children: [_jsxs("div", { children: [_jsx("div", { style: { marginBottom: 6, fontSize: 13, color: "var(--muted)" }, children: "Projekt-ID" }), _jsx("input", { style: { ...inp, width: "100%" }, value: projectId, onChange: (e) => setProjectId(e.target.value), placeholder: "z. B. BA-2025-834" })] }), _jsx("div", {}), _jsxs("div", { children: [_jsx("div", { style: { marginBottom: 6, fontSize: 13, color: "var(--muted)" }, children: "LV (CSV/XLSX)" }), _jsx("input", { type: "file", accept: ".xlsx,.xls,.csv", onChange: (e) => onLoadLV(e.target.files) }), _jsxs("div", { style: { fontSize: 12, opacity: .7, marginTop: 6 }, children: ["Colonne consigliate: ", _jsx("code", { children: "PosNr, Kurztext, Einheit, Menge, EP" })] })] }), _jsxs("div", { children: [_jsx("div", { style: { marginBottom: 6, fontSize: 13, color: "var(--muted)" }, children: "Angebot (CSV/XLSX)" }), _jsx("input", { type: "file", accept: ".xlsx,.xls,.csv", onChange: (e) => onLoadAG(e.target.files) })] })] }), _jsxs("div", { style: { display: "flex", gap: 8, marginTop: 12 }, children: [_jsx("button", { className: "btn", onClick: runCompare, disabled: !lv.length || !ag.length, children: "Vergleichen" }), _jsx("button", { className: "btn", onClick: exportCSV, disabled: !diffs.length, children: "Report exportieren (CSV)" }), _jsxs("div", { style: { fontSize: 12, marginLeft: "auto", opacity: .75 }, children: ["Geladen: LV ", lv.length, " Pos. \u2022 Angebot ", ag.length, " Pos."] })] }), error && _jsx("div", { style: { color: "#b91c1c", marginTop: 8 }, children: error })] }), !!diffs.length && (_jsxs("div", { style: card, children: [_jsx("h3", { style: { marginTop: 0 }, children: "Erkannte Widerspr\u00FCche" }), _jsxs("table", { style: tbl, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Pos" }), _jsx("th", { style: th, children: "Typ" }), _jsx("th", { style: th, children: "LV" }), _jsx("th", { style: th, children: "Angebot" }), _jsx("th", { style: th, children: "Details" }), _jsx("th", { style: th })] }) }), _jsx("tbody", { children: diffs.map((d, i) => (_jsxs("tr", { children: [_jsx("td", { style: { ...td, fontWeight: 600 }, children: d.posNr }), _jsx("td", { style: td, children: badge(d.type) }), _jsx("td", { style: td, children: d.lv ? (_jsxs(_Fragment, { children: [_jsx("div", { style: { fontWeight: 600 }, children: d.lv.kurztext }), _jsxs("div", { style: { fontSize: 12, opacity: .8 }, children: [d.lv.einheit, " \u00B7 Menge ", num(d.lv.menge), " \u00B7 EP ", num(d.lv.ep)] })] })) : _jsx("span", { style: { opacity: .6 }, children: "\u2014" }) }), _jsx("td", { style: td, children: d.angebot ? (_jsxs(_Fragment, { children: [_jsx("div", { style: { fontWeight: 600 }, children: d.angebot.kurztext }), _jsxs("div", { style: { fontSize: 12, opacity: .8 }, children: [d.angebot.einheit, " \u00B7 Menge ", num(d.angebot.menge), " \u00B7 EP ", num(d.angebot.ep)] })] })) : _jsx("span", { style: { opacity: .6 }, children: "\u2014" }) }), _jsx("td", { style: td, children: _jsx("ul", { style: { margin: 0, paddingLeft: 18 }, children: d.details.map((x, k) => _jsx("li", { style: { fontSize: 13 }, children: x }, k)) }) }), _jsx("td", { style: td, children: _jsxs("div", { style: { display: "grid", gap: 6 }, children: [(d.type === "missing_in_lv" || d.type === "text_diff" || d.type === "unit_diff" || d.type === "qty_diff" || d.type === "price_diff") && (_jsx("button", { className: "btn", onClick: () => gotoNachtrag(d.angebot || d.lv || undefined), children: "\u2192 Nachtrag erstellen" })), (d.type !== "missing_in_offer") && d.lv && d.angebot && (_jsx("button", { className: "btn", onClick: () => updateLV(d.angebot || undefined), children: "\u2192 LV aktualisieren" }))] }) })] }, `${d.posNr}-${i}`))) })] })] }))] }));
}

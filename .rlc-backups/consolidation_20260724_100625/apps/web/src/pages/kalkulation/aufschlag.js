import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useMemo, useRef, useState } from "react";
/** ===================== Helpers ===================== */
const parseNumber = (v) => {
    if (v === null || v === undefined)
        return 0;
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : 0;
};
const fmt = (n) => {
    return (Math.round(n * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
function applyRound(n, r) {
    if (r === "kein")
        return n;
    if (r === "2")
        return Math.round(n * 100) / 100;
    if (r === "0_1")
        return Math.round(n * 10) / 10;
    if (r === "1")
        return Math.round(n);
    if (r === "0_05")
        return Math.round(n / 0.05) * 0.05;
    return n;
}
/** CSV parser minimale (header liberi) */
function parseCSV(text) {
    const lines = text.replace(/\r/g, "").split("\n").filter(l => l.trim() !== "");
    if (lines.length === 0)
        return [];
    const headers = lines[0].split(";").map(h => h.trim().toLowerCase());
    const idx = (names) => headers.findIndex(h => names.includes(h));
    const iPos = idx(["posnr", "positionsnummer", "pos", "position"]);
    const iKurz = idx(["kurztext", "kurz", "bezeichnung"]);
    const iME = idx(["me", "einheit", "eh", "unit"]);
    const iMenge = idx(["menge", "qty", "m"]);
    const iEP = idx(["ep", "einheitspreis", "preis", "preis_ep", "preis (ep)"]);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(";");
        if (cols.length === 1 && cols[0].trim() === "")
            continue;
        const pos = {
            posnr: String(cols[iPos] ?? "").trim(),
            kurztext: String(cols[iKurz] ?? "").trim(),
            me: String(cols[iME] ?? "").trim(),
            menge: parseNumber(cols[iMenge]),
            ep: parseNumber(cols[iEP]),
        };
        pos.gp = pos.menge * pos.ep;
        rows.push(pos);
    }
    return rows;
}
function toCSV(rows) {
    const head = ["PosNr", "Kurztext", "ME", "Menge", "EP (neu)", "GP (neu)"];
    const body = rows.map(r => [
        r.posnr,
        r.kurztext.replace(/;/g, ","),
        r.me,
        fmt(r.menge),
        fmt(r.ep),
        fmt((r.menge || 0) * (r.ep || 0)),
    ].join(";"));
    return [head.join(";"), ...body].join("\n");
}
/** Applica regole di sconto/markup ai prezzi (immutabile) */
function recalc(original, p) {
    const q = p.filterQuery.trim().toLowerCase();
    return original.map(o => {
        const use = (!p.nurMarkierte || o._checked) &&
            (!p.nurPreisGroesser0 || (o.ep || 0) > 0) &&
            (q === "" || o.posnr.toLowerCase().includes(q) || o.kurztext.toLowerCase().includes(q));
        if (!use) {
            // non cambia
            return { ...o, gp: (o.menge || 0) * (o.ep || 0) };
        }
        let epNeu = o.ep || 0;
        if (p.mode === "aufschlag") {
            epNeu = epNeu * (1 + (p.value / 100));
        }
        else if (p.mode === "rabatt") {
            epNeu = epNeu * (1 - (p.value / 100));
        }
        else if (p.mode === "ziel_ep") {
            epNeu = p.value;
        }
        if (p.minEP && epNeu < p.minEP)
            epNeu = p.minEP;
        epNeu = applyRound(epNeu, p.runden);
        return { ...o, ep: epNeu, gp: (o.menge || 0) * epNeu };
    });
}
/** ===================== Component ===================== */
export default function AufschlagPage() {
    const [rows, setRows] = useState([]);
    const [params, setParams] = useState({
        mode: "aufschlag",
        value: 10,
        nurMarkierte: false,
        runden: "2",
        minEP: undefined,
        nurPreisGroesser0: true,
        filterQuery: "",
    });
    const fileRef = useRef(null);
    const sum = (lst) => lst.reduce((acc, r) => acc + (r.gp || 0), 0);
    const geaendert = useMemo(() => recalc(rows, params), [rows, params]);
    const toggleAll = (checked) => {
        setRows(prev => prev.map(r => ({ ...r, _checked: checked })));
    };
    return (_jsxs("div", { style: { padding: 24, display: "flex", flexDirection: "column", gap: 12 }, children: [_jsx("div", { style: { fontSize: 20, fontWeight: 700, color: "#111827" }, children: "Preisaufschlag / Rabattfunktion" }), _jsxs("div", { style: toolbar, children: [_jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }, children: [_jsx("input", { placeholder: "Suche\u2026 (PosNr, Kurztext)", value: params.filterQuery, onChange: (e) => setParams({ ...params, filterQuery: e.target.value }), style: searchInput }), _jsxs("label", { style: btnSecondary, children: ["CSV-Import", _jsx("input", { ref: fileRef, type: "file", accept: ".csv,text/csv", style: { display: "none" }, onChange: (e) => {
                                            const f = e.target.files?.[0];
                                            if (!f)
                                                return;
                                            const r = new FileReader();
                                            r.onload = () => {
                                                const text = String(r.result || "");
                                                const parsed = parseCSV(text);
                                                setRows(parsed);
                                            };
                                            r.readAsText(f, "utf-8");
                                        } })] }), _jsx("button", { style: btnSecondary, onClick: () => {
                                    const blob = new Blob([toCSV(geaendert)], { type: "text/csv;charset=utf-8" });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement("a");
                                    a.href = url;
                                    a.download = "LV_mit_Aufschlag.csv";
                                    a.click();
                                    URL.revokeObjectURL(url);
                                }, disabled: rows.length === 0, children: "CSV-Export" })] }), _jsxs("div", { style: { fontSize: 12, color: "#6b7280" }, children: ["Positionen: ", rows.length, " \u2022 Summe alt: ", fmt(sum(rows)), " \u20AC \u2022 Summe neu: ", fmt(sum(geaendert)), " \u20AC"] })] }), _jsx("div", { style: card, children: _jsxs("div", { style: { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }, children: [_jsx("div", { children: _jsxs("select", { value: params.mode, onChange: (e) => setParams({ ...params, mode: e.target.value }), style: select, children: [_jsx("option", { value: "aufschlag", children: "Aufschlag (%)" }), _jsx("option", { value: "rabatt", children: "Rabatt (%)" }), _jsx("option", { value: "ziel_ep", children: "Ziel-EP (fix)" })] }) }), _jsxs("div", { children: [_jsx("input", { type: "number", step: "0.01", value: params.value, onChange: (e) => setParams({ ...params, value: Number(e.target.value) }), style: numInput }), " ", params.mode === "ziel_ep" ? "€" : "%"] }), _jsxs("div", { children: ["Runden:\u00A0", _jsxs("select", { value: params.runden, onChange: (e) => setParams({ ...params, runden: e.target.value }), style: select, children: [_jsx("option", { value: "2", children: "2 Nachkommastellen" }), _jsx("option", { value: "0_05", children: "auf 0,05" }), _jsx("option", { value: "0_1", children: "auf 0,1" }), _jsx("option", { value: "1", children: "auf 1" }), _jsx("option", { value: "kein", children: "keine Rundung" })] })] }), _jsxs("div", { children: ["Min-EP:\u00A0", _jsx("input", { type: "number", step: "0.01", placeholder: "optional", value: params.minEP ?? "", onChange: (e) => setParams({ ...params, minEP: e.target.value === "" ? undefined : Number(e.target.value) }), style: { ...numInput, width: 110 } }), " ", "\u20AC"] }), _jsxs("label", { style: chk, children: [_jsx("input", { type: "checkbox", checked: params.nurMarkierte, onChange: (e) => setParams({ ...params, nurMarkierte: e.target.checked }) }), "nur markierte Positionen"] }), _jsxs("label", { style: chk, children: [_jsx("input", { type: "checkbox", checked: params.nurPreisGroesser0, onChange: (e) => setParams({ ...params, nurPreisGroesser0: e.target.checked }) }), "nur EP > 0"] }), _jsxs("div", { style: { marginLeft: "auto", display: "flex", gap: 8 }, children: [_jsx("button", { style: btnSecondary, onClick: () => toggleAll(true), disabled: rows.length === 0, children: "Alle markieren" }), _jsx("button", { style: btnSecondary, onClick: () => toggleAll(false), disabled: rows.length === 0, children: "Markierung l\u00F6schen" })] })] }) }), _jsx("div", { style: { border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }, children: _jsx("div", { style: { overflow: "auto", maxHeight: "65vh" }, children: _jsxs("table", { style: { borderCollapse: "separate", borderSpacing: 0, width: "100%" }, children: [_jsx("thead", { style: { position: "sticky", top: 0, background: "#f8fafc", borderBottom: "1px solid #e5e7eb" }, children: _jsxs("tr", { children: [_jsx("th", { style: th(48) }), _jsx("th", { style: th(120), children: "PosNr" }), _jsx("th", { style: th(360), children: "Kurztext" }), _jsx("th", { style: th(60), children: "ME" }), _jsx("th", { style: th(80), children: "Menge" }), _jsx("th", { style: th(100), children: "EP alt" }), _jsx("th", { style: th(100), children: "EP neu" }), _jsx("th", { style: th(110), children: "GP neu" })] }) }), _jsxs("tbody", { children: [geaendert.map((r, i) => (_jsxs("tr", { style: { background: i % 2 ? "#fcfcfc" : "white" }, children: [_jsx("td", { style: td(48), children: _jsx("input", { type: "checkbox", checked: !!rows[i]._checked, onChange: (e) => setRows(prev => {
                                                        const c = [...prev];
                                                        c[i] = { ...c[i], _checked: e.target.checked };
                                                        return c;
                                                    }) }) }), _jsx("td", { style: td(120), children: r.posnr }), _jsx("td", { style: td(360), title: r.kurztext, children: r.kurztext }), _jsx("td", { style: td(60), children: r.me }), _jsx("td", { style: td(80), children: fmt(r.menge) }), _jsx("td", { style: td(100), children: fmt((rows[i].ep || 0)) }), _jsx("td", { style: { ...td(100), background: (rows[i].ep !== r.ep) ? "#ecfdf5" : undefined }, children: fmt(r.ep) }), _jsx("td", { style: td(110), children: fmt((r.menge || 0) * (r.ep || 0)) })] }, i))), rows.length === 0 && (_jsx("tr", { children: _jsxs("td", { colSpan: 8, style: { padding: 16, color: "#6b7280" }, children: ["Noch keine Daten. CSV mit Spalten z. B. ", _jsx("b", { children: "PosNr;Kurztext;ME;Menge;EP" }), " importieren."] }) }))] })] }) }) })] }));
}
/** ===================== Styles ===================== */
const toolbar = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    border: "1px solid #e5e7eb",
    background: "#f8fafc",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
};
const card = {
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: 12,
    background: "white",
};
const btnSecondary = {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    background: "white",
    color: "#111827",
    cursor: "pointer",
    fontWeight: 600,
};
const searchInput = {
    width: 260,
    height: 36,
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    outline: "none",
    padding: "0 10px",
    fontSize: 14,
};
const select = {
    height: 36,
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    padding: "0 10px",
};
const numInput = {
    width: 120,
    height: 36,
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    padding: "0 10px",
};
const chk = { display: "flex", alignItems: "center", gap: 6, userSelect: "none" };
function th(w) {
    return {
        position: "sticky",
        top: 0,
        background: "#f8fafc",
        textAlign: "left",
        padding: "10px 8px",
        fontSize: 12,
        borderBottom: "1px solid #e5e7eb",
        minWidth: w,
        maxWidth: w,
        zIndex: 1,
    };
}
function td(w) {
    return {
        padding: "8px",
        fontSize: 12,
        borderBottom: "1px solid #f1f5f9",
        minWidth: w,
        maxWidth: w,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
    };
}

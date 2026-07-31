import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useMemo, useState } from "react";
import { evaluateExpression } from "../../lib/formulas";
const shell = { maxWidth: 1260, margin: "0 auto", padding: "12px 16px 40px", fontFamily: "Inter, system-ui, Arial, Helvetica, sans-serif", color: "#0f172a" };
const toolbar = { display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" };
const textInput = { width: 220, border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 8px" };
const table = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const thtd = { border: "1px solid #e2e8f0", padding: "6px 8px", verticalAlign: "middle" };
const head = { ...thtd, background: "#f8fafc", fontWeight: 600, textAlign: "left", position: "sticky", top: 0, zIndex: 1 };
const fmt = (n) => new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
// Demo: attribuiamo un "Kreis" leggendo un tag in kurztext: "[AK:Kreis-1]" ecc.
const DEMO_POS = [
    { id: "1", posNr: "100.001", kurztext: "[AK:K1] Graben ausheben", einheit: "m³", ep: 16, variablen: { L: 12, B: 0.7, H: 1.2 }, formel: "=L*B*H", menge: 0, betrag: 0 },
    { id: "2", posNr: "100.002", kurztext: "[AK:K1] Rohre verlegen", einheit: "m", ep: 24.5, variablen: { L: 12 }, formel: "=L", menge: 0, betrag: 0 },
    { id: "3", posNr: "200.100", kurztext: "[AK:K2] Asphaltdeckschicht", einheit: "m²", ep: 39.9, variablen: { L: 22, B: 3 }, formel: "=L*B", menge: 0, betrag: 0 },
];
export default function Abrechnungskreise() {
    const [filter, setFilter] = useState("");
    const grouped = useMemo(() => {
        const map = new Map();
        for (const p of DEMO_POS) {
            const m = p.kurztext.match(/\[AK:(.+?)\]/);
            const key = m?.[1] ?? "Unzugeordnet";
            if (!map.has(key))
                map.set(key, []);
            // calcola
            const menge = evaluateExpression(p.formel, p.variablen);
            const betrag = menge * p.ep;
            map.get(key).push({ ...p, menge, betrag });
        }
        // filtro
        const arr = [...map.entries()].filter(e => e[0].toLowerCase().includes(filter.trim().toLowerCase()));
        return arr.map(([kreis, pos]) => ({
            kreis,
            pos,
            sumMenge: pos.reduce((a, b) => a + (b.menge || 0), 0),
            sumBetrag: pos.reduce((a, b) => a + (b.betrag || 0), 0),
        }));
    }, [filter]);
    const total = useMemo(() => grouped.reduce((a, b) => a + b.sumBetrag, 0), [grouped]);
    return (_jsxs("div", { style: shell, children: [_jsx("h2", { style: { margin: "4px 0 12px", fontSize: 20, fontWeight: 700 }, children: "Abrechnungskreise" }), _jsx("div", { style: toolbar, children: _jsx("input", { placeholder: "Filter Kreis\u2026", style: textInput, value: filter, onChange: (e) => setFilter(e.target.value) }) }), grouped.map(g => (_jsxs("div", { style: { border: "1px solid #e2e8f0", borderRadius: 8, marginBottom: 14 }, children: [_jsx("div", { style: { padding: "8px 10px", background: "#f8fafc", fontWeight: 700 }, children: g.kreis }), _jsx("div", { style: { overflow: "auto" }, children: _jsxs("table", { style: table, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: head, children: "Pos-Nr" }), _jsx("th", { style: head, children: "Kurztext" }), _jsx("th", { style: head, children: "ME" }), _jsx("th", { style: head, children: "EP" }), _jsx("th", { style: head, children: "Formel" }), _jsx("th", { style: head, children: "Menge" }), _jsx("th", { style: head, children: "Betrag" })] }) }), _jsxs("tbody", { children: [g.pos.map(p => (_jsxs("tr", { children: [_jsx("td", { style: thtd, children: p.posNr }), _jsx("td", { style: thtd, children: p.kurztext }), _jsx("td", { style: thtd, children: p.einheit }), _jsx("td", { style: thtd, children: fmt(p.ep) }), _jsx("td", { style: thtd, children: p.formel }), _jsx("td", { style: thtd, children: fmt(p.menge) }), _jsx("td", { style: thtd, children: fmt(p.betrag) })] }, p.id))), _jsxs("tr", { children: [_jsx("td", { colSpan: 5, style: { ...thtd, textAlign: "right" }, children: _jsx("b", { children: "Summe Kreis" }) }), _jsx("td", { style: thtd, children: _jsx("b", { children: fmt(g.sumMenge) }) }), _jsx("td", { style: thtd, children: _jsx("b", { children: fmt(g.sumBetrag) }) })] })] })] }) })] }, g.kreis))), _jsxs("div", { style: { textAlign: "right", fontWeight: 700 }, children: ["Gesamtsumme: ", fmt(total), " \u20AC"] })] }));
}

import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useMemo, useState } from "react";
import { evaluateExpression } from "../../lib/formulas";
const shell = {
    maxWidth: 1260, margin: "0 auto", padding: "12px 16px 40px",
    fontFamily: "Inter, system-ui, Arial, Helvetica, sans-serif", color: "#0f172a",
};
const layout = { display: "grid", gridTemplateColumns: "320px 1fr", gap: 12 };
const panel = { border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" };
const left = { ...panel, padding: 10 };
const right = { ...panel, padding: 10 };
const listItem = { padding: "8px 10px", borderRadius: 6, cursor: "pointer" };
const selected = { background: "#f1f5f9", fontWeight: 600 };
const table = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const thtd = { border: "1px solid #e2e8f0", padding: "6px 8px", verticalAlign: "middle" };
const head = { ...thtd, background: "#f8fafc", fontWeight: 600, textAlign: "left", position: "sticky", top: 0, zIndex: 1 };
const numberInput = { width: "80px", border: "1px solid #cbd5e1", borderRadius: 6, padding: "4px 6px", textAlign: "right" };
const mkPos = (posNr, kurztext, einheit, ep, vars, formel) => ({
    id: Math.random().toString(36).slice(2, 9), posNr, kurztext, einheit, ep, variablen: vars, formel, menge: 0, betrag: 0
});
const DEMO_RAEUME = [
    { id: "R-001", name: "01.01 Flur", gebaeude: "Haus A", geschoss: "EG", flaeche: 28.3, umfang: 21.2,
        pos: [mkPos("010.001", "Fliesen 30x30", "m²", 41.2, { L: 5.2, B: 5.44 }, "=L*B"), mkPos("010.002", "Sockelleiste", "m", 9.8, { L: 21.2 }, "=L")] },
    { id: "R-002", name: "01.02 Technik", gebaeude: "Haus A", geschoss: "EG", flaeche: 12.1, umfang: 14.3,
        pos: [mkPos("020.001", "Estrich", "m²", 22.7, { L: 4.4, B: 2.75 }, "=L*B"), mkPos("020.002", "Bodenbeschichtung", "m²", 11.5, { L: 4.4, B: 2.75 }, "=L*B")] },
];
const fmt = (n) => new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
export default function Raumbuch() {
    const [rooms, setRooms] = useState(DEMO_RAEUME);
    const [activeId, setActiveId] = useState(rooms[0].id);
    const room = useMemo(() => rooms.find(r => r.id === activeId), [rooms, activeId]);
    const updateVar = (posId, key, value) => {
        setRooms(prev => prev.map(r => r.id !== activeId ? r : ({
            ...r,
            pos: r.pos.map(p => p.id !== posId ? p : ({ ...p, variablen: { ...p.variablen, [key]: parseFloat(value.replace(",", ".")) || 0 } }))
        })));
    };
    const calc = useMemo(() => {
        const p = room.pos.map(z => {
            const menge = evaluateExpression(z.formel, z.variablen);
            const betrag = menge * (isFinite(z.ep) ? z.ep : 0);
            return { ...z, menge, betrag };
        });
        return { pos: p, sum: p.reduce((a, b) => a + b.betrag, 0) };
    }, [room]);
    return (_jsxs("div", { style: shell, children: [_jsx("h2", { style: { margin: "4px 0 12px", fontSize: 20, fontWeight: 700 }, children: "Raumbuch / Raumaufma\u00DFe" }), _jsxs("div", { style: layout, children: [_jsxs("div", { style: left, children: [_jsx("div", { style: { fontSize: 12, color: "#334155", marginBottom: 8 }, children: "R\u00E4ume" }), rooms.map(r => (_jsxs("div", { style: { ...listItem, ...(r.id === activeId ? selected : {}) }, onClick: () => setActiveId(r.id), children: [_jsx("div", { style: { fontWeight: 600 }, children: r.name }), _jsxs("div", { style: { fontSize: 12, color: "#64748b" }, children: [r.gebaeude, " \u00B7 ", r.geschoss, " \u00B7 ", fmt(r.flaeche), " m\u00B2"] })] }, r.id)))] }), _jsxs("div", { style: right, children: [_jsxs("div", { style: { marginBottom: 8, color: "#334155" }, children: [_jsx("b", { children: room.name }), " \u00B7 ", room.gebaeude, " / ", room.geschoss, " \u2013 Fl\u00E4che ", fmt(room.flaeche), " m\u00B2, Umfang ", fmt(room.umfang), " m"] }), _jsx("div", { style: { overflow: "auto", border: "1px solid #e2e8f0", borderRadius: 8 }, children: _jsxs("table", { style: table, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: head, children: "Pos-Nr" }), _jsx("th", { style: head, children: "Kurztext" }), _jsx("th", { style: head, children: "ME" }), _jsx("th", { style: head, children: "EP" }), _jsx("th", { style: head, children: "L" }), _jsx("th", { style: head, children: "B" }), _jsx("th", { style: head, children: "H" }), _jsx("th", { style: head, children: "Formel" }), _jsx("th", { style: head, children: "Menge" }), _jsx("th", { style: head, children: "Betrag" })] }) }), _jsxs("tbody", { children: [calc.pos.map(p => (_jsxs("tr", { children: [_jsx("td", { style: thtd, children: p.posNr }), _jsx("td", { style: thtd, children: p.kurztext }), _jsx("td", { style: thtd, children: p.einheit }), _jsx("td", { style: thtd, children: fmt(p.ep) }), _jsx("td", { style: thtd, children: _jsx("input", { style: numberInput, value: p.variablen.L ?? "", onChange: (e) => updateVar(p.id, "L", e.target.value) }) }), _jsx("td", { style: thtd, children: _jsx("input", { style: numberInput, value: p.variablen.B ?? "", onChange: (e) => updateVar(p.id, "B", e.target.value) }) }), _jsx("td", { style: thtd, children: _jsx("input", { style: numberInput, value: p.variablen.H ?? "", onChange: (e) => updateVar(p.id, "H", e.target.value) }) }), _jsx("td", { style: thtd, children: p.formel }), _jsx("td", { style: thtd, children: fmt(p.menge) }), _jsx("td", { style: thtd, children: fmt(p.betrag) })] }, p.id))), _jsxs("tr", { children: [_jsx("td", { colSpan: 9, style: { ...thtd, textAlign: "right" }, children: _jsx("b", { children: "Zwischensumme" }) }), _jsx("td", { style: thtd, children: _jsx("b", { children: fmt(calc.sum) }) })] })] })] }) })] })] })] }));
}

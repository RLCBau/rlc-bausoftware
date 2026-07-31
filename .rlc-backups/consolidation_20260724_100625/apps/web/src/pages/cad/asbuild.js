import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useMemo } from "react";
import { loadDoc } from "../../lib/cad/store";
const shell = { maxWidth: 900, margin: "0 auto", padding: "12px 16px 40px", fontFamily: "Inter, system-ui, Arial", color: "#0f172a" };
const table = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const thtd = { border: "1px solid #e2e8f0", padding: "6px 8px", verticalAlign: "middle" };
const head = { ...thtd, background: "#f8fafc", fontWeight: 600, textAlign: "left" };
export default function AsBuilt() {
    const doc = loadDoc();
    const res = useMemo(() => {
        const soll = doc.entities.filter(e => doc.layers.find(l => l.id === e.layerId)?.name.toLowerCase() === "0");
        const ist = doc.entities.filter(e => doc.layers.find(l => l.id === e.layerId)?.name.toLowerCase() === "bestand");
        const len = (e) => {
            if (e.type === "line")
                return Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y);
            let s = 0;
            for (let i = 0; i < e.points.length - 1; i++)
                s += Math.hypot(e.points[i + 1].x - e.points[i].x, e.points[i + 1].y - e.points[i].y);
            return s;
        };
        const sumSoll = soll.reduce((a, e) => a + (e.type === "point" ? 0 : len(e)), 0);
        const sumIst = ist.reduce((a, e) => a + (e.type === "point" ? 0 : len(e)), 0);
        return { sumSoll, sumIst, delta: sumIst - sumSoll };
    }, [doc]);
    const fmt = (n) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(n || 0);
    return (_jsxs("div", { style: shell, children: [_jsx("h2", { style: { margin: "4px 0 12px", fontSize: 20, fontWeight: 700 }, children: "As-Built \u2013 Soll/Ist Vergleich" }), _jsxs("table", { style: table, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: head, children: "Kennzahl" }), _jsx("th", { style: head, children: "Wert (m)" })] }) }), _jsxs("tbody", { children: [_jsxs("tr", { children: [_jsx("td", { style: thtd, children: "Soll (Layer \u201E0\u201C)" }), _jsx("td", { style: thtd, children: fmt(res.sumSoll) })] }), _jsxs("tr", { children: [_jsx("td", { style: thtd, children: "Ist (Layer \u201EBestand\u201C)" }), _jsx("td", { style: thtd, children: fmt(res.sumIst) })] }), _jsxs("tr", { children: [_jsx("td", { style: { ...thtd, fontWeight: 700 }, children: "\u0394 Ist-Soll" }), _jsx("td", { style: { ...thtd, fontWeight: 700, color: res.delta >= 0 ? "#065f46" : "#b91c1c" }, children: fmt(res.delta) })] })] })] }), _jsx("p", { style: { fontSize: 12, color: "#64748b", marginTop: 8 }, children: "Hinweis: Detaillierte Geometrie-Differenzen (Offset/Stations) folgen." })] }));
}

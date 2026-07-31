import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useMemo, useState } from "react";
const shell = { maxWidth: 1260, margin: "0 auto", padding: "12px 16px 40px", fontFamily: "Inter, system-ui, Arial", color: "#0f172a" };
const toolbar = { display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" };
const btn = { padding: "6px 10px", border: "1px solid #cbd5e1", background: "#fff", borderRadius: 6, fontSize: 13, cursor: "pointer" };
const table = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const thtd = { border: "1px solid #e2e8f0", padding: "6px 8px", verticalAlign: "middle" };
const head = { ...thtd, background: "#f8fafc", fontWeight: 600, textAlign: "left" };
function load(proj, key) {
    try {
        const raw = localStorage.getItem(`VERGL:${proj}:${key}`);
        if (!raw)
            return [];
        return JSON.parse(raw);
    }
    catch {
        return [];
    }
}
export default function Versionsvergleich() {
    const [projekt, setProjekt] = useState("PROJ-ANG-001");
    const [A, setA] = useState(load(projekt, "A"));
    const [B, setB] = useState(load(projekt, "B"));
    const diff = useMemo(() => {
        const mapA = new Map(A.map(p => [p.position, p]));
        const mapB = new Map(B.map(p => [p.position, p]));
        const keys = Array.from(new Set([...mapA.keys(), ...mapB.keys()])).sort();
        return keys.map(k => {
            const a = mapA.get(k);
            const b = mapB.get(k);
            return {
                position: k,
                kurztext: (a?.kurztext || b?.kurztext || ""),
                einheit: a?.einheit || b?.einheit || "",
                betragA: a?.betrag || 0,
                betragB: b?.betrag || 0,
                delta: (b?.betrag || 0) - (a?.betrag || 0),
            };
        });
    }, [A, B]);
    const sumA = A.reduce((s, p) => s + p.betrag, 0);
    const sumB = B.reduce((s, p) => s + p.betrag, 0);
    const fmt = (n) => new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
    const importCsv = (which, f) => {
        const rd = new FileReader();
        rd.onload = () => {
            const text = String(rd.result || "");
            const lines = text.split(/\r?\n/).filter(Boolean);
            // Position;Kurztext;ME;Menge;EP;Betrag
            const rows = lines.slice(1).map(l => l.split(";").map(s => s.replace(/^"|"$/g, "")));
            const arr = rows.map(c => ({ position: c[0], kurztext: c[1], einheit: c[2], menge: Number(c[3] || 0), ep: Number(c[4] || 0), betrag: Number(c[5] || 0) }));
            localStorage.setItem(`VERGL:${projekt}:${which}`, JSON.stringify(arr));
            which === "A" ? setA(arr) : setB(arr);
        };
        rd.readAsText(f, "utf-8");
    };
    return (_jsxs("div", { style: shell, children: [_jsx("h2", { style: { margin: "4px 0 12px", fontSize: 20, fontWeight: 700 }, children: "Versionsvergleich" }), _jsxs("div", { style: toolbar, children: [_jsx("input", { value: projekt, onChange: e => setProjekt(e.target.value), style: { border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 8px", width: 220 } }), _jsxs("label", { style: btn, children: ["Import A (CSV)", _jsx("input", { type: "file", accept: ".csv,text/csv", onChange: e => { const f = e.target.files?.[0]; if (f)
                                    importCsv("A", f); e.currentTarget.value = ""; }, style: { display: "none" } })] }), _jsxs("label", { style: btn, children: ["Import B (CSV)", _jsx("input", { type: "file", accept: ".csv,text/csv", onChange: e => { const f = e.target.files?.[0]; if (f)
                                    importCsv("B", f); e.currentTarget.value = ""; }, style: { display: "none" } })] })] }), _jsx("div", { style: { overflow: "auto", border: "1px solid #e2e8f0", borderRadius: 8 }, children: _jsxs("table", { style: table, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: head, children: "Pos" }), _jsx("th", { style: head, children: "Kurztext" }), _jsx("th", { style: head, children: "ME" }), _jsx("th", { style: head, children: "Betrag A" }), _jsx("th", { style: head, children: "Betrag B" }), _jsx("th", { style: head, children: "Delta" })] }) }), _jsxs("tbody", { children: [diff.map((d, i) => (_jsxs("tr", { children: [_jsx("td", { style: thtd, children: d.position }), _jsx("td", { style: thtd, children: d.kurztext }), _jsx("td", { style: thtd, children: d.einheit }), _jsx("td", { style: thtd, children: fmt(d.betragA) }), _jsx("td", { style: thtd, children: fmt(d.betragB) }), _jsx("td", { style: { ...thtd, color: d.delta >= 0 ? "#065f46" : "#b91c1c" }, children: fmt(d.delta) })] }, i))), _jsxs("tr", { children: [_jsx("td", { colSpan: 3, style: { ...thtd, textAlign: "right" }, children: _jsx("b", { children: "Summe" }) }), _jsx("td", { style: thtd, children: _jsx("b", { children: fmt(sumA) }) }), _jsx("td", { style: thtd, children: _jsx("b", { children: fmt(sumB) }) }), _jsx("td", { style: { ...thtd, color: (sumB - sumA) >= 0 ? "#065f46" : "#b91c1c" }, children: _jsx("b", { children: fmt(sumB - sumA) }) })] })] })] }) })] }));
}

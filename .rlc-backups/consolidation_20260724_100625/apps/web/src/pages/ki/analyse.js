import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState } from "react";
const shell = { maxWidth: 800, margin: "0 auto", padding: "12px 16px", fontFamily: "Inter,system-ui,Arial" };
const btn = { padding: "6px 10px", border: "1px solid #cbd5e1", background: "#fff", borderRadius: 6, fontSize: 13, cursor: "pointer" };
const table = { width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 12 };
const thtd = { border: "1px solid #e2e8f0", padding: "6px 8px" };
const head = { ...thtd, background: "#f8fafc", fontWeight: 600 };
export default function Analyse() {
    const [res, setRes] = useState([]);
    const run = () => {
        setRes([{ pos: "01.02", kosten: 4500, risk: "mittel" }, { pos: "02.05", kosten: 8200, risk: "hoch" }]);
    };
    return (_jsxs("div", { style: shell, children: [_jsx("h2", { children: "LV-Analyse" }), _jsx("button", { style: btn, onClick: run, children: "Analyse starten" }), _jsxs("table", { style: table, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: head, children: "Pos" }), _jsx("th", { style: head, children: "Kosten" }), _jsx("th", { style: head, children: "Risiko" })] }) }), _jsx("tbody", { children: res.map(r => _jsxs("tr", { children: [_jsx("td", { style: thtd, children: r.pos }), _jsxs("td", { style: thtd, children: [r.kosten, " \u20AC"] }), _jsx("td", { style: thtd, children: r.risk })] }, r.pos)) })] })] }));
}

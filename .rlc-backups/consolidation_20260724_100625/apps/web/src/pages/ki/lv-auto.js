import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState } from "react";
const shell = { maxWidth: 1000, margin: "0 auto", padding: "12px 16px", fontFamily: "Inter,system-ui,Arial" };
const input = { width: "100%", border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 8px", margin: "6px 0" };
const btn = { padding: "6px 10px", border: "1px solid #cbd5e1", background: "#fff", borderRadius: 6, fontSize: 13, cursor: "pointer" };
const table = { width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 12 };
const thtd = { border: "1px solid #e2e8f0", padding: "6px 8px" };
const head = { ...thtd, background: "#f8fafc", fontWeight: 600 };
export default function LVAuto() {
    const [desc, setDesc] = useState("");
    const [rows, setRows] = useState([]);
    const generate = () => {
        if (!desc.trim())
            return;
        const fake = [{ pos: "01.01.001", kurz: "Erdarbeiten", lang: "Aushub 30 cm, Verbau, Entsorgung", einheit: "m³", menge: 120, preis: 35 }];
        setRows(fake);
    };
    return (_jsxs("div", { style: shell, children: [_jsx("h2", { children: "Automatische LV-Erstellung" }), _jsx("textarea", { style: { ...input, height: 100 }, value: desc, onChange: e => setDesc(e.target.value), placeholder: "Baubeschreibung eingeben\u2026" }), _jsx("button", { style: btn, onClick: generate, children: "LV generieren" }), _jsxs("table", { style: table, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: head, children: "Pos" }), _jsx("th", { style: head, children: "Kurztext" }), _jsx("th", { style: head, children: "Langtext" }), _jsx("th", { style: head, children: "Einheit" }), _jsx("th", { style: head, children: "Menge" }), _jsx("th", { style: head, children: "Preis" })] }) }), _jsx("tbody", { children: rows.map(r => _jsxs("tr", { children: [_jsx("td", { style: thtd, children: r.pos }), _jsx("td", { style: thtd, children: r.kurz }), _jsx("td", { style: thtd, children: r.lang }), _jsx("td", { style: thtd, children: r.einheit }), _jsx("td", { style: thtd, children: r.menge }), _jsxs("td", { style: thtd, children: [r.preis, " \u20AC"] })] }, r.pos)) })] })] }));
}

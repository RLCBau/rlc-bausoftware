import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useEffect, useState } from "react";
const shell = { maxWidth: 900, margin: "0 auto", padding: "12px 16px 40px",
    fontFamily: "Inter, system-ui, Arial, Helvetica, sans-serif", color: "#0f172a" };
const table = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const thtd = { border: "1px solid #e2e8f0", padding: "6px 8px", verticalAlign: "middle" };
const head = { ...thtd, background: "#f8fafc", fontWeight: 600, textAlign: "left" };
const textInput = { width: "100%", border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 8px" };
const btn = { padding: "6px 10px", border: "1px solid #cbd5e1", background: "#fff", borderRadius: 6, fontSize: 13, cursor: "pointer" };
const KEY = "rlc.mengenermittlung.stammdaten";
export default function Stammdaten() {
    const [regeln, setRegeln] = useState([]);
    useEffect(() => {
        try {
            const raw = localStorage.getItem(KEY);
            if (!raw)
                return;
            setRegeln(JSON.parse(raw));
        }
        catch { }
    }, []);
    useEffect(() => {
        try {
            localStorage.setItem(KEY, JSON.stringify(regeln));
        }
        catch { }
    }, [regeln]);
    const add = () => setRegeln(p => [...p, { id: Math.random().toString(36).slice(2, 9), einheit: "m", standardFormel: "=N", beschreibung: "" }]);
    const del = (id) => setRegeln(p => p.filter(x => x.id !== id));
    const upd = (id, patch) => setRegeln(p => p.map(x => x.id === id ? { ...x, ...patch } : x));
    return (_jsxs("div", { style: shell, children: [_jsx("h2", { style: { margin: "4px 0 12px", fontSize: 20, fontWeight: 700 }, children: "Stammdaten \u2013 Standardformeln" }), _jsx("div", { style: { marginBottom: 10 }, children: _jsx("button", { style: btn, onClick: add, children: "+ Regel" }) }), _jsx("div", { style: { overflow: "auto", border: "1px solid #e2e8f0", borderRadius: 8 }, children: _jsxs("table", { style: table, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: head, children: "Einheit" }), _jsx("th", { style: head, children: "Standard-Formel" }), _jsx("th", { style: head, children: "Beschreibung" }), _jsx("th", { style: head, children: "Aktion" })] }) }), _jsx("tbody", { children: regeln.map(r => (_jsxs("tr", { children: [_jsx("td", { style: thtd, children: _jsx("input", { style: textInput, value: r.einheit, onChange: (e) => upd(r.id, { einheit: e.target.value }) }) }), _jsx("td", { style: thtd, children: _jsx("input", { style: textInput, value: r.standardFormel, onChange: (e) => upd(r.id, { standardFormel: e.target.value }) }) }), _jsx("td", { style: thtd, children: _jsx("input", { style: textInput, value: r.beschreibung || "", onChange: (e) => upd(r.id, { beschreibung: e.target.value }) }) }), _jsx("td", { style: thtd, children: _jsx("button", { style: { ...btn, color: "#b91c1c" }, onClick: () => del(r.id), children: "L\u00F6schen" }) })] }, r.id))) })] }) }), _jsxs("p", { style: { fontSize: 12, color: "#64748b", marginTop: 8 }, children: ["Diese Regeln k\u00F6nnen vom Editor genutzt werden, um bei neuen Positionen je nach Einheit eine Start-Formel vorzuschlagen (z. B. ", _jsx("code", { children: "m\u00B2 \u2192 =L*B" }), ", ", _jsx("code", { children: "m\u00B3 \u2192 =L*B*H" }), ")."] })] }));
}

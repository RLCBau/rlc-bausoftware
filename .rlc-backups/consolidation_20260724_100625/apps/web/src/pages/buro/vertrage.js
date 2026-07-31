import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState } from "react";
import { BuroAPI } from "../../lib/buro/store";
const shell = { maxWidth: 1000, margin: "0 auto", padding: "12px 16px", fontFamily: "Inter,system-ui,Arial" };
const table = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const thtd = { border: "1px solid #e2e8f0", padding: "6px 8px" };
const head = { ...thtd, background: "#f8fafc", fontWeight: 600 };
const input = { width: "100%", border: "1px solid #cbd5e1", borderRadius: 6, padding: "4px 6px" };
const btn = { padding: "6px 10px", border: "1px solid #cbd5e1", background: "#fff", borderRadius: 6, fontSize: 13, cursor: "pointer" };
export default function Vertrage() {
    const [rows, setRows] = useState(BuroAPI.contracts.all());
    const add = () => { const n = { id: BuroAPI.contracts.newid(), partner: "Neuer Partner", datum: new Date().toISOString().slice(0, 10), wert: 0, projektId: "" }; const l = [...rows, n]; setRows(l); BuroAPI.contracts.save(l); };
    const upd = (id, p) => { const l = rows.map(r => r.id === id ? { ...r, ...p } : r); setRows(l); BuroAPI.contracts.save(l); };
    const del = (id) => { const l = rows.filter(r => r.id !== id); setRows(l); BuroAPI.contracts.save(l); };
    return (_jsxs("div", { style: shell, children: [_jsx("h2", { children: "Vertragsverwaltung" }), _jsx("button", { style: btn, onClick: add, children: "+ Vertrag" }), _jsxs("table", { style: table, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: head, children: "Partner" }), _jsx("th", { style: head, children: "Datum" }), _jsx("th", { style: head, children: "Wert (\u20AC)" }), _jsx("th", { style: head, children: "Projekt" }), _jsx("th", { style: head, children: "Aktion" })] }) }), _jsx("tbody", { children: rows.map(r => _jsxs("tr", { children: [_jsx("td", { style: thtd, children: _jsx("input", { style: input, value: r.partner, onChange: e => upd(r.id, { partner: e.target.value }) }) }), _jsx("td", { style: thtd, children: _jsx("input", { style: input, type: "date", value: r.datum, onChange: e => upd(r.id, { datum: e.target.value }) }) }), _jsx("td", { style: thtd, children: _jsx("input", { style: input, type: "number", value: r.wert, onChange: e => upd(r.id, { wert: Number(e.target.value) }) }) }), _jsx("td", { style: thtd, children: _jsx("input", { style: input, value: r.projektId, onChange: e => upd(r.id, { projektId: e.target.value }) }) }), _jsx("td", { style: thtd, children: _jsx("button", { style: { ...btn, color: "#b91c1c" }, onClick: () => del(r.id), children: "L\u00F6schen" }) })] }, r.id)) })] })] }));
}

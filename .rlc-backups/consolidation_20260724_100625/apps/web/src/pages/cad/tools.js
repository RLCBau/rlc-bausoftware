import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState } from "react";
import { CadAPI, loadDoc, saveDoc } from "../../lib/cad/store";
const shell = { maxWidth: 900, margin: "0 auto", padding: "12px 16px 40px", fontFamily: "Inter, system-ui, Arial", color: "#0f172a" };
const table = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const thtd = { border: "1px solid #e2e8f0", padding: "6px 8px", verticalAlign: "middle" };
const head = { ...thtd, background: "#f8fafc", fontWeight: 600, textAlign: "left" };
const input = { width: "100%", border: "1px solid #cbd5e1", borderRadius: 6, padding: "4px 6px" };
const btn = { padding: "6px 10px", border: "1px solid #cbd5e1", background: "#fff", borderRadius: 6, fontSize: 13, cursor: "pointer" };
export default function CADTools() {
    const [doc, setDoc] = useState(loadDoc());
    const add = () => { const d = { ...doc }; CadAPI.addLayer(d); setDoc(d); saveDoc(d); };
    const del = (id) => { const d = { ...doc }; CadAPI.removeLayer(d, id); setDoc(d); saveDoc(d); };
    const upd = (id, p) => {
        const d = { ...doc, layers: doc.layers.map(l => l.id === id ? { ...l, ...p } : l) };
        setDoc(d);
        saveDoc(d);
    };
    return (_jsxs("div", { style: shell, children: [_jsx("h2", { style: { margin: "4px 0 12px", fontSize: 20, fontWeight: 700 }, children: "Layer & Eigenschaften" }), _jsx("div", { style: { marginBottom: 10 }, children: _jsx("button", { style: btn, onClick: add, children: "+ Layer" }) }), _jsx("div", { style: { overflow: "auto", border: "1px solid #e2e8f0", borderRadius: 8 }, children: _jsxs("table", { style: table, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: head, children: "Name" }), _jsx("th", { style: head, children: "Farbe" }), _jsx("th", { style: head, children: "Sichtbar" }), _jsx("th", { style: head, children: "Gesperrt" }), _jsx("th", { style: head, children: "Aktion" })] }) }), _jsx("tbody", { children: doc.layers.map(l => (_jsxs("tr", { children: [_jsx("td", { style: thtd, children: _jsx("input", { style: input, value: l.name, onChange: e => upd(l.id, { name: e.target.value }) }) }), _jsx("td", { style: thtd, children: _jsx("input", { style: input, type: "color", value: l.color, onChange: e => upd(l.id, { color: e.target.value }) }) }), _jsx("td", { style: thtd, children: _jsx("input", { type: "checkbox", checked: l.visible, onChange: e => upd(l.id, { visible: e.target.checked }) }) }), _jsx("td", { style: thtd, children: _jsx("input", { type: "checkbox", checked: l.locked, onChange: e => upd(l.id, { locked: e.target.checked }) }) }), _jsx("td", { style: thtd, children: _jsx("button", { style: { ...btn, color: "#b91c1c" }, onClick: () => del(l.id), children: "L\u00F6schen" }) })] }, l.id))) })] }) }), _jsx("p", { style: { fontSize: 12, color: "#64748b", marginTop: 8 }, children: "Der aktive Layer im Zeichner ist der erste sichtbare & nicht gesperrte." })] }));
}

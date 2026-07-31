import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadAufmass } from "../../lib/storage";
const shell = {
    maxWidth: 1260, margin: "0 auto", padding: "12px 16px 40px",
    fontFamily: "Inter, system-ui, Arial, Helvetica, sans-serif", color: "#0f172a",
};
const toolbar = { display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" };
const btn = { padding: "6px 10px", border: "1px solid #cbd5e1", background: "#fff", borderRadius: 6, fontSize: 13, cursor: "pointer" };
const textInput = { width: 220, border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 8px" };
const table = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const thtd = { border: "1px solid #e2e8f0", padding: "6px 8px", verticalAlign: "middle" };
const head = { ...thtd, background: "#f8fafc", fontWeight: 600, textAlign: "left", position: "sticky", top: 0, zIndex: 1 };
const DEMO = [
    { id: "A-1001", bezeichnung: "TW-BA-III – Trinkwasserleitung BA III", bauleiter: "M. König", ort: "D-81234", status: "laufend", projektId: "PROJ-001" },
    { id: "A-1002", bezeichnung: "Straßenausbau Musterstraße", bauleiter: "S. Kramer", ort: "D-73321", status: "offen", projektId: "PROJ-002" },
    { id: "A-1003", bezeichnung: "Gehweg Sanierung Süd", bauleiter: "A. Roth", ort: "D-70180", status: "abgeschlossen", projektId: "PROJ-003" },
];
export default function Auftragsliste() {
    const nav = useNavigate();
    const [q, setQ] = useState("");
    const [items, setItems] = useState(DEMO);
    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s)
            return items;
        return items.filter((x) => x.id.toLowerCase().includes(s) ||
            x.bezeichnung.toLowerCase().includes(s) ||
            x.bauleiter.toLowerCase().includes(s) ||
            x.ort.toLowerCase().includes(s) ||
            x.projektId.toLowerCase().includes(s));
    }, [items, q]);
    useEffect(() => {
        // Segnale: evidenziamo quali progetti hanno già Aufmaß salvato
        setItems((prev) => prev.map((a) => {
            const doc = loadAufmass(a.projektId);
            return { ...a, bezeichnung: doc ? `${a.bezeichnung} (Aufmaß: ${doc.zeilen.length} Pos.)` : a.bezeichnung };
        }));
    }, []);
    return (_jsxs("div", { style: shell, children: [_jsx("h2", { style: { margin: "4px 0 12px", fontSize: 20, fontWeight: 700 }, children: "Auftragsliste" }), _jsxs("div", { style: toolbar, children: [_jsx("input", { placeholder: "Suche (Auftrag / Ort / ProjektID \u2026)", style: textInput, value: q, onChange: (e) => setQ(e.target.value) }), _jsx("button", { style: btn, onClick: () => setQ(""), children: "Zur\u00FCcksetzen" })] }), _jsx("div", { style: { overflow: "auto", border: "1px solid #e2e8f0", borderRadius: 8 }, children: _jsxs("table", { style: table, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: head, children: "Auftrag" }), _jsx("th", { style: head, children: "Bezeichnung" }), _jsx("th", { style: head, children: "Bauleiter" }), _jsx("th", { style: head, children: "Ort" }), _jsx("th", { style: head, children: "Status" }), _jsx("th", { style: head, children: "Projekt-ID" }), _jsx("th", { style: head, children: "Aktion" })] }) }), _jsx("tbody", { children: filtered.map(a => (_jsxs("tr", { children: [_jsx("td", { style: thtd, children: a.id }), _jsx("td", { style: thtd, children: a.bezeichnung }), _jsx("td", { style: thtd, children: a.bauleiter }), _jsx("td", { style: thtd, children: a.ort }), _jsx("td", { style: thtd, children: a.status }), _jsx("td", { style: thtd, children: a.projektId }), _jsx("td", { style: thtd, children: _jsx("button", { style: btn, onClick: () => nav(`/mengenermittlung/aufmaseditor?projekt=${encodeURIComponent(a.projektId)}`), children: "Im Aufma\u00DFeditor \u00F6ffnen" }) })] }, a.id))) })] }) })] }));
}

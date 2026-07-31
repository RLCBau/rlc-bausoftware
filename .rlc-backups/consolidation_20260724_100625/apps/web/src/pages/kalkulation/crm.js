import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState } from "react";
/** ===== COMPONENT ===== */
export default function CRMAngebotsverfolgungPage() {
    const [offers, setOffers] = useState([]);
    const [filter, setFilter] = useState("");
    const [sortBy, setSortBy] = useState("datum");
    const filtered = offers
        .filter(o => o.projekt.toLowerCase().includes(filter.toLowerCase()) ||
        o.kunde.toLowerCase().includes(filter.toLowerCase()))
        .sort((a, b) => sortBy === "betrag"
        ? b.betrag - a.betrag
        : (a[sortBy] > b[sortBy] ? -1 : 1));
    const addOffer = (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const item = {
            id: Date.now(),
            projekt: String(fd.get("projekt") || ""),
            kunde: String(fd.get("kunde") || ""),
            betrag: Number(fd.get("betrag") || 0),
            datum: new Date().toISOString().slice(0, 10),
            status: "Offen",
            notiz: String(fd.get("notiz") || ""),
        };
        setOffers(prev => [item, ...prev]);
        e.currentTarget.reset();
    };
    const changeStatus = (id, status) => {
        setOffers(prev => prev.map(o => (o.id === id ? { ...o, status } : o)));
    };
    return (_jsxs("div", { style: { padding: 24 }, children: [_jsx("h2", { style: { marginBottom: 16 }, children: "CRM-Schnittstelle / Angebotsverfolgung" }), _jsx("form", { onSubmit: addOffer, style: card, children: _jsxs("div", { style: { display: "flex", gap: 12, flexWrap: "wrap" }, children: [_jsx("input", { name: "projekt", required: true, placeholder: "Projektname", style: input }), _jsx("input", { name: "kunde", required: true, placeholder: "Kunde / Auftraggeber", style: input }), _jsx("input", { name: "betrag", type: "number", step: "0.01", required: true, placeholder: "Betrag (\u20AC)", style: input }), _jsx("input", { name: "notiz", placeholder: "Notiz (optional)", style: { ...input, width: 260 } }), _jsx("button", { type: "submit", style: btnPrimary, children: "Angebot hinzuf\u00FCgen" })] }) }), _jsxs("div", { style: toolbar, children: [_jsx("input", { placeholder: "Suche nach Projekt oder Kunde\u2026", value: filter, onChange: e => setFilter(e.target.value), style: searchInput }), _jsxs("select", { value: sortBy, onChange: e => setSortBy(e.target.value), style: select, children: [_jsx("option", { value: "datum", children: "Datum" }), _jsx("option", { value: "betrag", children: "Betrag" }), _jsx("option", { value: "projekt", children: "Projekt" })] })] }), _jsx("div", { style: { border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }, children: _jsxs("table", { style: { borderCollapse: "collapse", width: "100%" }, children: [_jsx("thead", { style: { background: "#f8fafc" }, children: _jsxs("tr", { children: [_jsx("th", { style: th(140), children: "Projekt" }), _jsx("th", { style: th(180), children: "Kunde" }), _jsx("th", { style: th(90), children: "Betrag (\u20AC)" }), _jsx("th", { style: th(100), children: "Datum" }), _jsx("th", { style: th(160), children: "Status" }), _jsx("th", { style: th(240), children: "Notiz" })] }) }), _jsxs("tbody", { children: [filtered.map(o => (_jsxs("tr", { children: [_jsx("td", { style: td, children: o.projekt }), _jsx("td", { style: td, children: o.kunde }), _jsx("td", { style: tdRight, children: o.betrag.toLocaleString(undefined, { minimumFractionDigits: 2 }) }), _jsx("td", { style: td, children: o.datum }), _jsx("td", { style: td, children: _jsxs("select", { value: o.status, onChange: e => changeStatus(o.id, e.target.value), style: select, children: [_jsx("option", { children: "Offen" }), _jsx("option", { children: "Abgegeben" }), _jsx("option", { children: "Nachverhandlung" }), _jsx("option", { children: "Zuschlag" }), _jsx("option", { children: "Abgelehnt" })] }) }), _jsx("td", { style: td, children: o.notiz })] }, o.id))), filtered.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 6, style: { padding: 12, color: "#6b7280" }, children: "Noch keine Angebote erfasst." }) }))] })] }) })] }));
}
/** ===== STYLES ===== */
const card = { border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, marginBottom: 16, background: "white" };
const toolbar = { display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", marginBottom: 10 };
const input = { padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 8, minWidth: 160 };
const select = { padding: "6px 8px", border: "1px solid #e5e7eb", borderRadius: 8, background: "white" };
const btnPrimary = { padding: "8px 14px", borderRadius: 8, border: "1px solid #2563eb", background: "#2563eb", color: "white", fontWeight: 600, cursor: "pointer" };
const searchInput = { width: 260, height: 36, borderRadius: 8, border: "1px solid #e5e7eb", padding: "0 10px" };
const th = (w) => ({ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e5e7eb", minWidth: w });
const td = { padding: "8px", borderBottom: "1px solid #f1f5f9", fontSize: 13 };
const tdRight = { ...td, textAlign: "right" };

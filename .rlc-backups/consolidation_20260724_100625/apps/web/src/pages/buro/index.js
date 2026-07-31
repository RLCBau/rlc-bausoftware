import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { NavLink } from "react-router-dom";
export default function BuroLayout({ children }) {
    const link = (to, label) => (_jsx(NavLink, { to: to, className: ({ isActive }) => "navitem" + (isActive ? " active" : ""), style: { display: "block", padding: "8px 10px", borderRadius: 6, textDecoration: "none" }, children: label }));
    return (_jsxs("div", { style: { display: "grid", gridTemplateColumns: "240px 1fr", gap: 14 }, children: [_jsxs("aside", { className: "card", style: { padding: 10 }, children: [_jsx("div", { style: { fontWeight: 700, marginBottom: 8 }, children: "B\u00FCro / Verwaltung" }), link("/buro/projekte", "Projektverwaltung"), link("/buro/dokumente", "Dokumentenverwaltung"), link("/buro/vertraege", "Vertragsverwaltung"), link("/buro/tasks", "Kommunikation / Aufgaben")] }), _jsx("main", { className: "card", style: { padding: 0 }, children: children })] }));
}

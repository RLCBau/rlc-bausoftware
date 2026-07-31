import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
const items = [
    { to: "/ki", label: "Übersicht", end: true },
    { to: "/ki/auto-lv", label: "Automatische Erstellung LV" },
    { to: "/ki/vorschlaege", label: "KI-Vorschläge aus LV-Datenbank" },
    { to: "/ki/fotoerkennung", label: "Fotoerkennung (Leistung/Material/Mengen)" },
    { to: "/ki/sprachsteuerung", label: "Sprachsteuerung (Regieberichte diktieren)" },
    { to: "/ki/widersprueche", label: "Widersprüche im LV/Angebot" },
    { to: "/ki/bewertung-analyse", label: "Bewertung & Angebotsanalyse" },
    { to: "/ki/auto-abrechnung", label: "Automatische Abrechnung" },
    { to: "/ki/regie-auto", label: "Regieberichte automatisch generieren" },
    { to: "/ki/optimierung", label: "Optimierung Bauzeiten & Ressourcen" },
    { to: "/ki/maengel", label: "Mängelmanagement KI-gestützt" },
];
export default function KILayout({ showNav = false }) {
    const { pathname } = useLocation();
    // Modalità SENZA sidebar KI → rimane solo la sidebar di progetto a sinistra
    if (!showNav) {
        return (_jsx("div", { style: { padding: 20, overflow: "auto", height: "100%" }, children: _jsx(Outlet, {}) }));
    }
    // Modalità CON sidebar KI (riattivabile passando showNav={true})
    return (_jsxs("div", { style: { display: "grid", gridTemplateColumns: "280px 1fr", height: "100%" }, children: [_jsxs("aside", { style: { borderRight: "1px solid #e5e7eb", padding: 16, overflowY: "auto" }, children: [_jsx("div", { style: { fontWeight: 700, marginBottom: 12 }, children: "5\u00A0 KI" }), _jsx("nav", { children: items.map((it) => (_jsx(NavLink, { to: it.to, end: it.end, style: ({ isActive }) => ({
                                display: "block",
                                padding: "8px 10px",
                                marginBottom: 6,
                                borderRadius: 8,
                                textDecoration: "none",
                                color: isActive ? "#111827" : "#374151",
                                background: isActive ? "#e5e7eb" : "transparent",
                                fontWeight: pathname === it.to || isActive ? 600 : 500,
                            }), children: it.label }, it.to))) })] }), _jsx("main", { style: { padding: 20, overflow: "auto" }, children: _jsx(Outlet, {}) })] }));
}

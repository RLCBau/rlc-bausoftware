import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { NavLink, useLocation } from "react-router-dom";
const topItems = [
    // ⬇⬇ QUI la sola modifica: /start  ->  /start/projekt
    { to: "/start/projekt", label: "Start (Projekt auswählen)", icon: "🚀" },
    { to: "/projekt/uebersicht", label: "Projekt-Übersicht", icon: "📁" },
];
const moduleItems = [
    { to: "/kalkulation", label: "Kalkulation", icon: "🧮" },
    { to: "/mengenermittlung", label: "Mengenermittlung", icon: "📏" },
    { to: "/cad", label: "CAD / PDF", icon: "✏️" },
    { to: "/buro", label: "Büro / Verwaltung", icon: "🏢" },
    { to: "/ki", label: "KI", icon: "🧠" },
    { to: "/info", label: "Info / Hilfe", icon: "ℹ️" },
    { to: "/buchhaltung", label: "Buchhaltung", icon: "📊" }, // layout + <Outlet/>
];
// ---- Sottomenu Buchhaltung (rotte figlie) ----
const buchhaltungItems = [
    { to: "/buchhaltung", label: "Übersicht" },
    { to: "/buchhaltung/kostenuebersicht-live", label: "Kostenübersicht pro Projekt (live)" },
    { to: "/buchhaltung/ausgang", label: "Rechnungen / Abschläge" },
    { to: "/buchhaltung/zahlungen", label: "Zahlungseingänge / Offene Posten" },
    { to: "/buchhaltung/eingang", label: "Eingangsrechnungen" },
    { to: "/buchhaltung/kassenbuch", label: "Kassenbuch" },
    { to: "/buchhaltung/kostenstellen", label: "Projekt-Kostenstellenstruktur" },
    { to: "/buchhaltung/mahnwesen", label: "Mahnwesen" },
    { to: "/buchhaltung/reports", label: "Dokumente & Belege verwalten" },
    { to: "/buchhaltung/datev", label: "DATEV / Lexware / SAP Export" },
    { to: "/buchhaltung/ust", label: "USt.-Übersicht" },
];
export default function Sidebar() {
    const { pathname } = useLocation();
    const inBuchhaltung = pathname.startsWith("/buchhaltung");
    return (_jsxs("nav", { style: { display: "grid", gap: 8 }, children: [_jsxs("div", { className: "card", style: { padding: 8 }, children: [_jsx("div", { style: { fontWeight: 700, marginBottom: 6 }, children: "Projekt" }), topItems.map((it) => (_jsxs(NavLink, { to: it.to, end: true, className: ({ isActive }) => "row" + (isActive ? " active" : ""), style: {
                            alignItems: "center",
                            gap: 8,
                            padding: "6px 8px",
                            borderRadius: 6,
                            textDecoration: "none",
                        }, children: [it.icon && _jsx("span", { style: { fontSize: 16 }, children: it.icon }), _jsx("span", { style: { fontWeight: 700 }, children: it.label })] }, it.to)))] }), _jsxs("div", { className: "card", style: { padding: 8 }, children: [_jsx("div", { style: { fontWeight: 700, marginBottom: 6 }, children: "RLC \u2013 Module" }), _jsx("div", { style: { display: "grid", gap: 6 }, children: moduleItems.map((it, i) => (_jsxs(NavLink, { to: it.to, className: ({ isActive }) => "row card" + (isActive ? " active" : ""), style: { alignItems: "center", gap: 8, padding: 8 }, children: [_jsx("span", { style: { width: 22, textAlign: "center" }, children: i + 1 }), _jsx("span", { style: { fontSize: 16 }, children: it.icon }), _jsx("span", { style: { fontWeight: 600 }, children: it.label })] }, it.to))) })] }), inBuchhaltung && (_jsxs("div", { className: "card", style: { padding: 8 }, children: [_jsx("div", { style: { fontWeight: 700, marginBottom: 6 }, children: "7. Buchhaltung" }), _jsx("div", { style: { display: "grid", gap: 6 }, children: buchhaltungItems.map((it) => (_jsx(NavLink, { to: it.to, end: it.to === "/buchhaltung", className: ({ isActive }) => "row" + (isActive ? " active" : ""), style: { padding: "6px 8px", borderRadius: 6, textDecoration: "none" }, children: it.label }, it.to))) })] }))] }));
}

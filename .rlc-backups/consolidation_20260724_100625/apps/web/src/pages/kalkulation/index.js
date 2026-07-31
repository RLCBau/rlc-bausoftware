import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
const shell = { display: "grid", gridTemplateColumns: "240px 1fr", height: "calc(100vh - 0px)" };
const aside = { borderRight: "1px solid #e2e8f0", padding: 10, fontFamily: "Inter, system-ui, Arial", fontSize: 13 };
const main = { overflow: "auto" };
const item = { display: "block", padding: "8px 10px", margin: "4px 6px", borderRadius: 6, color: "#0f172a", textDecoration: "none" };
const title = { margin: "14px 6px 8px", color: "#334155", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: .4 };
export default function KalkulationIndex() {
    const loc = useLocation();
    const is = (p) => (loc.pathname === p ? { background: "#f1f5f9", fontWeight: 600 } : {});
    return (_jsxs("div", { style: shell, children: [_jsxs("aside", { style: aside, children: [_jsx("div", { style: title, children: "Angebotsphase" }), _jsx(Link, { style: { ...item, ...is("/kalkulation/projekt") }, to: "/kalkulation/projekt", children: "Projekt" }), _jsx(Link, { style: { ...item, ...is("/kalkulation/lvUpload") }, to: "/kalkulation/lvUpload", children: "LV hochladen/erstellen" }), _jsx(Link, { style: { ...item, ...is("/kalkulation/gaeb") }, to: "/kalkulation/gaeb", children: "GAEB Import/Export" }), _jsx(Link, { style: { ...item, ...is("/kalkulation/manuell") }, to: "/kalkulation/manuell", children: "Kalkulation (manuell)" }), _jsx(Link, { style: { ...item, ...is("/kalkulation/preise") }, to: "/kalkulation/preise", children: "Preislisten (Material/Arbeit/Maschine)" }), _jsx(Link, { style: { ...item, ...is("/kalkulation/aufschlag") }, to: "/kalkulation/aufschlag", children: "Aufschl\u00E4ge / Rabatte" }), _jsx(Link, { style: { ...item, ...is("/kalkulation/vergleich") }, to: "/kalkulation/vergleich", children: "Versionsvergleich" }), _jsx(Link, { style: { ...item, ...is("/kalkulation/angebot") }, to: "/kalkulation/angebot", children: "Angebot generieren" }), _jsx("div", { style: title, children: "Sonstiges" }), _jsx(Link, { style: { ...item, ...is("/kalkulation/lvOhnePreis") }, to: "/kalkulation/lvOhnePreis", children: "LV ohne Preise exportieren" }), _jsx(Link, { style: { ...item, ...is("/kalkulation/crm") }, to: "/kalkulation/crm", children: "CRM-Verfolgung" })] }), _jsx("main", { style: main, children: _jsx(Outlet, {}) })] }));
}

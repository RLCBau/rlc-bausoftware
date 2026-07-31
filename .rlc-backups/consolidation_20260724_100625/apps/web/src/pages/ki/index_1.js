import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
const shell = { display: "grid", gridTemplateColumns: "240px 1fr", height: "calc(100vh - 0px)" };
const aside = { borderRight: "1px solid #e2e8f0", padding: 10, fontFamily: "Inter, system-ui, Arial", fontSize: 13 };
const main = { overflow: "auto" };
const item = { display: "block", padding: "8px 10px", margin: "4px 6px", borderRadius: 6, color: "#0f172a", textDecoration: "none" };
const title = { margin: "14px 6px 8px", color: "#334155", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: .4 };
export default function KIIndex() {
    const loc = useLocation();
    const is = (p) => (loc.pathname === p ? { background: "#f1f5f9", fontWeight: 600 } : {});
    return (_jsxs("div", { style: shell, children: [_jsxs("aside", { style: aside, children: [_jsx("div", { style: title, children: "KI" }), _jsx(Link, { style: { ...item, ...is("/ki/lv-auto") }, to: "/ki/lv-auto", children: "Automatische LV-Erstellung" }), _jsx(Link, { style: { ...item, ...is("/ki/vorschlaege") }, to: "/ki/vorschlaege", children: "Vorschl\u00E4ge" }), _jsx(Link, { style: { ...item, ...is("/ki/nachtraege") }, to: "/ki/nachtraege", children: "Nachtragserkennung" }), _jsx(Link, { style: { ...item, ...is("/ki/analyse") }, to: "/ki/analyse", children: "LV-Analyse" }), _jsx(Link, { style: { ...item, ...is("/ki/foto") }, to: "/ki/foto", children: "Fotoerkennung" }), _jsx(Link, { style: { ...item, ...is("/ki/sprach") }, to: "/ki/sprach", children: "Sprachsteuerung" })] }), _jsx("main", { style: main, children: _jsx(Outlet, {}) })] }));
}

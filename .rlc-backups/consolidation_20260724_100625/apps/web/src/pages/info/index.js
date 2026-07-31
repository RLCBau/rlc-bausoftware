import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
const shell = { display: "grid", gridTemplateColumns: "240px 1fr", height: "calc(100vh - 0px)" };
const aside = { borderRight: "1px solid #e2e8f0", padding: 10, fontFamily: "Inter, system-ui, Arial", fontSize: 13 };
const main = { overflow: "auto" };
const item = { display: "block", padding: "8px 10px", margin: "4px 6px", borderRadius: 6, color: "#0f172a", textDecoration: "none" };
const title = { margin: "14px 6px 8px", color: "#334155", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: .4 };
export default function InfoIndex() {
    const loc = useLocation();
    const is = (p) => (loc.pathname === p ? { background: "#f1f5f9", fontWeight: 600 } : {});
    return (_jsxs("div", { style: shell, children: [_jsxs("aside", { style: aside, children: [_jsx("div", { style: title, children: "Info & Hilfe" }), _jsx(Link, { style: { ...item, ...is("/info/hilfe") }, to: "/info/hilfe", children: "Hilfe / Anleitungen" }), _jsx(Link, { style: { ...item, ...is("/info/faq") }, to: "/info/faq", children: "FAQ" }), _jsx(Link, { style: { ...item, ...is("/info/shortcuts") }, to: "/info/shortcuts", children: "Tastenk\u00FCrzel" }), _jsx(Link, { style: { ...item, ...is("/info/changelog") }, to: "/info/changelog", children: "Changelog" }), _jsx(Link, { style: { ...item, ...is("/info/system") }, to: "/info/system", children: "Systemstatus" }), _jsx(Link, { style: { ...item, ...is("/info/updates") }, to: "/info/updates", children: "Updates" }), _jsx("div", { style: title, children: "Rechtliches" }), _jsx(Link, { style: { ...item, ...is("/info/datenschutz") }, to: "/info/datenschutz", children: "Datenschutz" }), _jsx(Link, { style: { ...item, ...is("/info/impressum") }, to: "/info/impressum", children: "Impressum" }), _jsx("div", { style: title, children: "Kontakt" }), _jsx(Link, { style: { ...item, ...is("/info/support") }, to: "/info/support", children: "Support / Feedback" }), _jsx(Link, { style: { ...item, ...is("/info/ueber") }, to: "/info/ueber", children: "\u00DCber die App" })] }), _jsx("main", { style: main, children: _jsx(Outlet, {}) })] }));
}

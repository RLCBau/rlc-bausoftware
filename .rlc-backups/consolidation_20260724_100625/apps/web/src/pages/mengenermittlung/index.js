import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// apps/web/src/pages/mengenermittlung/index.tsx
import React from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
const shell = {
    display: "grid",
    gridTemplateColumns: "240px 1fr",
    height: "calc(100vh - 0px)",
};
const aside = {
    borderRight: "1px solid #e2e8f0",
    padding: "10px",
    fontFamily: "Inter, system-ui, Arial, Helvetica, sans-serif",
    fontSize: 13,
};
const main = {
    overflow: "auto",
};
const groupTitle = {
    margin: "14px 6px 8px",
    color: "#334155",
    fontWeight: 700,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
};
const item = {
    display: "block",
    padding: "8px 10px",
    margin: "4px 6px",
    borderRadius: 6,
    color: "#0f172a",
    textDecoration: "none",
};
export default function MengenermittlungIndex() {
    const loc = useLocation();
    const is = (p) => (loc.pathname === p ? { background: "#f1f5f9", fontWeight: 600 } : {});
    return (_jsxs("div", { style: shell, children: [_jsxs("aside", { style: aside, children: [_jsx("div", { style: groupTitle, children: "Aufma\u00DF" }), _jsx(Link, { style: { ...item, ...is("/mengenermittlung/auftragsliste") }, to: "/mengenermittlung/auftragsliste", children: "Auftragsliste" }), _jsx(Link, { style: { ...item, ...is("/mengenermittlung/aufmaseditor") }, to: "/mengenermittlung/aufmaseditor", children: "Aufma\u00DFeditor" }), _jsx(Link, { style: { ...item, ...is("/mengenermittlung/raumbuch") }, to: "/mengenermittlung/raumbuch", children: "Raumbuch / Raumaufma\u00DFe" }), _jsx(Link, { style: { ...item, ...is("/mengenermittlung/abrechnungskreise") }, to: "/mengenermittlung/abrechnungskreise", children: "Abrechnungskreise" }), _jsx(Link, { style: { ...item, ...is("/mengenermittlung/bilder") }, to: "/mengenermittlung/bilder", children: "Bilder zum Aufma\u00DF" }), _jsx("div", { style: groupTitle, children: "Funktionen" }), _jsx(Link, { style: { ...item, ...is("/mengenermittlung/neuberechnung") }, to: "/mengenermittlung/neuberechnung", children: "Neuberechnung" }), _jsx(Link, { style: { ...item, ...is("/mengenermittlung/ausdrucke") }, to: "/mengenermittlung/ausdrucke", children: "Ausdrucke" }), _jsx(Link, { style: { ...item, ...is("/mengenermittlung/datenaustausch") }, to: "/mengenermittlung/datenaustausch", children: "Datenaustausch" }), _jsx(Link, { style: { ...item, ...is("/mengenermittlung/stammdaten") }, to: "/mengenermittlung/stammdaten", children: "Stammdaten" })] }), _jsx("main", { style: main, children: _jsx(Outlet, {}) })] }));
}

import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
const shell = { maxWidth: 900, margin: "0 auto", padding: "12px 16px 40px", fontFamily: "Inter,system-ui,Arial", color: "#0f172a" };
const qa = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 10, margin: "8px 0" };
export default function FAQ() {
    return (_jsxs("div", { style: shell, children: [_jsx("h2", { children: "FAQ" }), _jsxs("div", { style: qa, children: [_jsx("b", { children: "Mengen-Formeln?" }), _jsxs("div", { children: ["Einfache JS-Ausdr\u00FCcke: ", _jsx("code", { children: "10*2+5" }), ", ", _jsx("code", { children: "(12+8)/2" }), "."] })] }), _jsxs("div", { style: qa, children: [_jsx("b", { children: "Daten weg?" }), _jsx("div", { children: "Alles speichert lokal (Browser). Cache-L\u00F6schung leert die Daten." })] }), _jsxs("div", { style: qa, children: [_jsx("b", { children: "Export?" }), _jsx("div", { children: "CSV/SVG/JSON verf\u00FCgbar; GAEB/DXF/DWG folgen." })] }), _jsxs("div", { style: qa, children: [_jsx("b", { children: "Mehrbenutzer?" }), _jsx("div", { children: "Geplant (API/DB). Aktuell Single-User (localStorage)." })] })] }));
}

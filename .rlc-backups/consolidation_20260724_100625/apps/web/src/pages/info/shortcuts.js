import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
const shell = { maxWidth: 700, margin: "0 auto", padding: "12px 16px 40px", fontFamily: "Inter,system-ui,Arial" };
const table = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const thtd = { border: "1px solid #e2e8f0", padding: "6px 8px" };
const head = { ...thtd, background: "#f8fafc", fontWeight: 600 };
export default function Shortcuts() {
    return (_jsxs("div", { style: shell, children: [_jsx("h2", { children: "Tastenk\u00FCrzel" }), _jsxs("table", { style: table, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: head, children: "Aktion" }), _jsx("th", { style: head, children: "Shortcut" })] }) }), _jsxs("tbody", { children: [_jsxs("tr", { children: [_jsx("td", { style: thtd, children: "Suchen (Tabellen)" }), _jsx("td", { style: thtd, children: "Ctrl/Cmd + F" })] }), _jsxs("tr", { children: [_jsx("td", { style: thtd, children: "Zeile hinzuf\u00FCgen" }), _jsx("td", { style: thtd, children: "Alt + N" })] }), _jsxs("tr", { children: [_jsx("td", { style: thtd, children: "L\u00F6schen" }), _jsx("td", { style: thtd, children: "Entf" })] }), _jsxs("tr", { children: [_jsx("td", { style: thtd, children: "CAD Pan" }), _jsx("td", { style: thtd, children: "Werkzeug \u201EPan\u201C" })] })] })] })] }));
}

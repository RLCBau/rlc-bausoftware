import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
/* ================= STYLE ================= */
const shell = {
    maxWidth: 750,
    margin: "0 auto",
    padding: "12px 16px 40px",
    fontFamily: "Inter,system-ui,Arial"
};
const table = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    overflow: "hidden"
};
const thtd = {
    borderBottom: "1px solid #e2e8f0",
    padding: "8px 10px",
    textAlign: "left"
};
const head = {
    ...thtd,
    background: "#f8fafc",
    fontWeight: 600
};
const supportBtn = {
    position: "fixed",
    right: 20,
    bottom: 20,
    background: "#0ea5e9",
    color: "#fff",
    border: "none",
    borderRadius: 999,
    padding: "12px 18px",
    fontWeight: 600,
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
};
/* ================= COMPONENT ================= */
export default function Shortcuts() {
    const openSupport = () => {
        alert("Support Chat wird geöffnet (Integration folgt)");
    };
    return (_jsxs("div", { className: rlcClass(null, shell), children: [_jsx("h2", { children: "Tastenk\u00FCrzel" }), _jsxs("table", { className: rlcClass(null, table), children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, head), children: "Aktion" }), _jsx("th", { className: rlcClass(null, head), children: "Shortcut" })] }) }), _jsxs("tbody", { children: [_jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, thtd), children: "Suchen (Tabellen)" }), _jsx("td", { className: rlcClass(null, thtd), children: "Ctrl / Cmd + F" })] }), _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, thtd), children: "Neue Zeile hinzuf\u00FCgen" }), _jsx("td", { className: rlcClass(null, thtd), children: "Alt + N" })] }), _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, thtd), children: "Zeile l\u00F6schen" }), _jsx("td", { className: rlcClass(null, thtd), children: "Entf / Delete" })] }), _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, thtd), children: "Speichern (geplant)" }), _jsx("td", { className: rlcClass(null, thtd), children: "Ctrl / Cmd + S" })] }), _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, thtd), children: "Navigation zur\u00FCck" }), _jsx("td", { className: rlcClass(null, thtd), children: "Alt + \u2190" })] }), _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, thtd), children: "Navigation vorw\u00E4rts" }), _jsx("td", { className: rlcClass(null, thtd), children: "Alt + \u2192" })] }), _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, thtd), children: "CAD \u2013 Pan (verschieben)" }), _jsx("td", { className: rlcClass(null, thtd), children: "Mittlere Maustaste / Pan Tool" })] }), _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, thtd), children: "CAD \u2013 Zoom" }), _jsx("td", { className: rlcClass(null, thtd), children: "Mausrad" })] }), _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, thtd), children: "CAD \u2013 Auswahl l\u00F6schen" }), _jsx("td", { className: rlcClass(null, thtd), children: "Entf" })] })] })] }), _jsx("button", { className: rlcClass(null, supportBtn), onClick: openSupport, children: "Support Chat" })] }));
}

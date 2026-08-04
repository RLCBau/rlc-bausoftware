import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
/* ================= STYLE ================= */
const shell = {
    maxWidth: 800,
    margin: "0 auto",
    padding: "12px 16px 40px",
    fontFamily: "Inter,system-ui,Arial"
};
const card = {
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: 12,
    margin: "10px 0",
    background: "#fff"
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
export default function Changelog() {
    const openSupport = () => {
        // futuro: collegamento reale API /chat
        alert("Support Chat wird geöffnet (kommt gleich)");
    };
    return (_jsxs("div", { className: rlcClass(null, shell), children: [_jsx("h2", { children: "Changelog" }), _jsxs("div", { className: rlcClass(null, card), children: [_jsx("b", { children: "v0.5" }), " \u2013 Support Chat integriert, API-Verbindung vorbereitet, Verbesserungen Stabilit\u00E4t & UI."] }), _jsxs("div", { className: rlcClass(null, card), children: [_jsx("b", { children: "v0.4" }), " \u2013 Kalkulation erweitert (Preislisten, Vergleich, Angebot), CAD 2D Editor, Buchhaltung Basis."] }), _jsxs("div", { className: rlcClass(null, card), children: [_jsx("b", { children: "v0.3" }), " \u2013 Struktur 7 Makrosektionen, Tabelle-UI uniforme, Speicher lokal."] }), _jsxs("div", { className: rlcClass(null, card), children: [_jsx("b", { children: "v0.2" }), " \u2013 Mengenermittlung mit Formeln, Aufma\u00DFeditor."] }), _jsxs("div", { className: rlcClass(null, card), children: [_jsx("b", { children: "v0.1" }), " \u2013 Projekt-Setup, Routing, Layout."] }), _jsx("button", { className: rlcClass(null, supportBtn), onClick: openSupport, children: "Support Chat" })] }));
}

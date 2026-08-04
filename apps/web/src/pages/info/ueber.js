import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
const shell = {
    maxWidth: 760,
    margin: "0 auto",
    padding: "12px 16px 40px",
    fontFamily: "Inter,system-ui,Arial",
    color: "#0f172a"
};
const p = {
    margin: "10px 0",
    color: "#334155",
    lineHeight: 1.6
};
const card = {
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: 14,
    margin: "12px 0",
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
export default function Ueber() {
    const openSupport = () => {
        window.location.href = "/info/support";
    };
    return (_jsxs("div", { className: rlcClass(null, shell), children: [_jsx("h2", { children: "\u00DCber die App" }), _jsxs("div", { className: rlcClass(null, card), children: [_jsxs("p", { className: rlcClass(null, p), children: [_jsx("b", { children: "RLC Bausoftware" }), " ist eine modulare Softwarel\u00F6sung f\u00FCr reale Baustellen- und B\u00FCroprozesse im Tiefbau, Leitungsbau und verwandten Bereichen."] }), _jsx("p", { className: rlcClass(null, p), children: "Die Anwendung ist auf eine schnelle, praktische und strukturierte Arbeitsweise ausgelegt \u2013 sowohl im B\u00FCro als auch mobil auf der Baustelle." })] }), _jsxs("div", { className: rlcClass(null, card), children: [_jsx("p", { className: rlcClass(null, p), children: _jsx("b", { children: "Aktuelle Hauptbereiche:" }) }), _jsx("p", { className: rlcClass(null, p), children: "Mengenermittlung, Kalkulation, CAD, B\u00FCro / Verwaltung, Buchhaltung, KI sowie Info / Hilfe." })] }), _jsx("div", { className: rlcClass(null, card), children: _jsxs("p", { className: rlcClass(null, p), children: [_jsx("b", { children: "Ziel:" }), " Eine moderne Bausoftware, die schneller, schlanker und praxisn\u00E4her ist als klassische Systeme und sich an realen Baustellenabl\u00E4ufen orientiert."] }) }), _jsxs("div", { className: rlcClass(null, card), children: [_jsxs("p", { className: rlcClass(null, p), children: [_jsx("b", { children: "Systemstand:" }), " Demo / Entwicklungsstand"] }), _jsx("p", { className: rlcClass(null, p), children: "Web, Mobile, Server, Cloud-API und Support-Funktionen werden laufend erweitert." })] }), _jsx("button", { className: rlcClass(null, supportBtn), onClick: openSupport, type: "button", children: "Support Chat" })] }));
}

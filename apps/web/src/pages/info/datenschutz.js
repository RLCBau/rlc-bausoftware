import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
/* ================= STYLE ================= */
const shell = {
    maxWidth: 900,
    margin: "0 auto",
    padding: "12px 16px 40px",
    fontFamily: "Inter,system-ui,Arial"
};
const p = {
    margin: "8px 0",
    color: "#334155",
    lineHeight: 1.5
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
/* ================= COMPONENT ================= */
export default function Datenschutz() {
    const openSupport = () => {
        alert("Support Chat wird geöffnet (kommt gleich)");
    };
    return (_jsxs("div", { className: rlcClass(null, shell), children: [_jsx("h2", { children: "Datenschutz (Kurzfassung)" }), _jsxs("div", { className: rlcClass(null, card), children: [_jsxs("p", { className: rlcClass(null, p), children: ["Aktuell werden alle Daten ", _jsx("b", { children: "lokal im Browser" }), " gespeichert (LocalStorage). Es erfolgt ", _jsx("b", { children: "keine automatische \u00DCbertragung" }), " an externe Server."] }), _jsxs("p", { className: rlcClass(null, p), children: ["Beim L\u00F6schen des Browser-Caches k\u00F6nnen Daten verloren gehen. Es wird empfohlen, regelm\u00E4\u00DFig die integrierten", " ", _jsx("b", { children: "Export-Funktionen (PDF / Excel)" }), " zu nutzen."] })] }), _jsxs("div", { className: rlcClass(null, card), children: [_jsx("h4", { children: "Geplante Cloud-Version" }), _jsx("p", { className: rlcClass(null, p), children: "In der produktiven Cloud-Version werden folgende Sicherheitsma\u00DFnahmen umgesetzt:" }), _jsx("p", { className: rlcClass(null, p), children: "\u2022 DSGVO-konforme Datenverarbeitung" }), _jsx("p", { className: rlcClass(null, p), children: "\u2022 Verschl\u00FCsselte Speicherung (Server + Transport)" }), _jsx("p", { className: rlcClass(null, p), children: "\u2022 Rollen- und Rechteverwaltung (User / Bauleiter / Admin)" }), _jsx("p", { className: rlcClass(null, p), children: "\u2022 Audit-Logs & Zugriffskontrolle" }), _jsx("p", { className: rlcClass(null, p), children: "\u2022 AVV (Auftragsverarbeitungsvertrag)" })] }), _jsxs("div", { className: rlcClass(null, card), children: [_jsx("h4", { children: "Sicherheit" }), _jsx("p", { className: rlcClass(null, p), children: "Die Server-Infrastruktur ist bereits durch Reverse Proxy (Nginx), HTTPS (SSL/TLS) sowie Firewall-Regeln abgesichert." })] }), _jsx("button", { className: rlcClass(null, supportBtn), onClick: openSupport, children: "Support Chat" })] }));
}

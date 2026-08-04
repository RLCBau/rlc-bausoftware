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
export default function Impressum() {
    const openSupport = () => {
        alert("Support Chat wird geöffnet (Integration folgt)");
    };
    return (_jsxs("div", { className: rlcClass(null, shell), children: [_jsx("h2", { children: "Impressum" }), _jsxs("p", { className: rlcClass(null, p), children: [_jsx("b", { children: "Firma:" }), " RLC Bausoftware"] }), _jsxs("p", { className: rlcClass(null, p), children: [_jsx("b", { children: "Inhaber:" }), " Roberto Lo Curto"] }), _jsxs("p", { className: rlcClass(null, p), children: [_jsx("b", { children: "Anschrift:" }), " (Adresse eintragen)"] }), _jsxs("p", { className: rlcClass(null, p), children: [_jsx("b", { children: "E-Mail:" }), " info@rlcbausoftware.com"] }), _jsxs("p", { className: rlcClass(null, p), children: [_jsx("b", { children: "Telefon:" }), " (optional)"] }), _jsxs("p", { className: rlcClass(null, p), children: [_jsx("b", { children: "Umsatzsteuer-ID:" }), " (falls vorhanden)"] }), _jsxs("p", { className: rlcClass(null, p), children: [_jsx("b", { children: "Verantwortlich f\u00FCr den Inhalt nach \u00A7 55 Abs. 2 RStV:" }), _jsx("br", {}), "Roberto Lo Curto"] }), _jsx("button", { className: rlcClass(null, supportBtn), onClick: openSupport, children: "Support Chat" })] }));
}

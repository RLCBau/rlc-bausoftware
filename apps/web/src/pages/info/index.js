import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
const shell = {
    display: "grid",
    gridTemplateColumns: "260px 1fr",
    minHeight: "100vh",
    background: "#f8fafc"
};
const aside = {
    borderRight: "1px solid #e2e8f0",
    padding: 12,
    fontFamily: "Inter, system-ui, Arial",
    fontSize: 13,
    background: "#ffffff"
};
const main = {
    overflow: "auto",
    padding: 0
};
const item = {
    display: "block",
    padding: "10px 12px",
    margin: "4px 6px",
    borderRadius: 8,
    color: "#0f172a",
    textDecoration: "none",
    transition: "all 0.15s ease"
};
const title = {
    margin: "16px 6px 8px",
    color: "#334155",
    fontWeight: 600,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4
};
const brand = {
    margin: "4px 6px 14px",
    padding: "10px 12px",
    borderRadius: 10,
    background: "#f8fafc",
    border: "1px solid #e2e8f0"
};
const brandTitle = {
    fontSize: 15,
    fontWeight: 600,
    color: "#0f172a",
    marginBottom: 4
};
const brandSub = {
    fontSize: 12,
    color: "#64748b",
    lineHeight: 1.4
};
const supportBox = {
    margin: "18px 6px 6px",
    padding: 12,
    borderRadius: 10,
    background: "#eaf2ff",
    border: "1px solid #bed6ff"
};
const supportTitle = {
    fontSize: 13,
    fontWeight: 600,
    color: "#0f172a",
    marginBottom: 6
};
const supportText = {
    fontSize: 12,
    color: "#334155",
    lineHeight: 1.45,
    marginBottom: 10
};
const supportBtn = {
    width: "100%",
    border: "none",
    borderRadius: 8,
    background: "#0ea5e9",
    color: "#fff",
    padding: "10px 12px",
    fontWeight: 600,
    cursor: "pointer"
};
export default function InfoIndex() {
    const loc = useLocation();
    const navigate = useNavigate();
    const is = (p) => loc.pathname === p ?
        {
            background: "#f1f5f9",
            fontWeight: 600,
            color: "#0f172a",
            border: "1px solid #e2e8f0"
        } :
        {};
    return (_jsxs("div", { className: rlcClass(null, shell), children: [_jsxs("aside", { className: rlcClass(null, aside), children: [_jsxs("div", { className: rlcClass(null, brand), children: [_jsx("div", { className: rlcClass(null, brandTitle), children: "Info & Hilfe" }), _jsx("div", { className: rlcClass(null, brandSub), children: "Anleitungen, FAQ, rechtliche Hinweise und direkter Support f\u00FCr die RLC Bausoftware." })] }), _jsx("div", { className: rlcClass(null, title), children: "Info & Hilfe" }), _jsx(Link, { style: { ...item, ...is("/info/hilfe") }, to: "/info/hilfe", children: "Hilfe / Anleitungen" }), _jsx(Link, { style: { ...item, ...is("/info/faq") }, to: "/info/faq", children: "FAQ" }), _jsx(Link, { style: { ...item, ...is("/info/shortcuts") }, to: "/info/shortcuts", children: "Tastenk\u00FCrzel" }), _jsx(Link, { style: { ...item, ...is("/info/changelog") }, to: "/info/changelog", children: "Changelog" }), _jsx(Link, { style: { ...item, ...is("/info/system") }, to: "/info/system", children: "Systemstatus" }), _jsx(Link, { style: { ...item, ...is("/info/updates") }, to: "/info/updates", children: "Updates" }), _jsx("div", { className: rlcClass(null, title), children: "Rechtliches" }), _jsx(Link, { style: { ...item, ...is("/info/datenschutz") }, to: "/info/datenschutz", children: "Datenschutz" }), _jsx(Link, { style: { ...item, ...is("/info/impressum") }, to: "/info/impressum", children: "Impressum" }), _jsx("div", { className: rlcClass(null, title), children: "Kontakt" }), _jsx(Link, { style: { ...item, ...is("/info/support") }, to: "/info/support", children: "Support / Feedback" }), _jsx(Link, { style: { ...item, ...is("/info/ueber") }, to: "/info/ueber", children: "\u00DCber die App" }), _jsxs("div", { className: rlcClass(null, supportBox), children: [_jsx("div", { className: rlcClass(null, supportTitle), children: "Support Chat" }), _jsx("div", { className: rlcClass(null, supportText), children: "Direkte Hilfe bei Fragen, Problemen mit Synchronisation, Uploads oder Bedienung." }), _jsx("button", { className: rlcClass(null, supportBtn), onClick: () => navigate("/info/support"), type: "button", children: "Support \u00F6ffnen" })] })] }), _jsx("main", { className: rlcClass(null, main), children: _jsx(Outlet, {}) })] }));
}

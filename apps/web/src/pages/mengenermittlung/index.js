import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/mengenermittlung/index.tsx
import { Link, Outlet, useLocation } from "react-router-dom";
const shell = {
    maxWidth: 1480,
    margin: "0 auto",
    padding: "16px 18px 40px",
    fontFamily: "Inter, system-ui, Arial, Helvetica, sans-serif",
    color: "#0f172a",
    background: "radial-gradient(circle at top left, rgba(37,99,235,0.06), transparent 30%), #f6f8fc",
    minHeight: "100%"
};
const aside = {
    borderRight: "1px solid #e2e8f0",
    padding: "10px",
    fontFamily: "Inter, system-ui, Arial, Helvetica, sans-serif",
    fontSize: 13
};
const main = {
    overflow: "auto"
};
const groupTitle = {
    margin: "14px 6px 8px",
    color: "#334155",
    fontWeight: 600,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4
};
const item = {
    display: "block",
    padding: "8px 10px",
    margin: "4px 6px",
    borderRadius: 6,
    color: "#0f172a",
    textDecoration: "none"
};
export default function MengenermittlungIndex() {
    const loc = useLocation();
    const is = (p) => loc.pathname === p ? { background: "#f1f5f9", fontWeight: 600 } : {};
    return (_jsxs("div", { className: rlcClass(null, shell), children: [_jsxs("aside", { className: rlcClass(null, aside), children: [_jsx("div", { className: rlcClass(null, groupTitle), children: "Aufma\u00C3\u0178" }), _jsx(Link, { style: { ...item, ...is("/mengenermittlung/aufmasseditor") }, to: "/mengenermittlung/aufmasseditor", children: "Aufma\u00C3\u0178editor" }), _jsx(Link, { style: { ...item, ...is("/mengenermittlung/abrechnungskreise") }, to: "/mengenermittlung/abrechnungskreise", children: "Abrechnungskreise" }), _jsx(Link, { style: { ...item, ...is("/mengenermittlung/bilder") }, to: "/mengenermittlung/bilder", children: "Bilder zum Aufma\u00C3\u0178" }), _jsx("div", { className: rlcClass(null, groupTitle), children: "Funktionen" })] }), _jsx("main", { className: rlcClass(null, main), children: _jsx(Outlet, {}) })] }));
}

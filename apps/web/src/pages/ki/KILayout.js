import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/ki/KILayout.tsx
import { NavLink, Outlet } from "react-router-dom";
const items = [
    { to: "/ki", label: "Übersicht", end: true },
    { to: "/ki/fotoerkennung", label: "Fotoerkennung (Leistung / Material / Mengen)" },
    { to: "/ki/sprachsteuerung", label: "Sprachsteuerung (Regieberichte diktieren)" },
    { to: "/ki/auto-abrechnung", label: "Automatische Abrechnung" },
    { to: "/ki/regie-auto", label: "Regieberichte automatisch generieren" },
    { to: "/ki/optimierung", label: "Optimierung Bauzeiten & Ressourcen" },
    { to: "/ki/maengel", label: "Mängelmanagement KI-gestützt" }
];
const shellNoNav = {
    padding: 20,
    overflow: "auto",
    height: "100%"
};
const shellWithNav = {
    display: "grid",
    gridTemplateColumns: "280px 1fr",
    height: "100%"
};
const aside = {
    borderRight: "1px solid #e5e7eb",
    padding: 16,
    overflowY: "auto",
    background: "#fff"
};
const main = {
    padding: 20,
    overflow: "auto",
    background: "#f8fafc"
};
const title = {
    fontWeight: 600,
    marginBottom: 12,
    fontSize: 14,
    color: "#111827"
};
export default function KILayout({ showNav = false }) {
    if (!showNav) {
        return (_jsx("div", { className: rlcClass(null, shellNoNav), children: _jsx(Outlet, {}) }));
    }
    return (_jsxs("div", { className: rlcClass(null, shellWithNav), children: [_jsxs("aside", { className: rlcClass(null, aside), children: [_jsx("div", { className: rlcClass(null, title), children: "KI" }), _jsx("nav", { children: items.map((it) => _jsx(NavLink, { to: it.to, end: it.end, style: ({ isActive }) => ({
                                display: "block",
                                padding: "8px 10px",
                                marginBottom: 6,
                                borderRadius: 8,
                                textDecoration: "none",
                                color: isActive ? "#111827" : "#374151",
                                background: isActive ? "#e5e7eb" : "transparent",
                                fontWeight: isActive ? 600 : 500,
                                transition: "all 0.15s ease"
                            }), children: it.label }, it.to)) })] }), _jsx("main", { className: rlcClass(null, main), children: _jsx(Outlet, {}) })] }));
}

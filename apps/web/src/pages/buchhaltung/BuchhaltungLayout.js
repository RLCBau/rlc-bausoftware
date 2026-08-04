import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import "./styles.css";
const navItems = [
    { to: "/buchhaltung", label: "Übersicht" },
    { to: "/buchhaltung/kostenuebersicht", label: "Kostenübersicht (live)" },
    { to: "/buchhaltung/rechnungen", label: "Rechnungen / Abschläge" },
    { to: "/buchhaltung/abschlagsrechnungen", label: "Abschlagsrechnungen" },
    { to: "/buchhaltung/zahlungen", label: "Zahlungen" },
    { to: "/buchhaltung/eingang", label: "Eingangsrechnungen" },
    { to: "/buchhaltung/kassenbuch", label: "Kassenbuch" },
    { to: "/buchhaltung/kostenstellen", label: "Kostenstellen" },
    { to: "/buchhaltung/mahnwesen", label: "Mahnwesen" },
    { to: "/buchhaltung/reports", label: "Belege / Reports" },
    { to: "/buchhaltung/datev", label: "DATEV Export" },
    { to: "/buchhaltung/ust", label: "USt.-Übersicht" },
    { to: "/buchhaltung/lieferscheine", label: "Lieferscheine (Kosten)" }
];
function normalizePath(path) {
    return String(path || "").replace(/\/+$/, "") || "/";
}
function isActivePath(pathname, to) {
    const current = normalizePath(pathname);
    const target = normalizePath(to);
    if (target === "/buchhaltung") {
        return current === "/buchhaltung";
    }
    return current === target || current.startsWith(`${target}/`);
}
export default function BuchhaltungLayout() {
    const { pathname } = useLocation();
    return (_jsxs("div", { className: "bh-page", children: [_jsxs("header", { className: "rlc-page-hero", children: [_jsx("h1", { className: "rlc-migrated-pages-buchhaltung-buchhaltunglayout-tsx-164", children: "7. Buchhaltung" }), _jsx("div", { className: "rlc-migrated-pages-buchhaltung-buchhaltunglayout-tsx-165", children: "\u00DCbersicht, Rechnungen, Zahlungen, Kostenstellen, Belege und Exporte" })] }), _jsx("div", { className: "bh-module-nav rlc-migrated-pages-buchhaltung-buchhaltunglayout-tsx-166", children: navItems.map((it) => {
                    const active = isActivePath(pathname, it.to);
                    return (_jsx(NavLink, { to: it.to, className: `bh-btn ghost ${active ? "active" : ""}`, style: {
                            textDecoration: "none",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            border: active ? "1px solid var(--line, #d0d7de)" : undefined,
                            background: active ? "rgba(59,130,246,0.08)" : undefined,
                            fontWeight: active ? 700 : 600
                        }, children: it.label }, it.to));
                }) }), _jsx(Outlet, {})] }));
}

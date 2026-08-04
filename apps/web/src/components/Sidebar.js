import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { NavLink, useLocation } from "react-router-dom";
const topItems = [
    { to: "/start", label: "Start (Projekt auswählen)", icon: "🚀" },
    { to: "/projekt/uebersicht", label: "Projekt-Übersicht", icon: "📁" }
];
const moduleItems = [
    { to: "/kalkulation", label: "Kalkulation", icon: "🧮" },
    { to: "/mengenermittlung", label: "Mengenermittlung", icon: "📏" },
    { to: "/cad", label: "CAD / PDF", icon: "✏️" },
    { to: "/buro", label: "Büro / Verwaltung", icon: "🏢" },
    { to: "/ki", label: "KI", icon: "🧠" },
    { to: "/info", label: "Info / Hilfe", icon: "ℹ️" },
    { to: "/buchhaltung", label: "Buchhaltung", icon: "📊" }
];
const buchhaltungItems = [
    { to: "/buchhaltung", label: "Übersicht" },
    { to: "/buchhaltung/kostenuebersicht", label: "Kostenübersicht pro Projekt (live)" },
    { to: "/buchhaltung/rechnungen", label: "Rechnungen / Abschläge" },
    { to: "/buchhaltung/abschlagsrechnungen", label: "Abschlagsrechnungen" },
    { to: "/buchhaltung/zahlungen", label: "Zahlungseingänge / Offene Posten" },
    { to: "/buchhaltung/eingang", label: "Eingangsrechnungen" },
    { to: "/buchhaltung/kassenbuch", label: "Kassenbuch" },
    { to: "/buchhaltung/kostenstellen", label: "Projekt-Kostenstellenstruktur" },
    { to: "/buchhaltung/mahnwesen", label: "Mahnwesen" },
    { to: "/buchhaltung/reports", label: "Dokumente & Belege verwalten" },
    { to: "/buchhaltung/datev", label: "DATEV / Lexware / SAP Export" },
    { to: "/buchhaltung/ust", label: "USt.-Übersicht" },
    { to: "/buchhaltung/lieferscheine", label: "Lieferscheine (Kosten)" }
];
export default function Sidebar() {
    const { pathname } = useLocation();
    const inBuchhaltung = pathname.startsWith("/buchhaltung");
    return (_jsxs("nav", { className: "rlc-migrated-components-sidebar-tsx-19", children: [_jsxs("div", { className: "card rlc-migrated-components-sidebar-tsx-20", children: [_jsx("div", { className: "rlc-migrated-components-sidebar-tsx-21", children: "Projekt" }), topItems.map((it) => _jsxs(NavLink, { to: it.to, end: it.to === "/start" || it.to === "/projekt/uebersicht", className: ({ isActive }) => "row" + (isActive ? " active" : ""), style: {
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "6px 8px",
                            borderRadius: 6,
                            textDecoration: "none"
                        }, children: [it.icon && _jsx("span", { className: "rlc-migrated-components-sidebar-tsx-22", children: it.icon }), _jsx("span", { className: "rlc-migrated-components-sidebar-tsx-23", children: it.label })] }, it.to))] }), _jsxs("div", { className: "card rlc-migrated-components-sidebar-tsx-24", children: [_jsx("div", { className: "rlc-migrated-components-sidebar-tsx-25", children: "RLC \u2013 Module" }), _jsx("div", { className: "rlc-migrated-components-sidebar-tsx-26", children: moduleItems.map((it, i) => _jsxs(NavLink, { to: it.to, className: ({ isActive }) => "row card" + (isActive ? " active" : ""), style: {
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: 8,
                                textDecoration: "none"
                            }, children: [_jsx("span", { className: "rlc-migrated-components-sidebar-tsx-27", children: i + 1 }), _jsx("span", { className: "rlc-migrated-components-sidebar-tsx-28", children: it.icon }), _jsx("span", { className: "rlc-migrated-components-sidebar-tsx-29", children: it.label })] }, it.to)) })] }), inBuchhaltung &&
                _jsxs("div", { className: "card rlc-migrated-components-sidebar-tsx-30", children: [_jsx("div", { className: "rlc-migrated-components-sidebar-tsx-31", children: "7. Buchhaltung" }), _jsx("div", { className: "rlc-migrated-components-sidebar-tsx-32", children: buchhaltungItems.map((it) => _jsx(NavLink, { to: it.to, end: it.to === "/buchhaltung", className: ({ isActive }) => "row" + (isActive ? " active" : ""), style: {
                                    display: "flex",
                                    alignItems: "center",
                                    padding: "6px 8px",
                                    borderRadius: 6,
                                    textDecoration: "none"
                                }, children: it.label }, it.to)) })] })] }));
}

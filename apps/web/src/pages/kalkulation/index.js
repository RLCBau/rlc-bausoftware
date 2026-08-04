import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/kalkulation/index.tsx
import { Link, Outlet, useLocation } from "react-router-dom";
const groups = [
    {
        title: "Projekt & Import",
        items: [
            {
                label: "Projekt",
                to: "/kalkulation/projekt",
                desc: "Projekt wÃ¤hlen / erstellen"
            },
            {
                label: "LV hochladen / erstellen",
                to: "/kalkulation/lvUpload",
                desc: "LV manuell, CSV, Formeln"
            },
            {
                label: "GAEB Import / Export",
                to: "/kalkulation/gaeb",
                desc: "X83 / X84 / GAEB prÃ¼fen"
            }
        ]
    },
    {
        title: "Kalkulation",
        items: [
            {
                label: "Kalkulation mit KI",
                to: "/kalkulation/mit-ki",
                desc: "Elite-KI Kalkulator"
            },
            {
                label: "Kalkulation manuell",
                to: "/kalkulation/manuell",
                desc: "Manuelle LV-Bearbeitung"
            },
            {
                label: "Rezepte / Kalkulationsbausteine",
                to: "/kalkulation/recipes",
                desc: "Vorlagen, Varianten, Ãœbergabe an KI"
            },
            {
                label: "Preise einfÃ¼gen",
                to: "/kalkulation/preise",
                desc: "Material / Arbeit / Maschinen"
            },
            {
                label: "AufschlÃ¤ge / Rabatte",
                to: "/kalkulation/aufschlag",
                desc: "Preisstrategie anwenden"
            }
        ]
    },
    {
        title: "Angebot & PrÃ¼fung",
        items: [
            {
                label: "Angebot / Export",
                to: "/kalkulation/angebot",
                desc: "PDF, Excel und Nachträge"
            },
            {
                label: "Versionsvergleich",
                to: "/kalkulation/vergleich",
                desc: "Angebotsanalyse"
            },
            {
                label: "NachtrÃ¤ge",
                to: "/kalkulation/nachtraege",
                desc: "NachtrÃ¤ge erstellen / prÃ¼fen"
            },
            {
                label: "LV ohne Preise",
                to: "/kalkulation/lvOhnePreis",
                desc: "Ausschreibungs-LV exportieren"
            }
        ]
    },
    {
        title: "Vertrieb",
        items: [
            {
                label: "CRM-Verfolgung",
                to: "/kalkulation/crm",
                desc: "Angebote nachverfolgen"
            }
        ]
    }
];
function isActive(pathname, target) {
    if (pathname === target)
        return true;
    return pathname.startsWith(`${target}/`);
}
export default function KalkulationIndex() {
    const loc = useLocation();
    return (_jsxs("div", { className: rlcClass(null, shell), children: [_jsxs("aside", { className: rlcClass(null, aside), children: [_jsxs("div", { className: rlcClass(null, brandBox), children: [_jsx("div", { className: rlcClass(null, brandEyebrow), children: "RLC Bausoftware" }), _jsx("div", { className: rlcClass(null, brandTitle), children: "Kalkulation" }), _jsx("div", { className: rlcClass(null, brandText), children: "LV, Preise, KI-Kalkulation, Angebot und Nachtr\u00C3\u00A4ge." })] }), _jsx("nav", { className: rlcClass(null, nav), children: groups.map((group) => _jsxs("div", { className: rlcClass(null, groupBox), children: [_jsx("div", { className: rlcClass(null, groupTitle), children: group.title }), group.items.map((entry) => {
                                    const active = isActive(loc.pathname, entry.to);
                                    return (_jsxs(Link, { to: entry.to, style: {
                                            ...item,
                                            ...(active ? itemActive : null)
                                        }, children: [_jsx("span", { className: rlcClass(null, itemLabel), children: entry.label }), entry.desc ?
                                                _jsx("span", { className: rlcClass(null, itemDesc), children: entry.desc }) :
                                                null] }, entry.to));
                                })] }, group.title)) })] }), _jsx("main", { className: rlcClass(null, main), children: _jsx(Outlet, {}) })] }));
}
/* ===================== STYLES ===================== */
const shell = {
    display: "grid",
    gridTemplateColumns: "290px minmax(0, 1fr)",
    height: "100vh",
    background: "#F8FAFC",
    color: "#0F172A",
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, Arial"
};
const aside = {
    borderRight: "1px solid #E2E8F0",
    background: "#FFFFFF",
    padding: 14,
    overflowY: "auto"
};
const main = {
    overflow: "auto",
    minWidth: 0,
    background: "#F8FAFC"
};
const brandBox = {
    border: "1px solid #E5E7EB",
    borderRadius: 16,
    padding: 14,
    background: "linear-gradient(135deg,#0F172A,#1E3A8A)",
    color: "#FFFFFF",
    marginBottom: 14,
    boxShadow: "0 12px 28px rgba(15,23,42,0.16)"
};
const brandEyebrow = {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    opacity: 0.78
};
const brandTitle = {
    marginTop: 4,
    fontSize: 22,
    fontWeight: 700
};
const brandText = {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 1.45,
    opacity: 0.85
};
const nav = {
    display: "grid",
    gap: 14
};
const groupBox = {
    display: "grid",
    gap: 5
};
const groupTitle = {
    margin: "4px 4px 4px",
    color: "#64748B",
    fontWeight: 700,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.07em"
};
const item = {
    display: "grid",
    gap: 2,
    padding: "10px 11px",
    borderRadius: 12,
    color: "#0F172A",
    textDecoration: "none",
    border: "1px solid transparent",
    background: "transparent",
    transition: "background .15s ease, border-color .15s ease, color .15s ease"
};
const itemActive = {
    background: "#EAF2FF",
    border: "1px solid #BED6FF",
    color: "#0B5BD3"
};
const itemLabel = {
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1.25
};
const itemDesc = {
    fontSize: 11,
    color: "#64748B",
    lineHeight: 1.3
};

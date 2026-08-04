import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useNavigate } from "react-router-dom";
import PageHeader from "../../components/PageHeader";
import Card from "../../components/Card";
const items = [
    {
        title: "Automatische LV-Erstellung",
        desc: "KI generiert automatisch Positionen aus Beschreibung oder Projekt.",
        path: "/ki/auto-lv",
        icon: "📄"
    },
    {
        title: "Vorschläge & Optimierungen",
        desc: "Preise, Materialien und Geräte intelligent optimieren.",
        path: "/ki/vorschlaege",
        icon: "💡"
    },
    {
        title: "Nachtragserkennung",
        desc: "Abweichungen zwischen LV und Angebot automatisch erkennen.",
        path: "/kalkulation/nachtraege",
        icon: "⚠️"
    },
    {
        title: "LV-Analyse",
        desc: "Mengen-, Preis- und Plausibilitätsprüfung.",
        path: "/ki/bewertung-analyse",
        icon: "📊"
    },
    {
        title: "Fotoerkennung",
        desc: "Baustellenbilder analysieren (Rohre, Graben, Materialien).",
        path: "/ki/fotoerkennung",
        icon: "📷"
    },
    {
        title: "Sprachsteuerung",
        desc: "Regieberichte per Sprache diktieren und automatisch erstellen.",
        path: "/ki/sprachsteuerung",
        icon: "🎤"
    }
];
export default function KIUebersicht() {
    const nav = useNavigate();
    return (_jsxs("div", { className: "space-y-4 p-4", children: [_jsx(PageHeader, { breadcrumb: "RLC Module / KI", title: "\uD83E\uDD16 KI \u2013 \u00DCbersicht", subtitle: "K\u00FCnstliche Intelligenz unterst\u00FCtzt Sie bei Analyse, Automatisierung und Optimierung." }), _jsx("div", { className: "rlc-migrated-pages-ki-uebersicht-tsx-1052", children: items.map((it) => _jsx(Card, { style: {
                        cursor: "pointer",
                        transition: "0.2s"
                    }, onClick: () => nav(it.path), children: _jsxs("div", { className: "rlc-migrated-pages-ki-uebersicht-tsx-1053", children: [_jsxs("div", { className: "rlc-migrated-pages-ki-uebersicht-tsx-1054", children: [it.icon, " ", _jsx("b", { children: it.title })] }), _jsx("div", { className: "rlc-migrated-pages-ki-uebersicht-tsx-1055", children: it.desc })] }) }, it.path)) }), _jsx(Card, { children: _jsxs("div", { className: "rlc-migrated-pages-ki-uebersicht-tsx-1056", children: [_jsx("b", { children: "Hinweis:" }), _jsx("br", {}), "Die KI-Module arbeiten direkt mit Ihren Projektdaten (LV, Regie, Fotos, Angebote). Alle Ergebnisse k\u00F6nnen sofort weiterverarbeitet werden (Kalkulation, Abrechnung, Nachtr\u00E4ge)."] }) })] }));
}

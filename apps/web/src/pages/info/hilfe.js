import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
/* ================= STYLE ================= */
const shell = {
    maxWidth: 950,
    margin: "0 auto",
    padding: "12px 16px 40px",
    fontFamily: "Inter,system-ui,Arial",
    color: "#0f172a"
};
const h3 = {
    margin: "18px 0 6px",
    fontSize: 16,
    fontWeight: 600
};
const li = { margin: "6px 0", color: "#334155" };
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
export default function Hilfe() {
    const openSupport = () => {
        alert("Support Chat wird geöffnet (Integration folgt)");
    };
    return (_jsxs("div", { className: rlcClass(null, shell), children: [_jsx("h2", { children: "Hilfe / Anleitungen" }), _jsx("h3", { className: rlcClass(null, h3), children: "1. Kalkulation" }), _jsxs("ul", { children: [_jsxs("li", { className: rlcClass(null, li), children: [_jsx("b", { children: "Preislisten verwalten" }), " \u2192 Positionen direkt in die Kalkulation \u00FCbernehmen."] }), _jsxs("li", { className: rlcClass(null, li), children: [_jsx("b", { children: "Mengenberechnung" }), " mit Formeln (z.B. ", _jsx("code", { children: "12*3+5" }), ")."] }), _jsxs("li", { className: rlcClass(null, li), children: [_jsx("b", { children: "Angebot erstellen" }), " \u2192 Export als CSV oder PDF."] }), _jsxs("li", { className: rlcClass(null, li), children: [_jsx("b", { children: "KI-Unterst\u00FCtzung" }), " f\u00FCr automatische Vorschl\u00E4ge (in Entwicklung)."] })] }), _jsx("h3", { className: rlcClass(null, h3), children: "2. Mengenermittlung" }), _jsxs("ul", { children: [_jsx("li", { className: rlcClass(null, li), children: "Mengen pro Position erfassen (manuell, CAD oder KI)." }), _jsx("li", { className: rlcClass(null, li), children: "Import aus PDF / CAD / LandXML m\u00F6glich (teilweise aktiv)." }), _jsx("li", { className: rlcClass(null, li), children: "Soll-Ist Vergleich f\u00FCr Abrechnung nutzen." })] }), _jsx("h3", { className: rlcClass(null, h3), children: "3. CAD" }), _jsxs("ul", { children: [_jsx("li", { className: rlcClass(null, li), children: "Zeichnen von Linien und Polylinien mit Zoom, Snap und Layern." }), _jsx("li", { className: rlcClass(null, li), children: "Import von Daten (JSON, CSV)." }), _jsx("li", { className: rlcClass(null, li), children: "Export als SVG oder JSON." })] }), _jsx("h3", { className: rlcClass(null, h3), children: "4. B\u00FCro & Verwaltung" }), _jsxs("ul", { children: [_jsx("li", { className: rlcClass(null, li), children: "Projekte, Dokumente und Vertr\u00E4ge zentral verwalten." }), _jsx("li", { className: rlcClass(null, li), children: "Kommunikation und Aufgabenplanung integriert." })] }), _jsx("h3", { className: rlcClass(null, h3), children: "5. Buchhaltung" }), _jsxs("ul", { children: [_jsx("li", { className: rlcClass(null, li), children: "Erstellung von Rechnungen (Eingang / Ausgang)." }), _jsx("li", { className: rlcClass(null, li), children: "Zahlungs\u00FCberwachung und Mahnwesen." }), _jsx("li", { className: rlcClass(null, li), children: "Vorbereitung f\u00FCr DATEV / SAP Integration." })] }), _jsx("h3", { className: rlcClass(null, h3), children: "Tipp" }), _jsx("p", { className: "rlc-migrated-pages-info-hilfe-tsx-816", children: "Speichere h\u00E4ufig genutzte Daten und nutze die Tabellenstruktur f\u00FCr schnelle Wiederverwendung. Regelm\u00E4\u00DFige Exporte sichern deine Daten zus\u00E4tzlich." }), _jsx("button", { className: rlcClass(null, supportBtn), onClick: openSupport, children: "Support Chat" })] }));
}

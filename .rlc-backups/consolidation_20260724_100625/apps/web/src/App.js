import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// App.tsx
import React from "react";
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation, useParams, } from "react-router-dom";
import "./styles.css";
import logo from "/logo.svg";
import { ProjectProvider, useProject } from "./store/useProject";
/* =========================================================
   PROD HARDENING (Web build)
   - Disable noisy logs in production build
   - Keep warn/error for diagnostics
   ========================================================= */
const IS_PROD = import.meta?.env?.MODE === "production" ||
    import.meta?.env?.PROD === true;
if (IS_PROD) {
    // eslint-disable-next-line no-console
    console.log = () => { };
    // eslint-disable-next-line no-console
    console.debug = () => { };
    // eslint-disable-next-line no-console
    console.info = () => { };
}
/* ------------------ START / PROGETTO ------------------ */
import ProjectPage from "./pages/start/project";
import ProjektUebersicht from "./pages/start/projektUebersicht";
/* ------------------ MENGENERMITTLUNG ------------------ */
import AufmassEditor from "./pages/mengenermittlung/AufmassEditor";
import PositionLV from "./pages/mengenermittlung/PositionLV";
import AufmasseKI from "./pages/mengenermittlung/AufmasseKI";
import ImportFiles from "./pages/mengenermittlung/ImportFiles";
import AutoKI from "./pages/mengenermittlung/AutoKI";
import Regieberichte from "./pages/mengenermittlung/Regieberichte";
import ManuellFoto from "./pages/mengenermittlung/ManuellFoto";
import Lieferscheine from "./pages/mengenermittlung/Lieferscheine";
import HistoriePage from "./pages/mengenermittlung/historie";
import GPSZuweisung from "./pages/mengenermittlung/GPSZuweisung";
import SollIst from "./pages/mengenermittlung/SollIst";
import Verknuepfung from "./pages/mengenermittlung/VerknuepfungNachtraegeAbrechnung";
/* ------------------ CAD / PDF ------------------ */
import CADViewer from "./pages/cad/CADViewer";
import PDFViewer from "./pages/cad/pdfviewer";
import CadWithMap from "./pages/cad/CadWithMap";
/* ------------------ BÜRO ------------------ */
import BuroLayout from "./pages/buro";
import Projekte from "./pages/buro/projekte";
import Dokumente from "./pages/buro/dokumente";
import Vertraege from "./pages/buro/vertraege";
import Tasks from "./pages/buro/tasks";
import Kommunikation from "./pages/buro/kommunikation";
import Nutzerverwaltung from "./pages/buro/Nutzerverwaltung";
import OutlookKalender from "./pages/buro/OutlookKalender";
import Bauzeitenplan from "./pages/buro/Bauzeitenplan";
import Personalverwaltung from "./pages/buro/Personalverwaltung";
import Maschinenverwaltung from "./pages/buro/Maschinenverwaltung";
import Materialverwaltung from "./pages/buro/Materialverwaltung";
import Sicherheit from "./pages/buro/sicherheit";
import Ressourcenplanung from "./pages/buro/ressourcenplanung";
import Uebergabe from "./pages/buro/Uebergabe";
import Lager from "./pages/buro/Lager";
/* ------------------ KALKULATION ------------------ */
import LVImport from "./pages/kalkulation/lv-import";
import GaebPage from "./pages/kalkulation/gaeb";
import ImportPage from "./pages/kalkulation/ImportPage";
import KalkulationMitKI from "./pages/kalkulation/kalkulationMitKI";
import Manuell from "./pages/kalkulation/Manuell";
import NachtraegePage from "./pages/kalkulation/nachtraege";
import AngebotPage from "./pages/kalkulation/angebot";
import PreisePage from "./pages/kalkulation/preise";
import VersionsvergleichPage from "./pages/kalkulation/Versionsvergleich";
import AufschlagPage from "./pages/kalkulation/aufschlag";
import LVExportOhnePreisePage from "./pages/kalkulation/lv-export";
import CRMAngebotsverfolgungPage from "./pages/kalkulation/crm";
import Recipes from "./pages/kalkulation/Recipes";
/* ------------------ ÜBERSICHTEN ------------------ */
import KalkulationUebersicht from "./pages/kalkulation/uebersicht";
import MengenermittlungUebersicht from "./pages/mengenermittlung/Uebersicht";
import CADUebersicht from "./pages/cad/Uebersicht";
import BueroUebersicht from "./pages/buro/Uebersicht";
import KIUebersicht from "./pages/ki/Uebersicht";
import InfoUebersicht from "./pages/info/Uebersicht";
import BuchhaltungUebersicht from "./pages/buchhaltung/Uebersicht";
/* ------------------ KI ------------------ */
import KILayout from "./pages/ki/KILayout";
import KIAutoLV from "./pages/ki/AutoLV";
import KIVorschlaege from "./pages/ki/vorschlaege";
import KIFotoerkennung from "./pages/ki/Fotoerkennung";
import KISprachsteuerung from "./pages/ki/Sprachsteuerung";
import KIWidersprueche from "./pages/ki/Widersprueche";
import KIBewertungAnalyse from "./pages/ki/BewertungAnalyse";
import KIAutoAbrechnung from "./pages/ki/AutoAbrechnung";
import KIRegieAuto from "./pages/ki/RegieAuto";
import KIOptimierung from "./pages/ki/Optimierung";
import KIMaengel from "./pages/ki/Maengel";
/* ------------------ BUCHHALTUNG (LAYOUT + SUBROUTES) ------------------ */
import BuchhaltungLayout from "./pages/buchhaltung/BuchhaltungLayout";
import Uebersicht from "./pages/buchhaltung/Uebersicht";
import Kostenuebersicht from "./pages/buchhaltung/Kostenuebersicht";
import Rechnungen from "./pages/buchhaltung/rechnungen";
import Zahlungen from "./pages/buchhaltung/zahlungen";
import Eingang from "./pages/buchhaltung/eingang";
import Kassenbuch from "./pages/buchhaltung/kassenbuch";
import Kostenstellen from "./pages/buchhaltung/kostenstellen";
import Mahnwesen from "./pages/buchhaltung/mahnwesen";
import Reports from "./pages/buchhaltung/reports";
import Datev from "./pages/buchhaltung/datev";
import USt from "./pages/buchhaltung/ust";
/* ✅ Abschlagsrechnungen */
import AbschlagsrechnungenPage from "./pages/buchhaltung/Abschlagsrechnungen";
import AbschlagsrechnungDetail from "./pages/buchhaltung/AbschlagsrechnungDetail";
/* ✅ NEW: Buchhaltung → Lieferscheine (Kosten) */
import LieferscheineKosten from "./pages/buchhaltung/lieferscheine";
const SECTIONS = [
    {
        key: "kalkulation",
        title: "1. Kalkulation",
        items: [
            { key: "lv-import", label: "Leistungsverzeichnis hochladen / erstellen" },
            { key: "mit-ki", label: "Kalkulation mit KI" },
            { key: "manuell", label: "Kalkulation manuell" },
            { key: "nachtraege", label: "Nachträge erstellen" },
            { key: "angebot", label: "Angebot generieren (PDF/Excel)" },
            { key: "preise", label: "Preise einfügen (Material/Arbeiter/Maschine)" },
            { key: "lv-export", label: "LV ohne Preise exportieren" },
            { key: "gaeb", label: "GAEB Import/Export " },
            { key: "crm", label: "CRM-Schnittstelle Angebotsverfolgung" },
            { key: "versionsvergleich", label: "Versionsvergleich / Angebotsanalyse" },
            { key: "aufschlag", label: "Preisaufschlag / Rabattfunktion" },
            { key: "rezepte", label: "Kalkulation mit KI - Rezepte" },
        ],
    },
    {
        key: "mengenermittlung",
        title: "2. Mengenermittlung",
        items: [
            { key: "aufmasseditor", label: "Aufmaß-Editor" },
            { key: "position", label: "Mengenermittlung nach Position (LV-gestützt)" },
            { key: "regieberichte", label: "Regieberichte (Untersektion)" },
            { key: "manuell", label: "Manuell / per Foto / Sprache" },
            { key: "soll-ist", label: "Aufmaßvergleich: Soll-Ist" },
            { key: "auto", label: "Automatisierte Mengenermittlung" },
            { key: "lieferscheine", label: "Lieferscheine (Untersektion)" },
            { key: "verknuepfung", label: "Verknüpfung mit Nachträgen & Abrechnung" },
            { key: "historie", label: "Historie / Aufmaß-Versionierung" },
            { key: "gps", label: "GPS-basierte Positionszuweisung" },
        ],
    },
    {
        key: "cad",
        title: "3. CAD / PDF",
        items: [
            { key: "viewer", label: "CAD Viewer" },
            { key: "pdf-viewer", label: "PDF Viewer" },
        ],
    },
    {
        key: "buro",
        title: "4. Büro / Verwaltung",
        items: [
            { key: "projekte", label: "Projektverwaltung" },
            { key: "dokumente", label: "Dokumentenverwaltung (Versionierung)" },
            { key: "vertraege", label: "Vertragsverwaltung (digitale Signatur)" },
            { key: "kommunikation", label: "Kommunikation / Notizen / Aufgaben" },
            { key: "outlook", label: "Outlook / Kalender-Integration" },
            { key: "nutzerverwaltung", label: "Nutzerverwaltung & Rechte" },
            { key: "bauzeitenplan", label: "Bauzeitenplan (Gantt)" },
            { key: "personalverwaltung", label: "Personalverwaltung" },
            { key: "maschinenverwaltung", label: "Maschinenverwaltung (Wartung)" },
            { key: "materialverwaltung", label: "Materialverwaltung (Barcode/RFID)" },
            { key: "ressourcenplanung", label: "Ressourcenplanung" },
            { key: "sicherheit", label: "Sicherheit & Unterweisungen" },
            { key: "uebergabe", label: "Digitale Übergabe & Abnahmeprotokolle" },
            { key: "lager", label: "Lagerbestand & Einkauf" },
            { key: "tasks", label: "Aufgaben" },
        ],
    },
    {
        key: "ki",
        title: "5. KI",
        items: [
            { key: "auto-lv", label: "Automatische Erstellung LV" },
            { key: "vorschlaege", label: "KI-Vorschläge aus LV-Datenbank" },
            { key: "fotoerkennung", label: "Fotoerkennung (Leistung/Material/Mengen)" },
            { key: "sprachsteuerung", label: "Sprachsteuerung (Regieberichte diktieren)" },
            { key: "widersprueche", label: "Widersprüche im LV/Angebot" },
            { key: "bewertung-analyse", label: "Bewertung & Angebotsanalyse" },
            { key: "auto-abrechnung", label: "Automatische Abrechnung" },
            { key: "regie-auto", label: "Regieberichte automatisch generieren" },
            { key: "optimierung", label: "Optimierung Bauzeiten & Ressourcen" },
            { key: "maengel", label: "Mängelmanagement KI-gestützt" },
        ],
    },
    {
        key: "info",
        title: "6. Info / Hilfe / Videoerklärung",
        items: [
            { key: "guides", label: "Kurzanleitungen (pro Modul)" },
            { key: "videos", label: "Video-Tutorials" },
            { key: "glossar", label: "Glossar / Suche / Begriffe" },
            { key: "support", label: "Kontakt / Support (Chat & Tickets)" },
            { key: "updates", label: "Updates & Release Notes" },
        ],
    },
    {
        key: "buchhaltung",
        title: "7. Buchhaltung",
        items: [
            { key: "kostenuebersicht", label: "Kostenübersicht pro Projekt (live)" },
            { key: "rechnungen", label: "Rechnungen / Abschläge" },
            { key: "abschlagsrechnungen", label: "Abschlagsrechnungen" },
            { key: "zahlungen", label: "Zahlungseingänge / Offene Posten" },
            { key: "eingang", label: "Eingangsrechnungen" },
            { key: "kassenbuch", label: "Kassenbuch" },
            { key: "kostenstellen", label: "Projekt-Kostenstellenstruktur" },
            { key: "mahnwesen", label: "Mahnwesen" },
            { key: "reports", label: "Dokumente & Belege verwalten" },
            { key: "datev", label: "DATEV / Lexware / SAP Export" },
            { key: "ust", label: "USt.-Übersicht" },
            { key: "lieferscheine", label: "Lieferscheine (Kosten)" },
        ],
    },
];
/* ------------------ MAPPA ÜBERSICHT ------------------ */
const OVERVIEW = {
    kalkulation: _jsx(KalkulationUebersicht, {}),
    mengenermittlung: _jsx(MengenermittlungUebersicht, {}),
    cad: _jsx(CADUebersicht, {}),
    buro: _jsx(BueroUebersicht, {}),
    ki: _jsx(KIUebersicht, {}),
    info: _jsx(InfoUebersicht, {}),
    buchhaltung: _jsx(BuchhaltungUebersicht, {}),
};
/* ------------------ SIDENAV (accordion) ------------------ */
function SideNav() {
    const { pathname } = useLocation();
    const currentSectionKey = pathname.split("/")[1] || "";
    const [open, setOpen] = React.useState({});
    React.useEffect(() => {
        if (currentSectionKey)
            setOpen((o) => ({ ...o, [currentSectionKey]: true }));
    }, [currentSectionKey]);
    const toggle = (key) => setOpen((o) => ({ ...o, [key]: !o[key] }));
    const topItems = [
        { to: "/start", label: "Start (Projekt auswählen)" },
        { to: "/projekt/uebersicht", label: "Projekt-Übersicht" },
    ];
    return (_jsxs("div", { className: "card", children: [_jsx("div", { className: "s-title", children: "Projekt" }), _jsx("div", { className: "s-sub", style: { paddingBottom: 8 }, children: topItems.map((it) => (_jsx(Link, { to: it.to, className: `s-link ${pathname === it.to ? "active" : ""}`, children: it.label }, it.to))) }), _jsx("div", { className: "hr" }), _jsx("div", { className: "s-title", children: "RLC \u2013 Module" }), _jsx("ul", { className: "s-accordion", children: SECTIONS.map((s) => {
                    const isOpen = !!open[s.key];
                    return (_jsxs("li", { className: `s-sec ${isOpen ? "open" : ""}`, children: [_jsxs("button", { onClick: () => toggle(s.key), "aria-expanded": isOpen, children: [_jsxs("span", { className: "s-sec-title", children: [_jsx("span", { className: "s-badge", children: s.title.split(".")[0] }), _jsx("span", { children: s.title.replace(/^\d+\.\s*/, "") })] }), _jsx("span", { className: "chev", children: "\u25B6" })] }), isOpen && (_jsxs("div", { className: "s-sub", children: [_jsx(Link, { className: `s-link ${pathname === `/${s.key}` ? "active" : ""}`, to: `/${s.key}`, children: "\u00DCbersicht" }), s.items.map((it) => {
                                        const active = pathname === `/${s.key}/${it.key}`;
                                        return (_jsx(Link, { className: `s-link ${active ? "active" : ""}`, to: `/${s.key}/${it.key}`, children: it.label }, it.key));
                                    })] }))] }, s.key));
                }) })] }));
}
/* ------------------ CURRENT PROJECT BAR ------------------ */
function CurrentProjectBar() {
    const { pathname } = useLocation();
    const ctx = useProject();
    if (pathname.startsWith("/start"))
        return null;
    const cur = ctx?.currentProject || ctx?.selectedProject || null;
    if (!cur) {
        return (_jsxs("div", { className: "card", style: { marginBottom: 12, padding: "8px 12px", fontSize: 13 }, children: ["Kein Projekt gew\u00E4hlt. Bitte zuerst unter", " ", _jsx("b", { children: "Start (Projekt ausw\u00E4hlen)" }), " ein Projekt ausw\u00E4hlen."] }));
    }
    return (_jsxs("div", { className: "card", style: {
            marginBottom: 12,
            padding: "8px 12px",
            fontSize: 13,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#F9FAFB",
        }, children: [_jsxs("div", { children: [_jsx("span", { style: { fontWeight: 700 }, children: cur.code }), " \u2013 ", cur.name, cur.client ? _jsxs(_Fragment, { children: [" \u2022 ", cur.client] }) : null, cur.place ? _jsxs(_Fragment, { children: [" \u2022 ", cur.place] }) : null] }), _jsx(Link, { to: "/projekt/uebersicht", className: "link", style: { fontSize: 12 }, children: "Zur Projekt-\u00DCbersicht \u2192" })] }));
}
/* ------------------ PAGINE NEUTRE ------------------ */
function SectionList({ sectionKey }) {
    const s = SECTIONS.find((x) => x.key === sectionKey);
    if (!s)
        return _jsx("div", { className: "card", children: "Unbekannte Sektion." });
    return (_jsxs("div", { className: "card", children: [_jsxs("div", { className: "breadcrumbs", children: [_jsx("span", { children: "RLC" }), _jsx("span", { className: "sep", children: "/" }), _jsx("span", { children: s.title })] }), _jsx("div", { className: "h1", children: s.title }), _jsxs("div", { className: "empty", children: [_jsx("h3", { children: "\u00DCbersicht" }), _jsx("p", { children: "W\u00E4hle links eine Untersektion." })] })] }));
}
function SubsectionEmpty() {
    const { section, sub } = useParams();
    const s = SECTIONS.find((x) => x.key === section);
    const it = s?.items.find((i) => i.key === sub);
    return (_jsxs("div", { className: "card", children: [_jsxs("div", { className: "breadcrumbs", children: [_jsx(Link, { className: "link", to: "/", children: "RLC" }), _jsx("span", { className: "sep", children: "/" }), s ? (_jsx(Link, { className: "link", to: `/${s.key}`, children: s.title })) : (_jsx("span", { children: "Unbekannt" })), _jsx("span", { className: "sep", children: "/" }), _jsx("span", { children: it?.label ?? sub })] }), _jsx("div", { className: "h1", children: it?.label ?? sub }), _jsx("div", { className: "empty", children: _jsx("h3", { children: "Diese Untersektion ist noch leer" }) })] }));
}
/* ------------------ APP ------------------ */
export default function App() {
    return (_jsx(ProjectProvider, { children: _jsx(BrowserRouter, { children: _jsxs("div", { className: "app", children: [_jsx("div", { className: "header", children: _jsxs(Link, { to: "/", className: "brand", style: { display: "flex", alignItems: "center", gap: 8 }, children: [_jsx("img", { src: logo, alt: "RLC Logo", style: { height: 200 } }), "-Tiefbau -Hochbau -Planungsb\u00FCro -Vermessung"] }) }), _jsxs("div", { className: "layout", children: [_jsx(SideNav, {}), _jsxs("div", { className: "content", children: [_jsx(CurrentProjectBar, {}), _jsxs(Routes, { children: [_jsx(Route, { path: "/start", element: _jsx(ProjectPage, {}) }), _jsx(Route, { path: "/projekt/uebersicht", element: _jsx(ProjektUebersicht, {}) }), SECTIONS.map((s) => (_jsx(Route, { path: `/${s.key}`, element: OVERVIEW[s.key] ?? _jsx(SectionList, { sectionKey: s.key }) }, s.key))), _jsx(Route, { path: "/mengenermittlung/aufmasseditor", element: _jsx(AufmassEditor, {}) }), _jsx(Route, { path: "/mengenermittlung/position", element: _jsx(PositionLV, {}) }), _jsx(Route, { path: "/mengenermittlung/manuell", element: _jsx(ManuellFoto, {}) }), _jsx(Route, { path: "/mengenermittlung/aufmasse", element: _jsx(AufmasseKI, {}) }), _jsx(Route, { path: "/mengenermittlung/import", element: _jsx(ImportFiles, {}) }), _jsx(Route, { path: "/mengenermittlung/soll-ist", element: _jsx(SollIst, {}) }), _jsx(Route, { path: "/mengenermittlung/auto", element: _jsx(AutoKI, {}) }), _jsx(Route, { path: "/mengenermittlung/regieberichte", element: _jsx(Regieberichte, {}) }), _jsx(Route, { path: "/mengenermittlung/lieferscheine", element: _jsx(Lieferscheine, {}) }), _jsx(Route, { path: "/mengenermittlung/historie", element: _jsx(HistoriePage, {}) }), _jsx(Route, { path: "/mengenermittlung/gps", element: _jsx(GPSZuweisung, {}) }), _jsx(Route, { path: "/mengenermittlung/GPSZuweisung", element: _jsx(Navigate, { to: "/mengenermittlung/gps", replace: true }) }), _jsx(Route, { path: "/mengenermittlung/verknuepfung", element: _jsx(Verknuepfung, {}) }), _jsx(Route, { path: "/buro/projekte", element: _jsx(BuroLayout, { children: _jsx(Projekte, {}) }) }), _jsx(Route, { path: "/buro/dokumente", element: _jsx(BuroLayout, { children: _jsx(Dokumente, {}) }) }), _jsx(Route, { path: "/buro/kommunikation", element: _jsx(BuroLayout, { children: _jsx(Kommunikation, {}) }) }), _jsx(Route, { path: "/buro/vertraege", element: _jsx(BuroLayout, { children: _jsx(Vertraege, {}) }) }), _jsx(Route, { path: "/buro/outlook", element: _jsx(OutlookKalender, {}) }), _jsx(Route, { path: "/buro/nutzerverwaltung", element: _jsx(Nutzerverwaltung, {}) }), _jsx(Route, { path: "/buro/bauzeitenplan", element: _jsx(Bauzeitenplan, {}) }), _jsx(Route, { path: "/buro/personalverwaltung", element: _jsx(Personalverwaltung, {}) }), _jsx(Route, { path: "/buro/maschinenverwaltung", element: _jsx(Maschinenverwaltung, {}) }), _jsx(Route, { path: "/buro/materialverwaltung", element: _jsx(Materialverwaltung, {}) }), _jsx(Route, { path: "/buro/ressourcenplanung", element: _jsx(Ressourcenplanung, {}) }), _jsx(Route, { path: "/buro/sicherheit", element: _jsx(Sicherheit, {}) }), _jsx(Route, { path: "/buro/uebergabe", element: _jsx(Uebergabe, {}) }), _jsx(Route, { path: "/buro/lager", element: _jsx(Lager, {}) }), _jsx(Route, { path: "/buro/tasks", element: _jsx(BuroLayout, { children: _jsx(Tasks, {}) }) }), _jsx(Route, { path: "/kalkulation/lv-import", element: _jsx(LVImport, {}) }), _jsx(Route, { path: "/kalkulation/gaeb", element: _jsx(GaebPage, {}) }), _jsx(Route, { path: "/import", element: _jsx(ImportPage, {}) }), _jsx(Route, { path: "/kalkulation/mit-ki", element: _jsx(KalkulationMitKI, {}) }), _jsx(Route, { path: "/kalkulation/manuell", element: _jsx(Manuell, {}) }), _jsx(Route, { path: "/kalkulation/nachtraege", element: _jsx(NachtraegePage, {}) }), _jsx(Route, { path: "/kalkulation/angebot", element: _jsx(AngebotPage, {}) }), _jsx(Route, { path: "/kalkulation/preise", element: _jsx(PreisePage, {}) }), _jsx(Route, { path: "/kalkulation/versionsvergleich", element: _jsx(VersionsvergleichPage, {}) }), _jsx(Route, { path: "/kalkulation/aufschlag", element: _jsx(AufschlagPage, {}) }), _jsx(Route, { path: "/kalkulation/lv-export", element: _jsx(LVExportOhnePreisePage, {}) }), _jsx(Route, { path: "/kalkulation/crm", element: _jsx(CRMAngebotsverfolgungPage, {}) }), _jsx(Route, { path: "/kalkulation", element: _jsx(KalkulationUebersicht, {}) }), _jsx(Route, { path: "/kalkulation/rezepte", element: _jsx(Recipes, {}) }), _jsx(Route, { path: "/cad/viewer", element: _jsx(CADViewer, {}) }), _jsx(Route, { path: "/cad/pdf-viewer", element: _jsx(PDFViewer, {}) }), _jsx(Route, { path: "/cad/map", element: _jsx(CadWithMap, {}) }), _jsxs(Route, { path: "/ki", element: _jsx(KILayout, {}), children: [_jsx(Route, { path: "auto-lv", element: _jsx(KIAutoLV, {}) }), _jsx(Route, { path: "vorschlaege", element: _jsx(KIVorschlaege, {}) }), _jsx(Route, { path: "fotoerkennung", element: _jsx(KIFotoerkennung, {}) }), _jsx(Route, { path: "sprachsteuerung", element: _jsx(KISprachsteuerung, {}) }), _jsx(Route, { path: "widersprueche", element: _jsx(KIWidersprueche, {}) }), _jsx(Route, { path: "bewertung-analyse", element: _jsx(KIBewertungAnalyse, {}) }), _jsx(Route, { path: "auto-abrechnung", element: _jsx(KIAutoAbrechnung, {}) }), _jsx(Route, { path: "regie-auto", element: _jsx(KIRegieAuto, {}) }), _jsx(Route, { path: "optimierung", element: _jsx(KIOptimierung, {}) }), _jsx(Route, { path: "maengel", element: _jsx(KIMaengel, {}) })] }), _jsxs(Route, { path: "/buchhaltung/*", element: _jsx(BuchhaltungLayout, {}), children: [_jsx(Route, { index: true, element: _jsx(Uebersicht, {}) }), _jsx(Route, { path: "kostenuebersicht", element: _jsx(Kostenuebersicht, {}) }), _jsx(Route, { path: "rechnungen", element: _jsx(Rechnungen, {}) }), _jsx(Route, { path: "abschlagsrechnungen", element: _jsx(AbschlagsrechnungenPage, {}) }), _jsx(Route, { path: "abschlagsrechnungen/:id", element: _jsx(AbschlagsrechnungDetail, {}) }), _jsx(Route, { path: "zahlungen", element: _jsx(Zahlungen, {}) }), _jsx(Route, { path: "eingang", element: _jsx(Eingang, {}) }), _jsx(Route, { path: "kassenbuch", element: _jsx(Kassenbuch, {}) }), _jsx(Route, { path: "kostenstellen", element: _jsx(Kostenstellen, {}) }), _jsx(Route, { path: "mahnwesen", element: _jsx(Mahnwesen, {}) }), _jsx(Route, { path: "reports", element: _jsx(Reports, {}) }), _jsx(Route, { path: "datev", element: _jsx(Datev, {}) }), _jsx(Route, { path: "ust", element: _jsx(USt, {}) }), _jsx(Route, { path: "lieferscheine", element: _jsx(LieferscheineKosten, {}) })] }), _jsx(Route, { path: "/KI", element: _jsx(Navigate, { to: "/ki", replace: true }) }), _jsx(Route, { path: "/:section/:sub", element: _jsx(SubsectionEmpty, {}) }), _jsx(Route, { path: "/", element: _jsx(Navigate, { to: "/kalkulation", replace: true }) }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/start", replace: true }) })] })] })] })] }) }) }));
}

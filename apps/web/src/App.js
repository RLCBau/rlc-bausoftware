import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation, useParams, Outlet } from "react-router-dom";
import "./styles.css";
import "./rlc-web-system.css";
import "./rlc-inline-migrated.css";
import { ProjectProvider } from "./store/useProject";
import RlcKiAssistant from "./components/RlcKiAssistant";
import RlcGlobalProgress from "./components/RlcGlobalProgress";
import DocumentDeliveryCenter from "./components/document-delivery/DocumentDeliveryCenter";
import Kalkulationszentrale from "./pages/kalkulation/Kalkulationszentrale";
/* ------------------ AUTH ------------------ */
const Login = React.lazy(() => import("./pages/auth/Login"));
const PricingPage = React.lazy(() => import("./pages/site/PricingPage"));
/* ------------------ START / PROJEKT ------------------ */
const ProjectPage = React.lazy(() => import("./pages/start/project"));
const ProjektUebersicht = React.lazy(() => import("./pages/start/projektUebersicht"));
/* ------------------ MENGENERMITTLUNG ------------------ */
const AufmassEditor = React.lazy(() => import("./pages/mengenermittlung/AufmassEditor"));
const AutoKI = React.lazy(() => import("./pages/mengenermittlung/AutoKI"));
const Regieberichte = React.lazy(() => import("./pages/mengenermittlung/Regieberichte"));
const Tagesberichte = React.lazy(() => import("./pages/buro/Tagesberichte"));
const Bautagebuch = React.lazy(() => import("./pages/buro/Bautagebuch"));
const Lieferscheine = React.lazy(() => import("./pages/mengenermittlung/lieferscheine"));
const ProjektakteFotos = React.lazy(() => import("./pages/buro/ProjektakteFotos"));
const HistoriePage = React.lazy(() => import("./pages/mengenermittlung/historie"));
const GPSZuweisung = React.lazy(() => import("./pages/mengenermittlung/GPSZuweisung"));
const SollIst = React.lazy(() => import("./pages/mengenermittlung/SollIst"));
const BilderZumAufmass = React.lazy(() => import("./pages/mengenermittlung/bilder"));
const Abrechnungskreise = React.lazy(() => import("./pages/mengenermittlung/abrechnungskreise"));
/* ------------------ CAD ------------------ */
/* APP_REMOVE_OBSOLETE_CAD_ROUTES_V15_22_1 */
const CADViewer = React.lazy(() => import("./pages/cad/CADViewer"));
const AsBuilt = React.lazy(() => import("./pages/cad/asbuild"));
/* ------------------ BÜRO ------------------ */
const BuroLayout = React.lazy(() => import("./pages/buro"));
const Projekte = React.lazy(() => import("./pages/buro/projekte"));
const Dokumente = React.lazy(() => import("./pages/buro/dokumente"));
const Vertraege = React.lazy(() => import("./pages/buro/vertraege"));
const Tasks = React.lazy(() => import("./pages/buro/tasks"));
const Kommunikation = React.lazy(() => import("./pages/buro/kommunikation"));
const Nutzerverwaltung = React.lazy(() => import("./pages/buro/Nutzerverwaltung"));
const OutlookKalender = React.lazy(() => import("./pages/buro/outlookKalender"));
const Bauzeitenplan = React.lazy(() => import("./pages/buro/bauzeitenplan"));
const Personalverwaltung = React.lazy(() => import("./pages/buro/personalverwaltung"));
const Maschinenverwaltung = React.lazy(() => import("./pages/buro/maschinenverwaltung"));
const Materialverwaltung = React.lazy(() => import("./pages/buro/materialverwaltung"));
const Sicherheit = React.lazy(() => import("./pages/buro/sicherheit"));
const Ressourcenplanung = React.lazy(() => import("./pages/buro/ressourcenplanung"));
const Uebergabe = React.lazy(() => import("./pages/buro/uebergabe"));
const Lager = React.lazy(() => import("./pages/buro/lager"));
const VorlagenCenter = React.lazy(() => import("./pages/buro/VorlagenCenter"));
/* ------------------ KALKULATION ------------------ */
const LVImport = React.lazy(() => import("./pages/kalkulation/lv-import"));
const GaebPage = React.lazy(() => import("./pages/kalkulation/gaeb"));
const ImportPage = React.lazy(() => import("./pages/kalkulation/ImportPage"));
const KalkulationMitKI = React.lazy(() => import("./pages/kalkulation/kalkulationMitKI"));
const KalkulationsDatenbankPage = React.lazy(() => import("./pages/kalkulation/kalkulationsDatenbankPage"));
const KalkulationsDatenbankPositionPage = React.lazy(() => import("./pages/kalkulation/KalkulationsDatenbankPositionPage"));
const NachtraegePage = React.lazy(() => import("./pages/kalkulation/nachtraege"));
const AngebotPage = React.lazy(() => import("./pages/kalkulation/angebot"));
const PreisePage = React.lazy(() => import("./pages/kalkulation/preise"));
const VersionsvergleichPage = React.lazy(() => import("./pages/kalkulation/Versionsvergleich"));
const CRMAngebotsverfolgungPage = React.lazy(() => import("./pages/kalkulation/crm"));
const Recipes = React.lazy(() => import("./pages/kalkulation/Recipes"));
/* ------------------ ÜBERSICHTEN ------------------ */
const KalkulationUebersicht = React.lazy(() => import("./pages/kalkulation/Uebersicht"));
const MengenermittlungUebersicht = React.lazy(() => import("./pages/mengenermittlung/Uebersicht"));
const BueroUebersicht = React.lazy(() => import("./pages/buro/Uebersicht"));
const KIUebersicht = React.lazy(() => import("./pages/ki/Uebersicht"));
const InfoUebersicht = React.lazy(() => import("./pages/info/Uebersicht"));
const BuchhaltungUebersicht = React.lazy(() => import("./pages/buchhaltung/Uebersicht"));
const MobileUebersicht = React.lazy(() => import("./pages/mobile/Uebersicht"));
const MobilePruefung = React.lazy(() => import("./pages/mobile/Pruefung"));
const MobileArbeitszeiten = React.lazy(() => import("./pages/mobile/Arbeitszeiten"));
const MobileMitarbeiterEingaenge = React.lazy(() => import("./pages/mobile/MitarbeiterEingaenge"));
/* ------------------ INFO ------------------ */
const Hilfe = React.lazy(() => import("./pages/info/hilfe"));
const FAQ = React.lazy(() => import("./pages/info/faq"));
const Shortcuts = React.lazy(() => import("./pages/info/shortcuts"));
const Changelog = React.lazy(() => import("./pages/info/changelog"));
const Systemstatus = React.lazy(() => import("./pages/info/system"));
const Updates = React.lazy(() => import("./pages/info/updates"));
const Datenschutz = React.lazy(() => import("./pages/info/datenschutz"));
const Impressum = React.lazy(() => import("./pages/info/impressum"));
const Support = React.lazy(() => import("./pages/info/support"));
const Ueber = React.lazy(() => import("./pages/info/ueber"));
/* ------------------ KI ------------------ */
const KILayout = React.lazy(() => import("./pages/ki/KILayout"));
const KIFotoerkennung = React.lazy(() => import("./pages/ki/Fotoerkennung"));
const KISprachsteuerung = React.lazy(() => import("./pages/ki/Sprachsteuerung"));
const KIAutoAbrechnung = React.lazy(() => import("./pages/ki/AutoAbrechnung"));
const KIRegieAuto = React.lazy(() => import("./pages/ki/RegieAuto"));
const KIOptimierung = React.lazy(() => import("./pages/ki/Optimierung"));
const KIMaengel = React.lazy(() => import("./pages/ki/Maengel"));
/* ------------------ BUCHHALTUNG ------------------ */
const BuchhaltungLayout = React.lazy(() => import("./pages/buchhaltung/BuchhaltungLayout"));
const Uebersicht = React.lazy(() => import("./pages/buchhaltung/Uebersicht"));
const Kostenuebersicht = React.lazy(() => import("./pages/buchhaltung/Kostenuebersicht"));
const Rechnungen = React.lazy(() => import("./pages/buchhaltung/rechnungen"));
const Zahlungen = React.lazy(() => import("./pages/buchhaltung/zahlungen"));
const Eingang = React.lazy(() => import("./pages/buchhaltung/eingang"));
const Kassenbuch = React.lazy(() => import("./pages/buchhaltung/kassenbuch"));
const Kostenstellen = React.lazy(() => import("./pages/buchhaltung/kostenstellen"));
const Mahnwesen = React.lazy(() => import("./pages/buchhaltung/mahnwesen"));
const Reports = React.lazy(() => import("./pages/buchhaltung/reports"));
const Datev = React.lazy(() => import("./pages/buchhaltung/datev"));
const USt = React.lazy(() => import("./pages/buchhaltung/ust"));
const AbschlagsrechnungenPage = React.lazy(() => import("./pages/buchhaltung/Abschlagsrechnungen"));
const AbschlagsrechnungDetail = React.lazy(() => import("./pages/buchhaltung/AbschlagsrechnungDetail"));
const LieferscheineKosten = React.lazy(() => import("./pages/buchhaltung/lieferscheine"));
function RouteLoadingFallback() {
    return (_jsx("div", { className: "card rlc-migrated-app-tsx-1", children: "RLC l\u00E4dt\u2026" }));
}
/* =========================================================
   PROD HARDENING
   ========================================================= */
const IS_PROD = import.meta?.env?.MODE === "production" ||
    import.meta?.env?.PROD === true;
const logo = "/logo.svg";
if (IS_PROD) {
    console.log = () => { };
    console.debug = () => { };
    console.info = () => { };
}
/* ------------------ AUTH HELPERS ------------------ */
function readJsonSafe(raw, fallback) {
    if (!raw)
        return fallback;
    try {
        return JSON.parse(raw);
    }
    catch {
        return fallback;
    }
}
function getAuthToken() {
    if (typeof window === "undefined")
        return null;
    const keys = [
        "rlc_token",
        "token",
        "authToken",
        "accessToken",
        "rlc.auth.token",
        "rlc_mobile_token"
    ];
    for (const key of keys) {
        const v = localStorage.getItem(key);
        if (v && String(v).trim())
            return String(v).trim();
    }
    const authObj = readJsonSafe(localStorage.getItem("rlc_auth"), null);
    if (authObj?.token)
        return String(authObj.token);
    if (authObj?.accessToken)
        return String(authObj.accessToken);
    return null;
}
function isPublicPath(pathname) {
    return pathname === "/" || pathname === "/preise" || pathname === "/login";
}
function RequireAuth({ children }) {
    const location = useLocation();
    const token = getAuthToken();
    if (!token) {
        return (_jsx(Navigate, { to: "/login", replace: true, state: { from: `${location.pathname}${location.search}${location.hash}` } }));
    }
    return children;
}
const SECTIONS = [
    {
        key: "kalkulation",
        title: "1. Kalkulation",
        items: [
            { key: "kalkulationszentrale", label: "Kalkulationszentrale" }, { key: "lv-import", label: "LV / Positionen" },
            { key: "mit-ki", label: "Kalkulation" },
            { key: "datenbank", label: "Kalkulationsdatenbank" },
            { key: "versionsvergleich", label: "Versionsvergleich / Analyse" },
            { key: "crm", label: "CRM / Angebotsverfolgung" }
        ]
    },
    {
        key: "mengenermittlung",
        title: "2. Mengenermittlung",
        items: [{ key: "aufmasseditor", label: "Aufmaß-Editor" },
            { key: "soll-ist", label: "Aufmaßvergleich: Soll-Ist" },
            { key: "auto", label: "KI-Mengenermittlung aus Plan / Foto" },
            { key: "historie", label: "Aufmaß-Historie" },
            { key: "gps", label: "GPS-basierte Positionszuweisung" },
            { key: "bilder", label: "Bilder zum Aufmaß" },]
    },
    {
        key: "cad",
        title: "3. CAD / Geo",
        items: [
            { key: "viewer", label: "CAD/Geo" }
        ]
    },
    {
        key: "buro",
        title: "4. Büro / Verwaltung",
        items: [
            { key: "projekte", label: "Projektverwaltung" },
            { key: "regieberichte", label: "Regieberichte" },
            { key: "lieferscheine", label: "Lieferscheine" },
            { key: "fotos", label: "Projektakte / Fotos" },
            { key: "tagesberichte", label: "Tagesberichte" },
            { key: "bautagebuch", label: "Bautagebuch" },
            { key: "arbeitszeiten", label: "Arbeitszeiten" },
            { key: "angebote", label: "Angebote" },
            { key: "vorlagen", label: "Vorlagen-Center" },
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
            { key: "ki-sprachsteuerung", label: "Sprachsteuerung für Regieberichte" },
            { key: "ki-regie-auto", label: "Regieberichte automatisch generieren" },
            { key: "ki-optimierung", label: "Optimierung Bauzeiten & Ressourcen" },
            { key: "ki-maengel", label: "Mängelmanagement KI-gestützt" }
        ]
    },
    {
        key: "info",
        title: "6. Info / Hilfe / Videoerklärung",
        items: [
            { key: "hilfe", label: "Hilfe / Anleitungen" },
            { key: "faq", label: "FAQ" },
            { key: "shortcuts", label: "Tastenkürzel" },
            { key: "changelog", label: "Changelog" },
            { key: "system", label: "Systemstatus" },
            { key: "updates", label: "Updates" },
            { key: "datenschutz", label: "Datenschutz" },
            { key: "impressum", label: "Impressum" },
            { key: "support", label: "Support / Feedback" },
            { key: "ueber", label: "Über die App" }
        ]
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
            { key: "lieferscheine", label: "Lieferscheine (Kosten)" }
        ]
    },
    {
        key: "mobile",
        title: "8. Mobile",
        items: [
            { key: "regieberichte", label: "Regieberichte" },
            { key: "lieferscheine", label: "Lieferscheine" },
            { key: "fotos", label: "Fotos / Notizen" },
            { key: "tagesberichte", label: "Tagesberichte" },
            { key: "bautagebuch", label: "Bautagebuch" },
            { key: "arbeitszeiten", label: "Arbeitszeiten" },
            { key: "mengenermittlung", label: "Mengenermittlung" },
            { key: "kalkulation", label: "Kalkulation" },
            { key: "angebote", label: "Angebote" },
            { key: "abschlagsrechnungen", label: "Abschlagsrechnungen" },
            { key: "rechnungen", label: "Rechnungen" },
            { key: "outlier-reports", label: "Outlier Reports" }
        ]
    }
];
/* ------------------ ÜBERSICHT MAP ------------------ */
const OVERVIEW = {
    kalkulation: _jsx(Navigate, { to: "/kalkulation/kalkulationszentrale", replace: true }),
    mengenermittlung: _jsx(MengenermittlungUebersicht, {}),
    cad: _jsx(Navigate, { to: "/cad/viewer", replace: true }),
    buro: _jsx(BueroUebersicht, {}),
    ki: _jsx(KIUebersicht, {}),
    info: _jsx(InfoUebersicht, {}),
    buchhaltung: _jsx(BuchhaltungUebersicht, {}),
    mobile: _jsx(MobileUebersicht, {})
};
/* ------------------ CAD FALLBACKS ------------------ */
function CadLayout() {
    return _jsx(Outlet, {});
}
function CADTools() {
    return (_jsxs("div", { className: "card", children: [_jsxs("div", { className: "breadcrumbs", children: [_jsx(Link, { className: "link", to: "/start", children: "RLC" }), _jsx("span", { className: "sep", children: "/" }), _jsx(Link, { className: "link", to: "/cad", children: "3. CAD / PDF" }), _jsx("span", { className: "sep", children: "/" }), _jsx("span", { children: "Layer & Eigenschaften" })] }), _jsx("div", { className: "h1", children: "Layer & Eigenschaften" }), _jsxs("div", { className: "empty", children: [_jsx("h3", { children: "CAD-Werkzeuge" }), _jsxs("p", { children: ["Diese Ansicht ist als Fallback aktiv, weil die fr\u00FChere separate", " ", _jsx("code", { children: "CADTools.tsx" }), " Datei aktuell nicht vorhanden ist."] }), _jsx("p", { children: "Die Route bleibt damit funktionsf\u00E4hig und der Build bricht nicht ab." })] })] }));
}
/* ------------------ TOPNAV ------------------ */
function topNavLabel(title) {
    const clean = title.replace(/^\d+\.\s*/, "").trim();
    if (clean === "Mengenermittlung")
        return "Mengen";
    if (clean === "Büro / Verwaltung")
        return "Verwaltung";
    if (clean === "Info / Hilfe / Videoerklärung")
        return "Hilfe";
    if (clean === "CAD / Geo")
        return "CAD/Geo";
    return clean;
}
function SideNav() {
    const { pathname } = useLocation();
    const [openMenu, setOpenMenu] = React.useState(null);
    const topItems = [
        { to: "/start", label: "Projekte öffnen / neu erstellen" },
        { to: "/projekt/uebersicht", label: "Projekt Übersicht" }
    ];
    return (_jsxs("nav", { className: "rlc-top-nav", "aria-label": "Hauptnavigation", children: [topItems.map((item) => _jsx(Link, { to: item.to, className: `rlc-top-nav-button ${pathname === item.to ? "active" : ""}`, onClick: () => setOpenMenu(null), children: item.label }, item.to)), SECTIONS.map((section) => {
                const activeSection = pathname === `/${section.key}` || pathname.startsWith(`/${section.key}/`);
                const isOpen = openMenu === section.key;
                return (_jsxs("div", { className: `rlc-top-nav-group ${isOpen ? "is-open" : ""}`, children: [_jsxs("button", { type: "button", className: `rlc-top-nav-button ${activeSection ? "active" : ""}`, "aria-expanded": isOpen, onClick: () => setOpenMenu(isOpen ? null : section.key), children: [topNavLabel(section.title), " \u25BC"] }), isOpen ?
                            _jsxs("div", { className: "rlc-top-nav-dropdown", children: [section.key !== "cad" ? (_jsx(Link, { className: `s-link ${pathname === `/${section.key}` ? "active" : ""}`, to: `/${section.key}`, onClick: () => setOpenMenu(null), children: "\u00DCbersicht" })) : null, section.items.map((item) => {
                                        const to = `/${section.key}/${item.key}`;
                                        const active = pathname === to;
                                        return (_jsx(Link, { className: `s-link ${active ? "active" : ""}`, to: to, onClick: () => setOpenMenu(null), children: item.label }, item.key));
                                    })] }) :
                            null] }, section.key));
            })] }));
}
/* ------------------ EMPTY PAGES ------------------ */
function SectionList({ sectionKey }) {
    const section = SECTIONS.find((x) => x.key === sectionKey);
    if (!section)
        return _jsx("div", { className: "card", children: "Unbekannte Sektion." });
    return (_jsxs("div", { className: "card", children: [_jsxs("div", { className: "breadcrumbs", children: [_jsx("span", { children: "RLC" }), _jsx("span", { className: "sep", children: "/" }), _jsx("span", { children: section.title })] }), _jsx("div", { className: "h1", children: section.title }), _jsxs("div", { className: "empty", children: [_jsx("h3", { children: "\u00DCbersicht" }), _jsx("p", { children: "W\u00E4hle links eine Untersektion." })] })] }));
}
function SubsectionEmpty() {
    const { section, sub } = useParams();
    const foundSection = SECTIONS.find((x) => x.key === section);
    const foundItem = foundSection?.items.find((x) => x.key === sub);
    return (_jsxs("div", { className: "card", children: [_jsxs("div", { className: "breadcrumbs", children: [_jsx(Link, { className: "link", to: "/start", children: "RLC" }), _jsx("span", { className: "sep", children: "/" }), foundSection ?
                        _jsx(Link, { className: "link", to: `/${foundSection.key}`, children: foundSection.title }) :
                        _jsx("span", { children: "Unbekannt" }), _jsx("span", { className: "sep", children: "/" }), _jsx("span", { children: foundItem?.label ?? sub })] }), _jsx("div", { className: "h1", children: foundItem?.label ?? sub }), _jsx("div", { className: "empty", children: _jsx("h3", { children: "Diese Untersektion ist noch leer" }) })] }));
}
/* ------------------ SHELL ------------------ */
function AppShell() {
    const { pathname } = useLocation();
    if (isPublicPath(pathname)) {
        return (_jsx("div", { className: "app rlc-app-shell", children: _jsx(React.Suspense, { fallback: _jsx(RouteLoadingFallback, {}), children: _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(PricingPage, {}) }), _jsx(Route, { path: "/preise", element: _jsx(PricingPage, {}) }), _jsx(Route, { path: "/login", element: _jsx(Login, {}) }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/", replace: true }) })] }) }) }));
    }
    return (_jsx(RequireAuth, { children: _jsxs("div", { className: "app rlc-app-shell", children: [_jsxs("div", { className: "header rlc-topbar rlc-migrated-app-tsx-7", children: [_jsxs(Link, { to: "/start", className: "brand rlc-brand", "aria-label": "RLC Bausoftware \u2013 Startseite", children: [_jsx("span", { className: "rlc-brand-mark", "aria-hidden": "true", children: _jsxs("svg", { viewBox: "0 0 48 48", role: "presentation", children: [_jsx("path", { className: "rlc-brand-mark-frame", d: "M24 3 42 13.5v21L24 45 6 34.5v-21L24 3Z" }), _jsx("path", { className: "rlc-brand-mark-line", d: "m14 18 10-6 10 6-10 6-10-6Zm0 0v12l10 6 10-6V18M24 24v12" })] }) }), _jsxs("span", { className: "rlc-brand-copy", children: [_jsx("span", { className: "rlc-brand-title", children: "RLC Bausoftware" }), _jsx("span", { className: "rlc-brand-subtitle", children: "Bau \u00B7 Kalkulation \u00B7 Vermessung" })] })] }), _jsx(SideNav, {})] }), _jsx("div", { className: "layout rlc-migrated-app-tsx-9", children: _jsx("div", { className: `${`content rlc-content ${pathname.startsWith("/mengenermittlung") ? "meng-theme" : ""}`} rlc-migrated-app-tsx-10`, children: _jsx(React.Suspense, { fallback: _jsx(RouteLoadingFallback, {}), children: _jsxs(Routes, { children: [_jsx(Route, { path: "/login", element: _jsx(Navigate, { to: "/start", replace: true }) }), _jsx(Route, { path: "/start", element: _jsx(ProjectPage, {}) }), _jsx(Route, { path: "/projekt/auswahl", element: _jsx(ProjectPage, {}) }), _jsx(Route, { path: "/projektauswahl", element: _jsx(ProjectPage, {}) }), _jsx(Route, { path: "/projekt/uebersicht", element: _jsx(ProjektUebersicht, {}) }), SECTIONS.filter((section) => section.key !== "ki" &&
                                        section.key !== "buchhaltung" &&
                                        section.key !== "cad").map((section) => _jsx(Route, { path: `/${section.key}`, element: OVERVIEW[section.key] ?? _jsx(SectionList, { sectionKey: section.key }) }, section.key)), _jsxs(Route, { path: "/cad", element: _jsx(CadLayout, {}), children: [_jsx(Route, { index: true, element: _jsx(Navigate, { to: "/cad/viewer", replace: true }) }), _jsx(Route, { path: "viewer", element: _jsx(CADViewer, {}) }), _jsx(Route, { path: "asbuild", element: _jsx(AsBuilt, {}) }), _jsx(Route, { path: "tools", element: _jsx(CADTools, {}) })] }), "                            ", _jsx(Route, { path: "/mengenermittlung/aufmasseditor", element: _jsx(AufmassEditor, {}) }), _jsx(Route, { path: "/mengenermittlung/aufmass", element: _jsx(Navigate, { to: "/mengenermittlung/aufmasseditor", replace: true }) }), _jsx(Route, { path: "/mengenermittlung/manuell-foto", element: _jsx(Navigate, { to: "/mengenermittlung/auto", replace: true }) }), _jsx(Route, { path: "/mengenermittlung/aufmasse-ki", element: _jsx(Navigate, { to: "/mengenermittlung/auto", replace: true }) }), _jsx(Route, { path: "/mengenermittlung/soll-ist", element: _jsx(SollIst, {}) }), _jsx(Route, { path: "/mengenermittlung/auto", element: _jsx(AutoKI, {}) }), _jsx(Route, { path: "/mengenermittlung/manuell", element: _jsx(Navigate, { to: "/mengenermittlung/auto", replace: true }) }), _jsx(Route, { path: "/mengenermittlung/aufmasse", element: _jsx(Navigate, { to: "/mengenermittlung/auto", replace: true }) }), _jsx(Route, { path: "/mengenermittlung/import", element: _jsx(Navigate, { to: "/mengenermittlung/auto", replace: true }) }), _jsx(Route, { path: "/mengenermittlung/auto-ki", element: _jsx(Navigate, { to: "/mengenermittlung/auto", replace: true }) }), _jsx(Route, { path: "/mengenermittlung/regieberichte", element: _jsx(Navigate, { to: "/buro/regieberichte", replace: true }) }), _jsx(Route, { path: "/mengenermittlung/lieferscheine", element: _jsx(Navigate, { to: "/buro/lieferscheine", replace: true }) }), _jsx(Route, { path: "/mengenermittlung/historie", element: _jsx(HistoriePage, {}) }), _jsx(Route, { path: "/mengenermittlung/gps", element: _jsx(GPSZuweisung, {}) }), _jsx(Route, { path: "/mengenermittlung/GPSZuweisung", element: _jsx(Navigate, { to: "/mengenermittlung/gps", replace: true }) }), _jsx(Route, { path: "/mengenermittlung/vergleich", element: _jsx(Navigate, { to: "/mengenermittlung/soll-ist", replace: true }) }), _jsx(Route, { path: "/mengenermittlung/bilder", element: _jsx(BilderZumAufmass, {}) }), _jsx(Route, { path: "/mengenermittlung/abrechnungskreise", element: _jsx(Abrechnungskreise, {}) }), _jsx(Route, { path: "/mengenermittlung/ausdrucke", element: _jsx(Navigate, { to: "/mengenermittlung/aufmasseditor", replace: true }) }), _jsx(Route, { path: "/mengenermittlung/stammdaten", element: _jsx(Navigate, { to: "/kalkulation/datenbank/preise", replace: true }) }), _jsx(Route, { path: "/buro/regieberichte", element: _jsx(Regieberichte, {}) }), _jsx(Route, { path: "/buro/lieferscheine", element: _jsx(Lieferscheine, {}) }), _jsx(Route, { path: "/buro/fotos", element: _jsx(ProjektakteFotos, {}) }), _jsx(Route, { path: "/buro/tagesberichte", element: _jsx(Tagesberichte, {}) }), _jsx(Route, { path: "/buro/bautagebuch", element: _jsx(Bautagebuch, {}) }), _jsx(Route, { path: "/buro/angebote", element: _jsx(AngebotPage, {}) }), _jsx(Route, { path: "/buro/vorlagen", element: _jsx(BuroLayout, { children: _jsx(VorlagenCenter, {}) }) }), _jsx(Route, { path: "/buro/projekte", element: _jsx(BuroLayout, { children: _jsx(Projekte, {}) }) }), _jsx(Route, { path: "/buro/dokumente", element: _jsx(BuroLayout, { children: _jsx(Dokumente, {}) }) }), _jsx(Route, { path: "/buro/kommunikation", element: _jsx(BuroLayout, { children: _jsx(Kommunikation, {}) }) }), _jsx(Route, { path: "/buro/vertraege", element: _jsx(BuroLayout, { children: _jsx(Vertraege, {}) }) }), _jsx(Route, { path: "/buro/outlook", element: _jsx(BuroLayout, { children: _jsx(OutlookKalender, {}) }) }), _jsx(Route, { path: "/buro/nutzerverwaltung", element: _jsx(BuroLayout, { children: _jsx(Nutzerverwaltung, {}) }) }), _jsx(Route, { path: "/buro/bauzeitenplan", element: _jsx(BuroLayout, { children: _jsx(Bauzeitenplan, {}) }) }), _jsx(Route, { path: "/buro/personalverwaltung", element: _jsx(BuroLayout, { children: _jsx(Personalverwaltung, {}) }) }), _jsx(Route, { path: "/buro/maschinenverwaltung", element: _jsx(BuroLayout, { children: _jsx(Maschinenverwaltung, {}) }) }), _jsx(Route, { path: "/buro/materialverwaltung", element: _jsx(BuroLayout, { children: _jsx(Materialverwaltung, {}) }) }), _jsx(Route, { path: "/buro/ressourcenplanung", element: _jsx(BuroLayout, { children: _jsx(Ressourcenplanung, {}) }) }), _jsx(Route, { path: "/buro/sicherheit", element: _jsx(BuroLayout, { children: _jsx(Sicherheit, {}) }) }), _jsx(Route, { path: "/buro/uebergabe", element: _jsx(BuroLayout, { children: _jsx(Uebergabe, {}) }) }), _jsx(Route, { path: "/buro/lager", element: _jsx(BuroLayout, { children: _jsx(Lager, {}) }) }), _jsx(Route, { path: "/buro/tasks", element: _jsx(BuroLayout, { children: _jsx(Tasks, {}) }) }), _jsx(Route, { path: "/kalkulation", element: _jsx(Navigate, { to: "/kalkulation/kalkulationszentrale", replace: true }) }), _jsx(Route, { path: "/kalkulation/lv-import", element: _jsx(LVImport, {}) }), _jsx(Route, { path: "/kalkulation/gaeb", element: _jsx(GaebPage, {}) }), _jsx(Route, { path: "/kalkulation/import", element: _jsx(ImportPage, {}) }), _jsx(Route, { path: "/kalkulation/mit-ki", element: _jsx(KalkulationMitKI, {}) }), _jsx(Route, { path: "/kalkulation/datenbank", element: _jsx(KalkulationsDatenbankPage, {}) }), _jsx(Route, { path: "/kalkulation/datenbank/position/:id", element: _jsx(KalkulationsDatenbankPositionPage, {}) }), _jsx(Route, { path: "/kalkulation/datenbank/preise", element: _jsx(PreisePage, {}) }), _jsx(Route, { path: "/kalkulation/preise", element: _jsx(Navigate, { to: "/kalkulation/datenbank/preise", replace: true }) }), _jsx(Route, { path: "/kalkulation/nachtraege", element: _jsx(NachtraegePage, {}) }), _jsx(Route, { path: "/kalkulation/angebot", element: _jsx(AngebotPage, {}) }), _jsx(Route, { path: "/kalkulation/versionsvergleich", element: _jsx(VersionsvergleichPage, {}) }), _jsx(Route, { path: "/kalkulation/crm", element: _jsx(CRMAngebotsverfolgungPage, {}) }), _jsx(Route, { path: "/kalkulation/rezepte", element: _jsx(Recipes, {}) }), _jsx(Route, { path: "/kalkulation/lvUpload", element: _jsx(Navigate, { to: "/kalkulation/lv-import", replace: true }) }), _jsx(Route, { path: "/kalkulation/lvOhnePreis", element: _jsx(Navigate, { to: "/kalkulation/angebot", replace: true }) }), _jsx(Route, { path: "/kalkulation/vergleich", element: _jsx(Navigate, { to: "/kalkulation/versionsvergleich", replace: true }) }), _jsx(Route, { path: "/kalkulation/projekt", element: _jsx(Navigate, { to: "/start", replace: true }) }), _jsx(Route, { path: "/kalkulation/kalkulationsdatenbank", element: _jsx(Navigate, { to: "/kalkulation/datenbank", replace: true }) }), _jsx(Route, { path: "/kalkulation/kalkulationsDatenbank", element: _jsx(Navigate, { to: "/kalkulation/datenbank", replace: true }) }), _jsx(Route, { path: "/kalkulation/manuell", element: _jsx(Navigate, { to: "/kalkulation/mit-ki", replace: true }) }), _jsx(Route, { path: "/kalkulation/aufschlag", element: _jsx(Navigate, { to: "/kalkulation/mit-ki", replace: true }) }), _jsx(Route, { path: "/kalkulation/lv-export", element: _jsx(Navigate, { to: "/kalkulation/angebot", replace: true }) }), _jsx(Route, { path: "/kalkulation/recipes", element: _jsx(Navigate, { to: "/kalkulation/rezepte", replace: true }) }), _jsx(Route, { path: "/info/hilfe", element: _jsx(Hilfe, {}) }), _jsx(Route, { path: "/info/faq", element: _jsx(FAQ, {}) }), _jsx(Route, { path: "/info/shortcuts", element: _jsx(Shortcuts, {}) }), _jsx(Route, { path: "/info/changelog", element: _jsx(Changelog, {}) }), _jsx(Route, { path: "/info/system", element: _jsx(Systemstatus, {}) }), _jsx(Route, { path: "/info/updates", element: _jsx(Updates, {}) }), _jsx(Route, { path: "/info/datenschutz", element: _jsx(Datenschutz, {}) }), _jsx(Route, { path: "/info/impressum", element: _jsx(Impressum, {}) }), _jsx(Route, { path: "/info/support", element: _jsx(Support, {}) }), _jsx(Route, { path: "/info/ueber", element: _jsx(Ueber, {}) }), _jsx(Route, { path: "/mengenermittlung/ki-fotoerkennung", element: _jsx(Navigate, { to: "/ki/fotoerkennung", replace: true }) }), _jsx(Route, { path: "/mengenermittlung/ki-auto-abrechnung", element: _jsx(Navigate, { to: "/ki/auto-abrechnung", replace: true }) }), _jsx(Route, { path: "/buro/ki-sprachsteuerung", element: _jsx(Navigate, { to: "/ki/sprachsteuerung", replace: true }) }), _jsx(Route, { path: "/buro/ki-regie-auto", element: _jsx(Navigate, { to: "/ki/regie-auto", replace: true }) }), _jsx(Route, { path: "/buro/ki-optimierung", element: _jsx(Navigate, { to: "/ki/optimierung", replace: true }) }), _jsx(Route, { path: "/buro/ki-maengel", element: _jsx(Navigate, { to: "/ki/maengel", replace: true }) }), _jsxs(Route, { path: "/ki", element: _jsx(KILayout, {}), children: [_jsx(Route, { index: true, element: _jsx(KIUebersicht, {}) }), _jsx(Route, { path: "fotoerkennung", element: _jsx(KIFotoerkennung, {}) }), _jsx(Route, { path: "sprachsteuerung", element: _jsx(KISprachsteuerung, {}) }), _jsx(Route, { path: "auto-abrechnung", element: _jsx(KIAutoAbrechnung, {}) }), _jsx(Route, { path: "regie-auto", element: _jsx(KIRegieAuto, {}) }), _jsx(Route, { path: "optimierung", element: _jsx(KIOptimierung, {}) }), _jsx(Route, { path: "maengel", element: _jsx(KIMaengel, {}) })] }), _jsx(Route, { path: "/kalkulation/ki-auto-lv", element: _jsx(Navigate, { to: "/kalkulation/mit-ki", replace: true }) }), _jsx(Route, { path: "/kalkulation/ki-vorschlaege", element: _jsx(Navigate, { to: "/kalkulation/lv-import", replace: true }) }), _jsx(Route, { path: "/kalkulation/ki-widersprueche", element: _jsx(Navigate, { to: "/kalkulation/versionsvergleich?tab=pruefung", replace: true }) }), _jsx(Route, { path: "/kalkulation/ki-bewertung-analyse", element: _jsx(Navigate, { to: "/kalkulation/versionsvergleich?tab=ranking", replace: true }) }), _jsx(Route, { path: "/ki/auto-lv", element: _jsx(Navigate, { to: "/kalkulation/mit-ki", replace: true }) }), _jsx(Route, { path: "/ki/vorschlaege", element: _jsx(Navigate, { to: "/kalkulation/lv-import", replace: true }) }), _jsx(Route, { path: "/ki/widersprueche", element: _jsx(Navigate, { to: "/kalkulation/versionsvergleich?tab=pruefung", replace: true }) }), _jsx(Route, { path: "/ki/bewertung-analyse", element: _jsx(Navigate, { to: "/kalkulation/versionsvergleich?tab=ranking", replace: true }) }), _jsx(Route, { path: "/ki/lv-auto", element: _jsx(Navigate, { to: "/kalkulation/mit-ki", replace: true }) }), _jsx(Route, { path: "/ki/foto", element: _jsx(Navigate, { to: "/ki/fotoerkennung", replace: true }) }), _jsx(Route, { path: "/ki/sprach", element: _jsx(Navigate, { to: "/ki/sprachsteuerung", replace: true }) }), _jsx(Route, { path: "/ki/bewertung", element: _jsx(Navigate, { to: "/kalkulation/versionsvergleich?tab=ranking", replace: true }) }), _jsx(Route, { path: "/ki/abrechnung-auto", element: _jsx(Navigate, { to: "/ki/auto-abrechnung", replace: true }) }), _jsx(Route, { path: "/ki/nachtraege", element: _jsx(Navigate, { to: "/kalkulation/nachtraege", replace: true }) }), _jsx(Route, { path: "/ki/analyse", element: _jsx(Navigate, { to: "/kalkulation/versionsvergleich", replace: true }) }), _jsxs(Route, { path: "/buchhaltung/*", element: _jsx(BuchhaltungLayout, {}), children: [_jsx(Route, { index: true, element: _jsx(Uebersicht, {}) }), _jsx(Route, { path: "kostenuebersicht", element: _jsx(Kostenuebersicht, {}) }), _jsx(Route, { path: "rechnungen", element: _jsx(Rechnungen, {}) }), _jsx(Route, { path: "abschlagsrechnungen", element: _jsx(AbschlagsrechnungenPage, {}) }), _jsx(Route, { path: "abschlagsrechnungen/:id", element: _jsx(AbschlagsrechnungDetail, {}) }), _jsx(Route, { path: "zahlungen", element: _jsx(Zahlungen, {}) }), _jsx(Route, { path: "eingang", element: _jsx(Eingang, {}) }), _jsx(Route, { path: "kassenbuch", element: _jsx(Kassenbuch, {}) }), _jsx(Route, { path: "kostenstellen", element: _jsx(Kostenstellen, {}) }), _jsx(Route, { path: "mahnwesen", element: _jsx(Mahnwesen, {}) }), _jsx(Route, { path: "reports", element: _jsx(Reports, {}) }), _jsx(Route, { path: "datev", element: _jsx(Datev, {}) }), _jsx(Route, { path: "ust", element: _jsx(USt, {}) }), _jsx(Route, { path: "lieferscheine", element: _jsx(LieferscheineKosten, {}) })] }), _jsx(Route, { path: "/mobile/pruefung/:type", element: _jsx(MobilePruefung, {}) }), _jsx(Route, { path: "/mobile/regieberichte", element: _jsx(Navigate, { to: "/mobile/pruefung/REGIE", replace: true }) }), _jsx(Route, { path: "/mobile/lieferscheine", element: _jsx(Navigate, { to: "/mobile/pruefung/LIEFERSCHEIN", replace: true }) }), _jsx(Route, { path: "/mobile/fotos", element: _jsx(Navigate, { to: "/mobile/pruefung/FOTOS", replace: true }) }), _jsx(Route, { path: "/mobile/tagesberichte", element: _jsx(Navigate, { to: "/mobile/pruefung/TAGESBERICHT", replace: true }) }), _jsx(Route, { path: "/mobile/bautagebuch", element: _jsx(Navigate, { to: "/mobile/pruefung/BAUTAGEBUCH", replace: true }) }), _jsx(Route, { path: "/mobile/arbeitszeiten", element: _jsx(MobileArbeitszeiten, {}) }), _jsx(Route, { path: "/mobile/arbeitszeiten/mitarbeiter", element: _jsx(MobileMitarbeiterEingaenge, {}) }), _jsx(Route, { path: "/mobile/mengenermittlung", element: _jsx(Navigate, { to: "/mobile/pruefung/MENGENERMITTLUNG", replace: true }) }), _jsx(Route, { path: "/mobile/kalkulation", element: _jsx(Navigate, { to: "/kalkulation/mit-ki", replace: true }) }), _jsx(Route, { path: "/mobile/angebote", element: _jsx(Navigate, { to: "/mobile/pruefung/ANGEBOT", replace: true }) }), _jsx(Route, { path: "/mobile/abschlagsrechnungen", element: _jsx(Navigate, { to: "/mobile/pruefung/ABSCHLAGSRECHNUNG", replace: true }) }), _jsx(Route, { path: "/mobile/rechnungen", element: _jsx(Navigate, { to: "/mobile/pruefung/RECHNUNG", replace: true }) }), _jsx(Route, { path: "/mobile/outlier-reports", element: _jsx(Navigate, { to: "/kalkulation/versionsvergleich", replace: true }) }), _jsx(Route, { path: "/KI", element: _jsx(Navigate, { to: "/ki", replace: true }) }), _jsx(Route, { path: "/:section/:sub", element: _jsx(SubsectionEmpty, {}) }), _jsx(Route, { path: "/", element: _jsx(Navigate, { to: "/start", replace: true }) }), _jsx(Route, { path: "/kalkulation/kalkulationszentrale", element: _jsx(Kalkulationszentrale, {}) }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/start", replace: true }) })] }) }) }) }), _jsx(DocumentDeliveryCenter, {}), _jsx(RlcKiAssistant, {}), _jsx(RlcGlobalProgress, {})] }) }));
}
/* ------------------ APP ------------------ */
export default function App() {
    return (_jsx(ProjectProvider, { children: _jsx(BrowserRouter, { children: _jsx(AppShell, {}) }) }));
}

// apps/web/src/App.tsx
import React from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Link,
  useLocation,
  useParams,
  Outlet,
} from "react-router-dom";

import "./styles.css";
import { ProjectProvider, useProject } from "./store/useProject";
import RlcKiAssistant from "./components/RlcKiAssistant";
import RlcGlobalProgress from "./components/RlcGlobalProgress";

/* ------------------ AUTH ------------------ */
import Login from "./pages/auth/Login";
import PricingPage from "./pages/site/PricingPage";

/* ------------------ START / PROJEKT ------------------ */
import ProjectPage from "./pages/start/project";
import ProjektUebersicht from "./pages/start/projektUebersicht";

/* ------------------ MENGENERMITTLUNG ------------------ */
import AufmassEditor from "./pages/mengenermittlung/AufmassEditor";
import AutoKI from "./pages/mengenermittlung/AutoKi";
import Regieberichte from "./pages/mengenermittlung/Regieberichte";
import Lieferscheine from "./pages/mengenermittlung/lieferscheine";
import HistoriePage from "./pages/mengenermittlung/historie";
import GPSZuweisung from "./pages/mengenermittlung/GPSZuweisung";
import SollIst from "./pages/mengenermittlung/SollIst";
import BilderZumAufmass from "./pages/mengenermittlung/bilder";
/* ------------------ CAD ------------------ */
import CADViewer from "./pages/cad/CADViewer";
import PDFViewer from "./pages/cad/PDFViewer";
import AsBuilt from "./pages/cad/asbuild";
import CadWithMap from "./pages/cad/CadWithMap";

/* ------------------ BÜRO ------------------ */
import BuroLayout from "./pages/buro";
import Projekte from "./pages/buro/projekte";
import Dokumente from "./pages/buro/dokumente";
import Vertraege from "./pages/buro/vertraege";
import Tasks from "./pages/buro/tasks";
import Kommunikation from "./pages/buro/kommunikation";
import Nutzerverwaltung from "./pages/buro/Nutzerverwaltung";
import OutlookKalender from "./pages/buro/outlookKalender";
import Bauzeitenplan from "./pages/buro/bauzeitenplan";
import Personalverwaltung from "./pages/buro/personalverwaltung";
import Maschinenverwaltung from "./pages/buro/maschinenverwaltung";
import Materialverwaltung from "./pages/buro/materialverwaltung";
import Sicherheit from "./pages/buro/sicherheit";
import Ressourcenplanung from "./pages/buro/ressourcenplanung";
import Uebergabe from "./pages/buro/uebergabe";
import Lager from "./pages/buro/lager";

/* ------------------ KALKULATION ------------------ */
import LVImport from "./pages/kalkulation/lv-import";
import GaebPage from "./pages/kalkulation/gaeb";
import ImportPage from "./pages/kalkulation/ImportPage";
import KalkulationMitKI from "./pages/kalkulation/kalkulationMitKI";
import KalkulationsDatenbankPage from "./pages/kalkulation/kalkulationsDatenbankPage";
import KalkulationsDatenbankPositionPage from "./pages/kalkulation/KalkulationsDatenbankPositionPage";
import NachtraegePage from "./pages/kalkulation/nachtraege";
import AngebotPage from "./pages/kalkulation/angebot";
import PreisePage from "./pages/kalkulation/preise";
import VersionsvergleichPage from "./pages/kalkulation/Versionsvergleich";
import CRMAngebotsverfolgungPage from "./pages/kalkulation/crm";
import Recipes from "./pages/kalkulation/Recipes";

/* ------------------ ÜBERSICHTEN ------------------ */
import KalkulationUebersicht from "./pages/kalkulation/Uebersicht";
import MengenermittlungUebersicht from "./pages/mengenermittlung/Uebersicht";
import BueroUebersicht from "./pages/buro/Uebersicht";
import KIUebersicht from "./pages/ki/Uebersicht";
import InfoUebersicht from "./pages/info/Uebersicht";
import BuchhaltungUebersicht from "./pages/buchhaltung/Uebersicht";
import MobileUebersicht from "./pages/mobile/Uebersicht";
import MobilePruefung from "./pages/mobile/Pruefung";

/* ------------------ INFO ------------------ */
import Hilfe from "./pages/info/hilfe";
import FAQ from "./pages/info/faq";
import Shortcuts from "./pages/info/shortcuts";
import Changelog from "./pages/info/changelog";
import Systemstatus from "./pages/info/system";
import Updates from "./pages/info/updates";
import Datenschutz from "./pages/info/datenschutz";
import Impressum from "./pages/info/impressum";
import Support from "./pages/info/support";
import Ueber from "./pages/info/ueber";

/* ------------------ KI ------------------ */
import KILayout from "./pages/ki/KILayout";
import KIAutoLV from "./pages/ki/AutoLV";
import KIVorschlaege from "./pages/ki/Vorschlaege";
import KIFotoerkennung from "./pages/ki/Fotoerkennung";
import KISprachsteuerung from "./pages/ki/Sprachsteuerung";
import KIWidersprueche from "./pages/ki/Widersprueche";
import KIBewertungAnalyse from "./pages/ki/BewertungAnalyse";
import KIAutoAbrechnung from "./pages/ki/AutoAbrechnung";
import KIRegieAuto from "./pages/ki/RegieAuto";
import KIOptimierung from "./pages/ki/Optimierung";
import KIMaengel from "./pages/ki/Maengel";
import MarketIntelligence from "./pages/ki/MarketIntelligence";

/* ------------------ BUCHHALTUNG ------------------ */
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
import AbschlagsrechnungenPage from "./pages/buchhaltung/Abschlagsrechnungen";
import AbschlagsrechnungDetail from "./pages/buchhaltung/AbschlagsrechnungDetail";
import LieferscheineKosten from "./pages/buchhaltung/lieferscheine";

/* =========================================================
   PROD HARDENING
   ========================================================= */

const IS_PROD =
  (import.meta as any)?.env?.MODE === "production" ||
  (import.meta as any)?.env?.PROD === true;

const logo = "/logo.svg";

if (IS_PROD) {
  console.log = () => {};
  console.debug = () => {};
  console.info = () => {};
}

/* ------------------ AUTH HELPERS ------------------ */

function readJsonSafe<T = any>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;

  const keys = [
    "rlc_token",
    "token",
    "authToken",
    "accessToken",
    "rlc.auth.token",
    "rlc_mobile_token",
  ];

  for (const key of keys) {
    const v = localStorage.getItem(key);
    if (v && String(v).trim()) return String(v).trim();
  }

  const authObj = readJsonSafe<any>(localStorage.getItem("rlc_auth"), null);

  if (authObj?.token) return String(authObj.token);
  if (authObj?.accessToken) return String(authObj.accessToken);

  return null;
}

function isPublicPath(pathname: string) {
  return pathname === "/" || pathname === "/preise" || pathname === "/login";
}

function RequireAuth({ children }: { children: React.ReactElement }) {
  const location = useLocation();
  const token = getAuthToken();

  if (!token) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
      />
    );
  }

  return children;
}

/* ------------------ CONFIG SIDE + MENU ------------------ */

type Section = {
  key: string;
  title: string;
  items: { key: string; label: string }[];
};

const SECTIONS: Section[] = [
  {
    key: "kalkulation",
    title: "1. Kalkulation",
    items: [
      { key: "lv-import", label: "LV / Positionen" },
      { key: "mit-ki", label: "Kalkulation" },
      { key: "datenbank", label: "Kalkulationsdatenbank" },
      { key: "versionsvergleich", label: "Versionsvergleich / Analyse" },
      { key: "crm", label: "CRM / Angebotsverfolgung" },
    ],
  },
  {
    key: "mengenermittlung",
    title: "2. Mengenermittlung",
    items: [      { key: "aufmasseditor", label: "Aufmaß-Editor" },
      { key: "soll-ist", label: "Aufmaßvergleich: Soll-Ist" },
      { key: "auto", label: "KI-Mengenermittlung aus Plan / Foto" },
      { key: "historie", label: "Aufmaß-Historie" },
      { key: "gps", label: "GPS-basierte Positionszuweisung" },
      { key: "bilder", label: "Bilder zum Aufmaß" },
    ],
  },
  {
    key: "cad",
    title: "3. CAD / PDF",
    items: [
      { key: "viewer", label: "CAD Viewer" },
      { key: "pdf-viewer", label: "PDF Viewer" },
      { key: "asbuild", label: "As-Built" },
      { key: "tools", label: "Layer & Eigenschaften" },
      { key: "map", label: "CAD mit Karte" },
    ],
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
      { key: "angebote", label: "Angebote" },
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
      { key: "hilfe", label: "Hilfe / Anleitungen" },
      { key: "faq", label: "FAQ" },
      { key: "shortcuts", label: "Tastenkürzel" },
      { key: "changelog", label: "Changelog" },
      { key: "system", label: "Systemstatus" },
      { key: "updates", label: "Updates" },
      { key: "datenschutz", label: "Datenschutz" },
      { key: "impressum", label: "Impressum" },
      { key: "support", label: "Support / Feedback" },
      { key: "ueber", label: "Über die App" },
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
  {
    key: "mobile",
    title: "8. Mobile",
    items: [
      { key: "regieberichte", label: "Regieberichte" },
      { key: "lieferscheine", label: "Lieferscheine" },
      { key: "fotos", label: "Fotos / Notizen" },
      { key: "tagesberichte", label: "Tagesberichte" },
      { key: "bautagebuch", label: "Bautagebuch" },
      { key: "mengenermittlung", label: "Mengenermittlung" },
      { key: "kalkulation", label: "Kalkulation" },
      { key: "angebote", label: "Angebote" },
      { key: "abschlagsrechnungen", label: "Abschlagsrechnungen" },
      { key: "rechnungen", label: "Rechnungen" },
      { key: "outlier-reports", label: "Outlier Reports" },
    ],
  },
];

/* ------------------ ÜBERSICHT MAP ------------------ */

const OVERVIEW: Record<string, React.ReactElement> = {
  kalkulation: <KalkulationUebersicht />,
  mengenermittlung: <MengenermittlungUebersicht />,
  cad: <Navigate to="/cad/viewer" replace />,
  buro: <BueroUebersicht />,
  ki: <KIUebersicht />,
  info: <InfoUebersicht />,
  buchhaltung: <BuchhaltungUebersicht />,
  mobile: <MobileUebersicht />,
};

/* ------------------ HELPERS CURRENT PROJECT ------------------ */

function getCurrentProjectFromAnySource(ctx: any) {
  const fromCtx =
    ctx?.currentProject ??
    ctx?.selectedProject ??
    ctx?.current ??
    ctx?.project ??
    (typeof ctx?.getCurrentProject === "function" ? ctx.getCurrentProject() : null);

  if (fromCtx) return fromCtx;

  try {
    const g = globalThis as any;
    return g.__RLC_CURRENT_PROJECT ?? null;
  } catch {
    return null;
  }
}

/* ------------------ CAD FALLBACKS ------------------ */

function CadLayout() {
  return <Outlet />;
}

function CADTools() {
  return (
    <div className="card">
      <div className="breadcrumbs">
        <Link className="link" to="/start">
          RLC
        </Link>
        <span className="sep">/</span>
        <Link className="link" to="/cad">
          3. CAD / PDF
        </Link>
        <span className="sep">/</span>
        <span>Layer & Eigenschaften</span>
      </div>

      <div className="h1">Layer & Eigenschaften</div>

      <div className="empty">
        <h3>CAD-Werkzeuge</h3>
        <p>
          Diese Ansicht ist als Fallback aktiv, weil die frühere separate{" "}
          <code>CADTools.tsx</code> Datei aktuell nicht vorhanden ist.
        </p>
        <p>Die Route bleibt damit funktionsfähig und der Build bricht nicht ab.</p>
      </div>
    </div>
  );
}

/* ------------------ TOPNAV ------------------ */

function topNavLabel(title: string): string {
  const clean = title.replace(/^\d+\.\s*/, "").trim();

  if (clean === "Mengenermittlung") return "Mengen";
  if (clean === "Büro / Verwaltung") return "Verwaltung";
  if (clean === "Info / Hilfe / Videoerklärung") return "Hilfe";
  if (clean === "CAD / PDF") return "CAD/PDF";

  return clean;
}

function SideNav() {
  const { pathname } = useLocation();
  const [openMenu, setOpenMenu] = React.useState<string | null>(null);

  const topItems = [
    { to: "/start", label: "Projekte öffnen / neu erstellen" },
    { to: "/projekt/uebersicht", label: "Projekt Übersicht" },
  ];

  const navButton = (active: boolean): React.CSSProperties => ({
    width: "100%",
    minHeight: 38,
    padding: "6px 7px",
    border: "1px solid #D7E2F0",
    borderRadius: 11,
    background: active ? "#DBEAFE" : "#FFFFFF",
    color: "#0F172A",
    fontWeight: 900,
    fontSize: 11.5,
    boxShadow: "0 2px 8px rgba(15,23,42,0.04)",
    whiteSpace: "normal",
    lineHeight: 1.15,
    overflowWrap: "anywhere",
    textAlign: "center",
    cursor: "pointer",
    textDecoration: "none",
  });

  return (
    <nav
      style={{
        display: "grid",
        gridTemplateColumns: "1.45fr 1.05fr repeat(8, minmax(0, 0.72fr))",
        gap: 7,
        alignItems: "start",
        width: "100%",
        minWidth: 0,
        maxWidth: "100%",
        overflow: "visible",
      }}
    >
      {topItems.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className={`s-link ${pathname === item.to ? "active" : ""}`}
          style={navButton(pathname === item.to)}
          onClick={() => setOpenMenu(null)}
        >
          {item.label}
        </Link>
      ))}

      {SECTIONS.map((section) => {
        const activeSection =
          pathname === `/${section.key}` || pathname.startsWith(`/${section.key}/`);
        const isOpen = openMenu === section.key;

        return (
          <div
            key={section.key}
            style={{
              position: "relative",
              zIndex: isOpen ? 100000 : 1,
              minWidth: 0,
            }}
          >
            <button
              type="button"
              style={navButton(activeSection)}
              onClick={() => setOpenMenu(isOpen ? null : section.key)}
            >
              {topNavLabel(section.title)} ▼
            </button>

            {isOpen ? (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  left: 0,
                  zIndex: 100000,
                  minWidth: 260,
                  maxWidth: 360,
                  display: "grid",
                  gap: 4,
                  padding: 10,
                  background: "#FFFFFF",
                  border: "1px solid #E2E8F0",
                  borderRadius: 14,
                  boxShadow: "0 18px 45px rgba(15,23,42,0.16)",
                }}
              >
                <Link
                  className={`s-link ${pathname === `/${section.key}` ? "active" : ""}`}
                  to={`/${section.key}`}
                  style={{ margin: 0 }}
                  onClick={() => setOpenMenu(null)}
                >
                  Übersicht
                </Link>

                {section.items.map((item) => {
                  const to = `/${section.key}/${item.key}`;
                  const active = pathname === to;

                  return (
                    <Link
                      key={item.key}
                      className={`s-link ${active ? "active" : ""}`}
                      to={to}
                      style={{ margin: 0 }}
                      onClick={() => setOpenMenu(null)}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

/* ------------------ CURRENT PROJECT BAR ------------------ */

function CurrentProjectBar() {
  const { pathname } = useLocation();
  const ctx: any = useProject();

  const hideOnStartRoutes =
    pathname === "/start" ||
    pathname === "/projekt/auswahl" ||
    pathname === "/projektauswahl" ||
    pathname === "/projekt/uebersicht" ||
    pathname === "/login" ||
    pathname === "/" ||
    pathname === "/preise";

  if (hideOnStartRoutes) return null;

  const cur = getCurrentProjectFromAnySource(ctx);

  if (!cur) {
    return (
      <div
        className="card"
        style={{ marginBottom: 12, padding: "8px 12px", fontSize: 13 }}
      >
        Kein Projekt gewählt. Bitte zuerst unter <b>Start (Projekt auswählen)</b>{" "}
        ein Projekt auswählen.
      </div>
    );
  }

  return (
    <div
      className="card"
      style={{
        marginBottom: 12,
        padding: "8px 12px",
        fontSize: 13,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        background: "#F9FAFB",
        gap: 8,
        flexWrap: "wrap",
      }}
    >
      <div>
        <span style={{ fontWeight: 700 }}>{cur.code || cur.number || cur.id}</span>{" "}
        – {cur.name}
        {cur.client ? <> • {cur.client}</> : null}
        {cur.place || cur.location ? <> • {cur.place || cur.location}</> : null}
      </div>

      <Link to="/projekt/uebersicht" className="link" style={{ fontSize: 12 }}>
        Zur Projekt-Übersicht →
      </Link>
    </div>
  );
}

/* ------------------ EMPTY PAGES ------------------ */

function SectionList({ sectionKey }: { sectionKey: string }) {
  const section = SECTIONS.find((x) => x.key === sectionKey);

  if (!section) return <div className="card">Unbekannte Sektion.</div>;

  return (
    <div className="card">
      <div className="breadcrumbs">
        <span>RLC</span>
        <span className="sep">/</span>
        <span>{section.title}</span>
      </div>

      <div className="h1">{section.title}</div>

      <div className="empty">
        <h3>Übersicht</h3>
        <p>Wähle links eine Untersektion.</p>
      </div>
    </div>
  );
}

function SubsectionEmpty() {
  const { section, sub } = useParams();
  const foundSection = SECTIONS.find((x) => x.key === section);
  const foundItem = foundSection?.items.find((x) => x.key === sub);

  return (
    <div className="card">
      <div className="breadcrumbs">
        <Link className="link" to="/start">
          RLC
        </Link>

        <span className="sep">/</span>

        {foundSection ? (
          <Link className="link" to={`/${foundSection.key}`}>
            {foundSection.title}
          </Link>
        ) : (
          <span>Unbekannt</span>
        )}

        <span className="sep">/</span>
        <span>{foundItem?.label ?? sub}</span>
      </div>

      <div className="h1">{foundItem?.label ?? sub}</div>

      <div className="empty">
        <h3>Diese Untersektion ist noch leer</h3>
      </div>
    </div>
  );
}

/* ------------------ SHELL ------------------ */

function AppShell() {
  const { pathname } = useLocation();

  if (isPublicPath(pathname)) {
    return (
      <div className="app">
        <Routes>
          <Route path="/" element={<PricingPage />} />
          <Route path="/preise" element={<PricingPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    );
  }

  return (
    <RequireAuth>
      <div className="app">
        <div
          className="header"
          style={{
            display: "grid",
            gap: 10,
            padding: "14px 16px",
            alignItems: "center",
            background: "linear-gradient(180deg, #F8FBFF 0%, #EEF4FF 100%)",
            border: "1px solid #DCE7F7",
            borderRadius: 18,
            boxShadow: "0 10px 28px rgba(15,23,42,0.06)",
            marginBottom: 12,
          }}
        >
          <Link
            to="/start"
            className="brand"
            style={{
              display: "inline-flex",
              alignItems: "baseline",
              gap: 9,
              minWidth: 0,
              maxWidth: "100%",
              textDecoration: "none",
              width: "fit-content",
            }}
          >
            <span style={{ fontSize: 28, fontWeight: 950, letterSpacing: "-0.04em", color: "#0F172A", lineHeight: 1 }}>
              RLC Bausoftware
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 900,
                color: "#1D4ED8",
                background: "#DBEAFE",
                padding: "4px 9px",
                borderRadius: 999,
                border: "1px solid #BFDBFE",
              }}
            >
              Spezialisiert im Tiefbau
            </span>
          </Link>

          <SideNav />
        </div>

        <div className="layout" style={{ display: "block" }}>
          <div
            className={`content ${pathname.startsWith("/mengenermittlung") ? "meng-theme" : ""}`}
            style={{ width: "100%", maxWidth: "100%", minWidth: 0, overflowX: "clip" }}
          >
            <CurrentProjectBar />

            <Routes>
              {/* AUTH */}
              <Route path="/login" element={<Navigate to="/start" replace />} />

              {/* START / PROJEKT */}
              <Route path="/start" element={<ProjectPage />} />
              <Route path="/projekt/auswahl" element={<ProjectPage />} />
              <Route path="/projektauswahl" element={<ProjectPage />} />
              <Route path="/projekt/uebersicht" element={<ProjektUebersicht />} />

              {/* SECTION ROOTS */}
              {SECTIONS.filter(
                (section) =>
                  section.key !== "ki" &&
                  section.key !== "buchhaltung" &&
                  section.key !== "cad"
              ).map((section) => (
                <Route
                  key={section.key}
                  path={`/${section.key}`}
                  element={
                    OVERVIEW[section.key] ?? <SectionList sectionKey={section.key} />
                  }
                />
              ))}

              {/* CAD */}
              <Route path="/cad" element={<CadLayout />}>
                <Route index element={<Navigate to="/cad/viewer" replace />} />
                <Route path="viewer" element={<CADViewer />} />
                <Route path="pdf-viewer" element={<PDFViewer />} />
                <Route path="asbuild" element={<AsBuilt />} />
                <Route path="tools" element={<CADTools />} />
                <Route path="map" element={<CadWithMap />} />
              </Route>

              {/* MENGENERMITTLUNG */}                            <Route path="/mengenermittlung/aufmasseditor" element={<AufmassEditor />} />
              <Route path="/mengenermittlung/aufmass" element={<Navigate to="/mengenermittlung/aufmasseditor" replace />} />
              <Route path="/mengenermittlung/manuell-foto" element={<Navigate to="/mengenermittlung/auto" replace />} />
              <Route path="/mengenermittlung/aufmasse-ki" element={<Navigate to="/mengenermittlung/auto" replace />} />
              <Route path="/mengenermittlung/soll-ist" element={<SollIst />} />
                            <Route path="/mengenermittlung/auto" element={<AutoKI />} />
              <Route path="/mengenermittlung/manuell" element={<Navigate to="/mengenermittlung/auto" replace />} />
              <Route path="/mengenermittlung/aufmasse" element={<Navigate to="/mengenermittlung/auto" replace />} />
              <Route path="/mengenermittlung/import" element={<Navigate to="/mengenermittlung/auto" replace />} />
              <Route path="/mengenermittlung/auto-ki" element={<Navigate to="/mengenermittlung/auto" replace />} />
              <Route path="/mengenermittlung/regieberichte" element={<Navigate to="/buro/regieberichte" replace />} />
              <Route path="/mengenermittlung/lieferscheine" element={<Navigate to="/buro/lieferscheine" replace />} />
              <Route path="/mengenermittlung/historie" element={<HistoriePage />} />
              <Route path="/mengenermittlung/gps" element={<GPSZuweisung />} />
              <Route
                path="/mengenermittlung/GPSZuweisung"
                element={<Navigate to="/mengenermittlung/gps" replace />}
              />
<Route path="/mengenermittlung/vergleich" element={<Navigate to="/mengenermittlung/soll-ist" replace />} />
              <Route path="/mengenermittlung/bilder" element={<BilderZumAufmass />} />
              {/* BÜRO */}
              <Route path="/buro/regieberichte" element={<Regieberichte />} />
              <Route path="/buro/lieferscheine" element={<Lieferscheine />} />
              <Route path="/buro/fotos" element={<BilderZumAufmass />} />
              <Route path="/buro/tagesberichte" element={<Regieberichte />} />
              <Route path="/buro/bautagebuch" element={<Regieberichte />} />
              <Route path="/buro/angebote" element={<AngebotPage />} />
              <Route
                path="/buro/projekte"
                element={
                  <BuroLayout>
                    <Projekte />
                  </BuroLayout>
                }
              />
              <Route
                path="/buro/dokumente"
                element={
                  <BuroLayout>
                    <Dokumente />
                  </BuroLayout>
                }
              />
              <Route
                path="/buro/kommunikation"
                element={
                  <BuroLayout>
                    <Kommunikation />
                  </BuroLayout>
                }
              />
              <Route
                path="/buro/vertraege"
                element={
                  <BuroLayout>
                    <Vertraege />
                  </BuroLayout>
                }
              />
              <Route
                path="/buro/outlook"
                element={
                  <BuroLayout>
                    <OutlookKalender />
                  </BuroLayout>
                }
              />
              <Route
                path="/buro/nutzerverwaltung"
                element={
                  <BuroLayout>
                    <Nutzerverwaltung />
                  </BuroLayout>
                }
              />
              <Route
                path="/buro/bauzeitenplan"
                element={
                  <BuroLayout>
                    <Bauzeitenplan />
                  </BuroLayout>
                }
              />
              <Route
                path="/buro/personalverwaltung"
                element={
                  <BuroLayout>
                    <Personalverwaltung />
                  </BuroLayout>
                }
              />
              <Route
                path="/buro/maschinenverwaltung"
                element={
                  <BuroLayout>
                    <Maschinenverwaltung />
                  </BuroLayout>
                }
              />
              <Route
                path="/buro/materialverwaltung"
                element={
                  <BuroLayout>
                    <Materialverwaltung />
                  </BuroLayout>
                }
              />
              <Route
                path="/buro/ressourcenplanung"
                element={
                  <BuroLayout>
                    <Ressourcenplanung />
                  </BuroLayout>
                }
              />
              <Route
                path="/buro/sicherheit"
                element={
                  <BuroLayout>
                    <Sicherheit />
                  </BuroLayout>
                }
              />
              <Route
                path="/buro/uebergabe"
                element={
                  <BuroLayout>
                    <Uebergabe />
                  </BuroLayout>
                }
              />
              <Route
                path="/buro/lager"
                element={
                  <BuroLayout>
                    <Lager />
                  </BuroLayout>
                }
              />
              <Route
                path="/buro/tasks"
                element={
                  <BuroLayout>
                    <Tasks />
                  </BuroLayout>
                }
              />

              {/* KALKULATION */}
              <Route path="/kalkulation" element={<KalkulationUebersicht />} />
              <Route path="/kalkulation/lv-import" element={<LVImport />} />
              <Route path="/kalkulation/gaeb" element={<GaebPage />} />
              <Route path="/kalkulation/import" element={<ImportPage />} />
              <Route path="/kalkulation/mit-ki" element={<KalkulationMitKI />} />
              <Route
                path="/kalkulation/datenbank"
                element={<KalkulationsDatenbankPage />}
              />
              <Route
                path="/kalkulation/datenbank/position/:id"
                element={<KalkulationsDatenbankPositionPage />}
              />
              <Route
                path="/kalkulation/datenbank/preise"
                element={<PreisePage />}
              />
              <Route
                path="/kalkulation/preise"
                element={<Navigate to="/kalkulation/datenbank/preise" replace />}
              />
              <Route path="/kalkulation/nachtraege" element={<NachtraegePage />} />
              <Route path="/kalkulation/angebot" element={<AngebotPage />} />
              <Route
                path="/kalkulation/versionsvergleich"
                element={<VersionsvergleichPage />}
              />
              <Route path="/kalkulation/crm" element={<CRMAngebotsverfolgungPage />} />
              <Route path="/kalkulation/rezepte" element={<Recipes />} />

              {/* KALKULATION LEGACY REDIRECTS */}
              <Route
                path="/kalkulation/lvUpload"
                element={<Navigate to="/kalkulation/lv-import" replace />}
              />
              <Route
                path="/kalkulation/lvOhnePreis"
                element={<Navigate to="/kalkulation/angebot" replace />}
              />
              <Route
                path="/kalkulation/vergleich"
                element={<Navigate to="/kalkulation/versionsvergleich" replace />}
              />
              <Route
                path="/kalkulation/projekt"
                element={<Navigate to="/start" replace />}
              />
              <Route
                path="/kalkulation/kalkulationsdatenbank"
                element={<Navigate to="/kalkulation/datenbank" replace />}
              />
              <Route
                path="/kalkulation/kalkulationsDatenbank"
                element={<Navigate to="/kalkulation/datenbank" replace />}
              />
              <Route
                path="/kalkulation/manuell"
                element={<Navigate to="/kalkulation/mit-ki" replace />}
              />
              <Route
                path="/kalkulation/aufschlag"
                element={<Navigate to="/kalkulation/mit-ki" replace />}
              />
              <Route
                path="/kalkulation/lv-export"
                element={<Navigate to="/kalkulation/angebot" replace />}
              />

              {/* INFO */}
              <Route path="/info/hilfe" element={<Hilfe />} />
              <Route path="/info/faq" element={<FAQ />} />
              <Route path="/info/shortcuts" element={<Shortcuts />} />
              <Route path="/info/changelog" element={<Changelog />} />
              <Route path="/info/system" element={<Systemstatus />} />
              <Route path="/info/updates" element={<Updates />} />
              <Route path="/info/datenschutz" element={<Datenschutz />} />
              <Route path="/info/impressum" element={<Impressum />} />
              <Route path="/info/support" element={<Support />} />
              <Route path="/info/ueber" element={<Ueber />} />

              {/* KI */}
              <Route path="/ki" element={<KILayout />}>
                <Route index element={<KIUebersicht />} />
                <Route path="auto-lv" element={<KIAutoLV />} />
                <Route path="vorschlaege" element={<KIVorschlaege />} />
                <Route path="fotoerkennung" element={<KIFotoerkennung />} />
                <Route path="sprachsteuerung" element={<KISprachsteuerung />} />
                <Route path="widersprueche" element={<KIWidersprueche />} />
                <Route path="bewertung-analyse" element={<KIBewertungAnalyse />} />
                <Route path="auto-abrechnung" element={<KIAutoAbrechnung />} />
                <Route path="regie-auto" element={<KIRegieAuto />} />
                <Route path="optimierung" element={<KIOptimierung />} />
                <Route path="maengel" element={<KIMaengel />} />
                <Route path="market-intelligence" element={<MarketIntelligence />} />
              </Route>

              {/* BUCHHALTUNG */}
              <Route path="/buchhaltung/*" element={<BuchhaltungLayout />}>
                <Route index element={<Uebersicht />} />
                <Route path="kostenuebersicht" element={<Kostenuebersicht />} />
                <Route path="rechnungen" element={<Rechnungen />} />
                <Route
                  path="abschlagsrechnungen"
                  element={<AbschlagsrechnungenPage />}
                />
                <Route
                  path="abschlagsrechnungen/:id"
                  element={<AbschlagsrechnungDetail />}
                />
                <Route path="zahlungen" element={<Zahlungen />} />
                <Route path="eingang" element={<Eingang />} />
                <Route path="kassenbuch" element={<Kassenbuch />} />
                <Route path="kostenstellen" element={<Kostenstellen />} />
                <Route path="mahnwesen" element={<Mahnwesen />} />
                <Route path="reports" element={<Reports />} />
                <Route path="datev" element={<Datev />} />
                <Route path="ust" element={<USt />} />
                <Route path="lieferscheine" element={<LieferscheineKosten />} />
              </Route>

              {/* MOBILE */}
              <Route path="/mobile/pruefung/:type" element={<MobilePruefung />} />
              <Route path="/mobile/regieberichte" element={<Navigate to="/buro/regieberichte" replace />} />
              <Route path="/mobile/lieferscheine" element={<Navigate to="/buro/lieferscheine" replace />} />
              <Route path="/mobile/fotos" element={<Navigate to="/buro/fotos" replace />} />
              <Route path="/mobile/tagesberichte" element={<Navigate to="/buro/tagesberichte" replace />} />
              <Route path="/mobile/bautagebuch" element={<Navigate to="/buro/bautagebuch" replace />} />
              <Route path="/mobile/mengenermittlung" element={<Navigate to="/mengenermittlung/aufmasseditor" replace />} />
              <Route path="/mobile/kalkulation" element={<Navigate to="/kalkulation/mit-ki" replace />} />
              <Route path="/mobile/angebote" element={<Navigate to="/buro/angebote" replace />} />
              <Route path="/mobile/abschlagsrechnungen" element={<Navigate to="/buchhaltung/abschlagsrechnungen" replace />} />
              <Route path="/mobile/rechnungen" element={<Navigate to="/buchhaltung/rechnungen" replace />} />
              <Route path="/mobile/outlier-reports" element={<Navigate to="/kalkulation/versionsvergleich" replace />} />

              {/* FALLBACKS */}
              <Route path="/KI" element={<Navigate to="/ki" replace />} />
              <Route path="/:section/:sub" element={<SubsectionEmpty />} />
              <Route path="/" element={<Navigate to="/start" replace />} />
              <Route path="*" element={<Navigate to="/start" replace />} />
            </Routes>
          </div>
        </div>
              <RlcKiAssistant />
      <RlcGlobalProgress />
</div>
    </RequireAuth>
  );
}

/* ------------------ APP ------------------ */

export default function App() {
  return (
    <ProjectProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </ProjectProvider>
  );
}






























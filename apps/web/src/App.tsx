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
import PositionLV from "./pages/mengenermittlung/PositionLV";
import AufmasseKI from "./pages/mengenermittlung/AufmasseKI";
import ImportFiles from "./pages/mengenermittlung/ImportFiles";
import AutoKI from "./pages/mengenermittlung/AutoKi";
import Regieberichte from "./pages/mengenermittlung/Regieberichte";
import ManuellFoto from "./pages/mengenermittlung/ManuellFoto";
import Lieferscheine from "./pages/mengenermittlung/Lieferscheine";
import HistoriePage from "./pages/mengenermittlung/historie";
import GPSZuweisung from "./pages/mengenermittlung/GPSZuweisung";
import SollIst from "./pages/mengenermittlung/SollIst";
import Verknuepfung from "./pages/mengenermittlung/VerknuepfungNachtraegeAbrechnung";
import Auftragsliste from "./pages/mengenermittlung/Auftragsliste";
import Raumbuch from "./pages/mengenermittlung/Raumbuch";
import BilderZumAufmass from "./pages/mengenermittlung/Bilder";
import Neuberechnung from "./pages/mengenermittlung/Neuberechnung";
import Ausdrucke from "./pages/mengenermittlung/Ausdrucke";
import Datenaustausch from "./pages/mengenermittlung/Datenaustausch";
import Stammdaten from "./pages/mengenermittlung/Stammdaten";

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
import Nutzerverwaltung from "./pages/buro/nutzerverwaltung";
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
    items: [
      { key: "auftragsliste", label: "Auftragsliste" },
      { key: "aufmasseditor", label: "Aufmaß-Editor" },
      { key: "position", label: "Mengenermittlung nach Position (LV-gestützt)" },
      { key: "regieberichte", label: "Regieberichte" },
      { key: "manuell", label: "Manuell / per Foto / Sprache" },
      { key: "soll-ist", label: "Aufmaßvergleich: Soll-Ist" },
      { key: "auto", label: "Automatisierte Mengenermittlung" },
      { key: "aufmasse", label: "Aufmaße KI" },
      { key: "import", label: "Import PDF / CAD / LandXML / GSI / CSV" },
      { key: "lieferscheine", label: "Lieferscheine" },
      { key: "verknuepfung", label: "Verknüpfung mit Nachträgen & Abrechnung" },
      { key: "historie", label: "Historie / Aufmaß-Versionierung" },
      { key: "gps", label: "GPS-basierte Positionszuweisung" },
      { key: "raumbuch", label: "Raumbuch / Raumaufmaße" },
      { key: "bilder", label: "Bilder zum Aufmaß" },
      { key: "neuberechnung", label: "Neuberechnung" },
      { key: "ausdrucke", label: "Ausdrucke" },
      { key: "datenaustausch", label: "Datenaustausch" },
      { key: "stammdaten", label: "Stammdaten" },
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

/* ------------------ SIDENAV ------------------ */

function SideNav() {
  const { pathname } = useLocation();
  const currentSectionKey = pathname.split("/")[1] || "";
  const [open, setOpen] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    if (currentSectionKey) {
      setOpen((old) => ({ ...old, [currentSectionKey]: true }));
    }
  }, [currentSectionKey]);

  const toggle = (key: string) => {
    setOpen((old) => ({ ...old, [key]: !old[key] }));
  };

  const topItems = [
    { to: "/start", label: "Start (Projekt auswählen)" },
    { to: "/projekt/uebersicht", label: "Projekt-Übersicht" },
  ];

  return (
    <div className="card">
      <div className="s-title">Projekt</div>

      <div className="s-sub" style={{ paddingBottom: 8 }}>
        {topItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={`s-link ${pathname === item.to ? "active" : ""}`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <div className="hr" />

      <div className="s-title">RLC – Module</div>

      <ul className="s-accordion">
        {SECTIONS.map((section) => {
          const isOpen = !!open[section.key];

          return (
            <li key={section.key} className={`s-sec ${isOpen ? "open" : ""}`}>
              <button
                type="button"
                onClick={() => toggle(section.key)}
                aria-expanded={isOpen}
              >
                <span className="s-sec-title">
                  <span className="s-badge">{section.title.split(".")[0]}</span>
                  <span>{section.title.replace(/^\d+\.\s*/, "")}</span>
                </span>

                <span className="chev">▶</span>
              </button>

              {isOpen ? (
                <div className="s-sub">
                  <Link
                    className={`s-link ${
                      pathname === `/${section.key}` ? "active" : ""
                    }`}
                    to={`/${section.key}`}
                  >
                    Übersicht
                  </Link>

                  {section.items.map((item) => {
                    const active = pathname === `/${section.key}/${item.key}`;

                    return (
                      <Link
                        key={item.key}
                        className={`s-link ${active ? "active" : ""}`}
                        to={`/${section.key}/${item.key}`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
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
        <div className="header">
          <Link
            to="/start"
            className="brand"
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <img src={logo} alt="RLC Logo" style={{ height: 56 }} />
            <span>-Tiefbau -Hochbau -Planungsbüro -Vermessung</span>
          </Link>
        </div>

        <div className="layout">
          <SideNav />

          <div className="content">
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

              {/* MENGENERMITTLUNG */}
              <Route path="/mengenermittlung/auftragsliste" element={<Auftragsliste />} />
              <Route path="/mengenermittlung/aufmasseditor" element={<AufmassEditor />} />
              <Route path="/mengenermittlung/position" element={<PositionLV />} />
              <Route path="/mengenermittlung/manuell" element={<ManuellFoto />} />
              <Route path="/mengenermittlung/aufmasse" element={<AufmasseKI />} />
              <Route path="/mengenermittlung/import" element={<ImportFiles />} />
              <Route path="/mengenermittlung/soll-ist" element={<SollIst />} />
              <Route path="/mengenermittlung/auto" element={<AutoKI />} />
              <Route path="/mengenermittlung/regieberichte" element={<Regieberichte />} />
              <Route path="/mengenermittlung/lieferscheine" element={<Lieferscheine />} />
              <Route path="/mengenermittlung/historie" element={<HistoriePage />} />
              <Route path="/mengenermittlung/gps" element={<GPSZuweisung />} />
              <Route
                path="/mengenermittlung/GPSZuweisung"
                element={<Navigate to="/mengenermittlung/gps" replace />}
              />
              <Route path="/mengenermittlung/verknuepfung" element={<Verknuepfung />} />
              <Route path="/mengenermittlung/raumbuch" element={<Raumbuch />} />
              <Route path="/mengenermittlung/bilder" element={<BilderZumAufmass />} />
              <Route path="/mengenermittlung/neuberechnung" element={<Neuberechnung />} />
              <Route path="/mengenermittlung/ausdrucke" element={<Ausdrucke />} />
              <Route path="/mengenermittlung/datenaustausch" element={<Datenaustausch />} />
              <Route path="/mengenermittlung/stammdaten" element={<Stammdaten />} />

              {/* BÜRO */}
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







import React from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Link,
  useLocation,
  useParams,
  Outlet } from
"react-router-dom";

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
const MobilePage = React.lazy(() => import("./pages/site/software/MobilePage"));
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
const PlatformAdmin = React.lazy(() => import("./pages/admin/PlatformAdmin"));
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
const MarketIntelligence = React.lazy(() => import("./pages/ki/MarketIntelligence"));
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
  return (
    <div className="card rlc-migrated-app-tsx-1">
      RLC lädt…
    </div>);

}

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
  "rlc_mobile_token"];


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
  return pathname === "/" || pathname === "/preise" || pathname === "/login" || pathname === "/software/mobile";
}

function RequireAuth({ children }: {children: React.ReactElement;}) {
  const location = useLocation();
  const token = getAuthToken();

  if (!token) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}${location.hash}` }} />);


  }

  return children;
}

/* ------------------ CONFIG SIDE + MENU ------------------ */

type Section = {
  key: string;
  title: string;
  items: {key: string;label: string;}[];
};

const SECTIONS: Section[] = [
{
  key: "kalkulation",
  title: "1. Kalkulation",
  items: [

  { key: "kalkulationszentrale", label: "Kalkulationszentrale" }, { key: "lv-import", label: "LV / Positionen" },
  { key: "mit-ki", label: "Kalkulation" },
  { key: "datenbank", label: "Kalkulationsdatenbank" },
  { key: "versionsvergleich", label: "Versionsvergleich / Analyse" },
  { key: "crm", label: "CRM / Angebotsverfolgung" }]

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
  { key: "viewer", label: "CAD/Geo" }]

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
  { key: "ki-maengel", label: "Mängelmanagement KI-gestützt" }]

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
  { key: "ueber", label: "Über die App" }]

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
  { key: "lieferscheine", label: "Lieferscheine (Kosten)" }]

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
  { key: "outlier-reports", label: "Outlier Reports" }]

}];


/* ------------------ ÜBERSICHT MAP ------------------ */

const OVERVIEW: Record<string, React.ReactElement> = {
  kalkulation: <Navigate to="/kalkulation/kalkulationszentrale" replace />,
  mengenermittlung: <MengenermittlungUebersicht />,
  cad: <Navigate to="/cad/viewer" replace />,
  buro: <BueroUebersicht />,
  ki: <KIUebersicht />,
  info: <InfoUebersicht />,
  buchhaltung: <BuchhaltungUebersicht />,
  mobile: <MobileUebersicht />
};

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
    </div>);

}

/* ------------------ TOPNAV ------------------ */

function topNavLabel(title: string): string {
  const clean = title.replace(/^\d+\.\s*/, "").trim();

  if (clean === "Mengenermittlung") return "Mengen";
  if (clean === "Büro / Verwaltung") return "Verwaltung";
  if (clean === "Info / Hilfe / Videoerklärung") return "Hilfe";
  if (clean === "CAD / Geo") return "CAD/Geo";

  return clean;
}

function SideNav() {
  const { pathname } = useLocation();
  const [openMenu, setOpenMenu] = React.useState<string | null>(null);

  const topItems = [
  { to: "/start", label: "Projekte öffnen / neu erstellen" },
  { to: "/projekt/uebersicht", label: "Projekt Übersicht" }];


  return (
    <nav className="rlc-top-nav" aria-label="Hauptnavigation">










      
      {topItems.map((item) =>
      <Link
        key={item.to}
        to={item.to}
        className={`rlc-top-nav-button ${pathname === item.to ? "active" : ""}`}
        onClick={() => setOpenMenu(null)}>
        
          {item.label}
        </Link>
      )}

      {SECTIONS.map((section) => {
        const activeSection =
        pathname === `/${section.key}` || pathname.startsWith(`/${section.key}/`);
        const isOpen = openMenu === section.key;

        return (
          <div
            key={section.key}
            className={`rlc-top-nav-group ${isOpen ? "is-open" : ""}`}>
            
            <button
              type="button"
              className={`rlc-top-nav-button ${activeSection ? "active" : ""}`}
              aria-expanded={isOpen}
              onClick={() => setOpenMenu(isOpen ? null : section.key)}>
              
              {topNavLabel(section.title)} ▼
            </button>

            {isOpen ?
            <div className="rlc-top-nav-dropdown">















              
                {section.key !== "cad" ? (
                  <Link
                    className={`s-link ${pathname === `/${section.key}` ? "active" : ""}`}
                    to={`/${section.key}`}
                    onClick={() => setOpenMenu(null)}>
                    Übersicht
                  </Link>
                ) : null}

                {section.items.map((item) => {
                const to = `/${section.key}/${item.key}`;
                const active = pathname === to;

                return (
                  <Link
                    key={item.key}
                    className={`s-link ${active ? "active" : ""}`}
                    to={to}
                    onClick={() => setOpenMenu(null)}>
                    
                      {item.label}
                    </Link>);

              })}
              </div> :
            null}
          </div>);

      })}
    </nav>);

}

/* ------------------ EMPTY PAGES ------------------ */

function SectionList({ sectionKey }: {sectionKey: string;}) {
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
    </div>);

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

        {foundSection ?
        <Link className="link" to={`/${foundSection.key}`}>
            {foundSection.title}
          </Link> :

        <span>Unbekannt</span>
        }

        <span className="sep">/</span>
        <span>{foundItem?.label ?? sub}</span>
      </div>

      <div className="h1">{foundItem?.label ?? sub}</div>

      <div className="empty">
        <h3>Diese Untersektion ist noch leer</h3>
      </div>
    </div>);

}

/* ------------------ SHELL ------------------ */

function AppShell() {
  const { pathname } = useLocation();

  if (isPublicPath(pathname)) {
    return (
      <div className="app rlc-app-shell">
        <React.Suspense fallback={<RouteLoadingFallback />}>
          <Routes>
            <Route path="/" element={<PricingPage />} />
            <Route path="/preise" element={<PricingPage />} />
            <Route path="/software/mobile" element={<MobilePage />} />
            <Route path="/login" element={<Login />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </React.Suspense>
      </div>);

  }

  return (
    <RequireAuth>
      <div className="app rlc-app-shell">
        <div
          className="header rlc-topbar rlc-migrated-app-tsx-7">











          
          <Link
            to="/start"
            className="brand rlc-brand"
            aria-label="RLC Bausoftware – Startseite">
            <span className="rlc-brand-mark" aria-hidden="true">
              <svg viewBox="0 0 48 48" role="presentation">
                <path className="rlc-brand-mark-frame" d="M24 3 42 13.5v21L24 45 6 34.5v-21L24 3Z" />
                <path className="rlc-brand-mark-line" d="m14 18 10-6 10 6-10 6-10-6Zm0 0v12l10 6 10-6V18M24 24v12" />
              </svg>
            </span>
            <span className="rlc-brand-copy">
              <span className="rlc-brand-title">RLC Bausoftware</span>
              <span className="rlc-brand-subtitle">Bau · Kalkulation · Vermessung</span>
            </span>
          </Link>

          <SideNav />
        </div>

        <div className="layout rlc-migrated-app-tsx-9">
          <div
            className={`${`content rlc-content ${pathname.startsWith("/mengenermittlung") ? "meng-theme" : ""}`} rlc-migrated-app-tsx-10`}>

            <React.Suspense fallback={<RouteLoadingFallback />}>
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
                ).map((section) =>
                <Route
                  key={section.key}
                  path={`/${section.key}`}
                  element={
                  OVERVIEW[section.key] ?? <SectionList sectionKey={section.key} />
                  } />

                )}

              {/* CAD */}
              <Route path="/cad" element={<CadLayout />}>
                <Route index element={<Navigate to="/cad/viewer" replace />} />
                <Route path="viewer" element={<CADViewer />} />
                <Route path="asbuild" element={<AsBuilt />} />
                <Route path="tools" element={<CADTools />} />
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
                  element={<Navigate to="/mengenermittlung/gps" replace />} />
                
<Route path="/mengenermittlung/vergleich" element={<Navigate to="/mengenermittlung/soll-ist" replace />} />
              <Route path="/mengenermittlung/bilder" element={<BilderZumAufmass />} />
              <Route path="/mengenermittlung/abrechnungskreise" element={<Abrechnungskreise />} />
              <Route
                  path="/mengenermittlung/ausdrucke"
                  element={<Navigate to="/mengenermittlung/aufmasseditor" replace />} />
                
              <Route
                  path="/mengenermittlung/stammdaten"
                  element={<Navigate to="/kalkulation/datenbank/preise" replace />} />
                
              {/* BÜRO */}
              <Route path="/buro/regieberichte" element={<Regieberichte />} />
              <Route path="/buro/lieferscheine" element={<Lieferscheine />} />
              <Route path="/buro/fotos" element={<ProjektakteFotos />} />
              <Route path="/buro/tagesberichte" element={<Tagesberichte />} />
              <Route path="/buro/bautagebuch" element={<Bautagebuch />} />
              <Route path="/buro/angebote" element={<AngebotPage />} />
              <Route
                  path="/buro/vorlagen"
                  element={
                  <BuroLayout>
                    <VorlagenCenter />
                  </BuroLayout>
                  } />
                
              <Route
                  path="/buro/projekte"
                  element={
                  <BuroLayout>
                    <Projekte />
                  </BuroLayout>
                  } />
                
              <Route
                  path="/buro/dokumente"
                  element={
                  <BuroLayout>
                    <Dokumente />
                  </BuroLayout>
                  } />
                
              <Route
                  path="/buro/kommunikation"
                  element={
                  <BuroLayout>
                    <Kommunikation />
                  </BuroLayout>
                  } />
                
              <Route
                  path="/buro/vertraege"
                  element={
                  <BuroLayout>
                    <Vertraege />
                  </BuroLayout>
                  } />
                
              <Route
                  path="/buro/outlook"
                  element={
                  <BuroLayout>
                    <OutlookKalender />
                  </BuroLayout>
                  } />
                
              <Route
                  path="/buro/nutzerverwaltung"
                  element={
                  <BuroLayout>
                    <Nutzerverwaltung />
                  </BuroLayout>
                  } />
                
              <Route
                  path="/buro/bauzeitenplan"
                  element={
                  <BuroLayout>
                    <Bauzeitenplan />
                  </BuroLayout>
                  } />
                
              <Route
                  path="/buro/personalverwaltung"
                  element={
                  <BuroLayout>
                    <Personalverwaltung />
                  </BuroLayout>
                  } />
                
              <Route
                  path="/buro/maschinenverwaltung"
                  element={
                  <BuroLayout>
                    <Maschinenverwaltung />
                  </BuroLayout>
                  } />
                
              <Route
                  path="/buro/materialverwaltung"
                  element={
                  <BuroLayout>
                    <Materialverwaltung />
                  </BuroLayout>
                  } />
                
              <Route
                  path="/buro/ressourcenplanung"
                  element={
                  <BuroLayout>
                    <Ressourcenplanung />
                  </BuroLayout>
                  } />
                
              <Route
                  path="/buro/sicherheit"
                  element={
                  <BuroLayout>
                    <Sicherheit />
                  </BuroLayout>
                  } />
                
              <Route
                  path="/buro/uebergabe"
                  element={
                  <BuroLayout>
                    <Uebergabe />
                  </BuroLayout>
                  } />
                
              <Route
                  path="/buro/lager"
                  element={
                  <BuroLayout>
                    <Lager />
                  </BuroLayout>
                  } />
                
              <Route
                  path="/buro/tasks"
                  element={
                  <BuroLayout>
                    <Tasks />
                  </BuroLayout>
                  } />
                

              {/* KALKULATION */}
              <Route path="/kalkulation" element={<Navigate to="/kalkulation/kalkulationszentrale" replace />} />
              <Route path="/kalkulation/lv-import" element={<LVImport />} />
              <Route path="/kalkulation/gaeb" element={<GaebPage />} />
              <Route path="/kalkulation/import" element={<ImportPage />} />
              <Route path="/kalkulation/mit-ki" element={<KalkulationMitKI />} />
              <Route
                  path="/kalkulation/datenbank"
                  element={<KalkulationsDatenbankPage />} />
                
              <Route
                  path="/kalkulation/datenbank/position/:id"
                  element={<KalkulationsDatenbankPositionPage />} />
                
              <Route
                  path="/kalkulation/datenbank/preise"
                  element={<PreisePage />} />
                
              <Route
                  path="/kalkulation/preise"
                  element={<Navigate to="/kalkulation/datenbank/preise" replace />} />
                
              <Route path="/kalkulation/nachtraege" element={<NachtraegePage />} />
              <Route path="/kalkulation/angebot" element={<AngebotPage />} />
              <Route
                  path="/kalkulation/versionsvergleich"
                  element={<VersionsvergleichPage />} />
                
              <Route path="/kalkulation/crm" element={<CRMAngebotsverfolgungPage />} />
              <Route path="/kalkulation/rezepte" element={<Recipes />} />

              {/* KALKULATION LEGACY REDIRECTS */}
              <Route
                  path="/kalkulation/lvUpload"
                  element={<Navigate to="/kalkulation/lv-import" replace />} />
                
              <Route
                  path="/kalkulation/lvOhnePreis"
                  element={<Navigate to="/kalkulation/angebot" replace />} />
                
              <Route
                  path="/kalkulation/vergleich"
                  element={<Navigate to="/kalkulation/versionsvergleich" replace />} />
                
              <Route
                  path="/kalkulation/projekt"
                  element={<Navigate to="/start" replace />} />
                
              <Route
                  path="/kalkulation/kalkulationsdatenbank"
                  element={<Navigate to="/kalkulation/datenbank" replace />} />
                
              <Route
                  path="/kalkulation/kalkulationsDatenbank"
                  element={<Navigate to="/kalkulation/datenbank" replace />} />
                
              <Route
                  path="/kalkulation/manuell"
                  element={<Navigate to="/kalkulation/mit-ki" replace />} />
                
              <Route
                  path="/kalkulation/aufschlag"
                  element={<Navigate to="/kalkulation/mit-ki" replace />} />
                
              <Route
                  path="/kalkulation/lv-export"
                  element={<Navigate to="/kalkulation/angebot" replace />} />
                
              <Route
                  path="/kalkulation/recipes"
                  element={<Navigate to="/kalkulation/rezepte" replace />} />
                

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

              {/* RLC KI-FUNKTIONEN IN FACHBEREICHE VERSCHOBEN */}

              {/* Mengenermittlung */}
              <Route
                  path="/mengenermittlung/ki-fotoerkennung"
                  element={<Navigate to="/ki/fotoerkennung" replace />} />
                
              <Route
                  path="/mengenermittlung/ki-auto-abrechnung"
                  element={<Navigate to="/ki/auto-abrechnung" replace />} />
                

              {/* Büro / Verwaltung */}
              <Route
                  path="/buro/ki-sprachsteuerung"
                  element={<Navigate to="/ki/sprachsteuerung" replace />} />
                
              <Route
                  path="/buro/ki-regie-auto"
                  element={<Navigate to="/ki/regie-auto" replace />} />
                
              <Route
                  path="/buro/ki-optimierung"
                  element={<Navigate to="/ki/optimierung" replace />} />
                
              <Route
                  path="/buro/ki-maengel"
                  element={<Navigate to="/ki/maengel" replace />} />
                
              {/* KI */}
              <Route path="/ki" element={<KILayout />}>
                <Route index element={<KIUebersicht />} />
                <Route path="fotoerkennung" element={<KIFotoerkennung />} />
                <Route path="sprachsteuerung" element={<KISprachsteuerung />} />
                <Route path="auto-abrechnung" element={<KIAutoAbrechnung />} />
                <Route path="regie-auto" element={<KIRegieAuto />} />
                <Route path="optimierung" element={<KIOptimierung />} />
                <Route path="maengel" element={<KIMaengel />} />
                <Route path="market-intelligence" element={<MarketIntelligence />} />
              </Route>

              {/* KONSOLIDIERTE KI-KALKULATIONSFUNKTIONEN */}
              <Route path="/kalkulation/ki-auto-lv" element={<Navigate to="/kalkulation/mit-ki" replace />} />
              <Route path="/kalkulation/ki-vorschlaege" element={<Navigate to="/kalkulation/lv-import" replace />} />
              <Route path="/kalkulation/ki-widersprueche" element={<Navigate to="/kalkulation/versionsvergleich?tab=pruefung" replace />} />
              <Route path="/kalkulation/ki-bewertung-analyse" element={<Navigate to="/kalkulation/versionsvergleich?tab=ranking" replace />} />
              <Route path="/ki/auto-lv" element={<Navigate to="/kalkulation/mit-ki" replace />} />
              <Route path="/ki/vorschlaege" element={<Navigate to="/kalkulation/lv-import" replace />} />
              <Route path="/ki/widersprueche" element={<Navigate to="/kalkulation/versionsvergleich?tab=pruefung" replace />} />
              <Route path="/ki/bewertung-analyse" element={<Navigate to="/kalkulation/versionsvergleich?tab=ranking" replace />} />

              {/* KI LEGACY REDIRECTS: alte Links bleiben funktionsfähig */}
              <Route path="/ki/lv-auto" element={<Navigate to="/kalkulation/mit-ki" replace />} />
              <Route path="/ki/foto" element={<Navigate to="/ki/fotoerkennung" replace />} />
              <Route path="/ki/sprach" element={<Navigate to="/ki/sprachsteuerung" replace />} />
              <Route path="/ki/bewertung" element={<Navigate to="/kalkulation/versionsvergleich?tab=ranking" replace />} />
              <Route path="/ki/abrechnung-auto" element={<Navigate to="/ki/auto-abrechnung" replace />} />
              <Route path="/ki/nachtraege" element={<Navigate to="/kalkulation/nachtraege" replace />} />
              <Route path="/ki/analyse" element={<Navigate to="/kalkulation/versionsvergleich" replace />} />

              {/* BUCHHALTUNG */}
              <Route path="/buchhaltung/*" element={<BuchhaltungLayout />}>
                <Route index element={<Uebersicht />} />
                <Route path="kostenuebersicht" element={<Kostenuebersicht />} />
                <Route path="rechnungen" element={<Rechnungen />} />
                <Route
                    path="abschlagsrechnungen"
                    element={<AbschlagsrechnungenPage />} />
                  
                <Route
                    path="abschlagsrechnungen/:id"
                    element={<AbschlagsrechnungDetail />} />
                  
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
              <Route path="/mobile/regieberichte" element={<Navigate to="/mobile/pruefung/REGIE" replace />} />
              <Route path="/mobile/lieferscheine" element={<Navigate to="/mobile/pruefung/LIEFERSCHEIN" replace />} />
              <Route path="/mobile/fotos" element={<Navigate to="/mobile/pruefung/FOTOS" replace />} />
              <Route path="/mobile/tagesberichte" element={<Navigate to="/mobile/pruefung/TAGESBERICHT" replace />} />
              <Route path="/mobile/bautagebuch" element={<Navigate to="/mobile/pruefung/BAUTAGEBUCH" replace />} />
              <Route path="/mobile/arbeitszeiten" element={<MobileArbeitszeiten />} />
<Route path="/mobile/arbeitszeiten/mitarbeiter" element={<MobileMitarbeiterEingaenge />} />
              <Route path="/mobile/mengenermittlung" element={<Navigate to="/mobile/pruefung/MENGENERMITTLUNG" replace />} />
              <Route path="/mobile/kalkulation" element={<Navigate to="/kalkulation/mit-ki" replace />} />
              <Route path="/mobile/angebote" element={<Navigate to="/mobile/pruefung/ANGEBOT" replace />} />
              <Route path="/mobile/abschlagsrechnungen" element={<Navigate to="/mobile/pruefung/ABSCHLAGSRECHNUNG" replace />} />
              <Route path="/mobile/rechnungen" element={<Navigate to="/mobile/pruefung/RECHNUNG" replace />} />
              <Route path="/mobile/outlier-reports" element={<Navigate to="/kalkulation/versionsvergleich" replace />} />

              {/* RLC PLATFORM ADMIN */}
              <Route path="/portal" element={<PlatformAdmin />} />
              <Route path="/platform/admin" element={<Navigate to="/portal" replace />} />

              {/* FALLBACKS */}
              <Route path="/KI" element={<Navigate to="/ki" replace />} />
              <Route path="/:section/:sub" element={<SubsectionEmpty />} />
              <Route path="/" element={<Navigate to="/start" replace />} />
              <Route path="/kalkulation/kalkulationszentrale" element={<Kalkulationszentrale />} />
              <Route path="*" element={<Navigate to="/start" replace />} />
              </Routes>
            </React.Suspense>
          </div>
        </div>
              <DocumentDeliveryCenter />
              <RlcKiAssistant />
      <RlcGlobalProgress />
</div>
    </RequireAuth>);

}

/* ------------------ APP ------------------ */

export default function App() {
  return (
    <ProjectProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </ProjectProvider>);

}


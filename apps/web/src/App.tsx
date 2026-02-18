// App.tsx
import React from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Link,
  useLocation,
  useParams,
} from "react-router-dom";

import "./styles.css";
import logo from "/logo.svg";
import { ProjectProvider, useProject } from "./store/useProject";

/* =========================================================
   PROD HARDENING (Web build)
   - Disable noisy logs in production build
   - Keep warn/error for diagnostics
   ========================================================= */
const IS_PROD =
  (import.meta as any)?.env?.MODE === "production" ||
  (import.meta as any)?.env?.PROD === true;

if (IS_PROD) {
  // eslint-disable-next-line no-console
  console.log = () => {};
  // eslint-disable-next-line no-console
  console.debug = () => {};
  // eslint-disable-next-line no-console
  console.info = () => {};
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
const OVERVIEW: Record<string, JSX.Element> = {
  kalkulation: <KalkulationUebersicht />,
  mengenermittlung: <MengenermittlungUebersicht />,
  cad: <CADUebersicht />,
  buro: <BueroUebersicht />,
  ki: <KIUebersicht />,
  info: <InfoUebersicht />,
  buchhaltung: <BuchhaltungUebersicht />,
};

/* ------------------ SIDENAV (accordion) ------------------ */
function SideNav() {
  const { pathname } = useLocation();
  const currentSectionKey = pathname.split("/")[1] || "";
  const [open, setOpen] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    if (currentSectionKey) setOpen((o) => ({ ...o, [currentSectionKey]: true }));
  }, [currentSectionKey]);

  const toggle = (key: string) => setOpen((o) => ({ ...o, [key]: !o[key] }));

  const topItems = [
    { to: "/start", label: "Start (Projekt auswählen)" },
    { to: "/projekt/uebersicht", label: "Projekt-Übersicht" },
  ];

  return (
    <div className="card">
      <div className="s-title">Projekt</div>
      <div className="s-sub" style={{ paddingBottom: 8 }}>
        {topItems.map((it) => (
          <Link
            key={it.to}
            to={it.to}
            className={`s-link ${pathname === it.to ? "active" : ""}`}
          >
            {it.label}
          </Link>
        ))}
      </div>
      <div className="hr" />
      <div className="s-title">RLC – Module</div>
      <ul className="s-accordion">
        {SECTIONS.map((s) => {
          const isOpen = !!open[s.key];
          return (
            <li key={s.key} className={`s-sec ${isOpen ? "open" : ""}`}>
              <button onClick={() => toggle(s.key)} aria-expanded={isOpen}>
                <span className="s-sec-title">
                  <span className="s-badge">{s.title.split(".")[0]}</span>
                  <span>{s.title.replace(/^\d+\.\s*/, "")}</span>
                </span>
                <span className="chev">▶</span>
              </button>
              {isOpen && (
                <div className="s-sub">
                  <Link
                    className={`s-link ${
                      pathname === `/${s.key}` ? "active" : ""
                    }`}
                    to={`/${s.key}`}
                  >
                    Übersicht
                  </Link>
                  {s.items.map((it) => {
                    const active = pathname === `/${s.key}/${it.key}`;
                    return (
                      <Link
                        key={it.key}
                        className={`s-link ${active ? "active" : ""}`}
                        to={`/${s.key}/${it.key}`}
                      >
                        {it.label}
                      </Link>
                    );
                  })}
                </div>
              )}
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

  if (pathname.startsWith("/start")) return null;

  const cur = ctx?.currentProject || ctx?.selectedProject || null;

  if (!cur) {
    return (
      <div
        className="card"
        style={{ marginBottom: 12, padding: "8px 12px", fontSize: 13 }}
      >
        Kein Projekt gewählt. Bitte zuerst unter{" "}
        <b>Start (Projekt auswählen)</b> ein Projekt auswählen.
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
      }}
    >
      <div>
        <span style={{ fontWeight: 700 }}>{cur.code}</span> – {cur.name}
        {cur.client ? <> • {cur.client}</> : null}
        {cur.place ? <> • {cur.place}</> : null}
      </div>
      <Link to="/projekt/uebersicht" className="link" style={{ fontSize: 12 }}>
        Zur Projekt-Übersicht →
      </Link>
    </div>
  );
}

/* ------------------ PAGINE NEUTRE ------------------ */
function SectionList({ sectionKey }: { sectionKey: string }) {
  const s = SECTIONS.find((x) => x.key === sectionKey);
  if (!s) return <div className="card">Unbekannte Sektion.</div>;
  return (
    <div className="card">
      <div className="breadcrumbs">
        <span>RLC</span>
        <span className="sep">/</span>
        <span>{s.title}</span>
      </div>
      <div className="h1">{s.title}</div>
      <div className="empty">
        <h3>Übersicht</h3>
        <p>Wähle links eine Untersektion.</p>
      </div>
    </div>
  );
}

function SubsectionEmpty() {
  const { section, sub } = useParams();
  const s = SECTIONS.find((x) => x.key === section);
  const it = s?.items.find((i) => i.key === sub);
  return (
    <div className="card">
      <div className="breadcrumbs">
        <Link className="link" to="/">
          RLC
        </Link>
        <span className="sep">/</span>
        {s ? (
          <Link className="link" to={`/${s.key}`}>
            {s.title}
          </Link>
        ) : (
          <span>Unbekannt</span>
        )}
        <span className="sep">/</span>
        <span>{it?.label ?? sub}</span>
      </div>
      <div className="h1">{it?.label ?? sub}</div>
      <div className="empty">
        <h3>Diese Untersektion ist noch leer</h3>
      </div>
    </div>
  );
}

/* ------------------ APP ------------------ */
export default function App() {
  return (
    <ProjectProvider>
      <BrowserRouter>
        <div className="app">
          <div className="header">
            <Link
              to="/"
              className="brand"
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <img src={logo} alt="RLC Logo" style={{ height: 200 }} />
              -Tiefbau -Hochbau -Planungsbüro -Vermessung
            </Link>
          </div>

          <div className="layout">
            <SideNav />

            <div className="content">
              <CurrentProjectBar />

              <Routes>
                {/* Start */}
                <Route path="/start" element={<ProjectPage />} />
                <Route
                  path="/projekt/uebersicht"
                  element={<ProjektUebersicht />}
                />

                {/* Übersicht per sezione */}
                {SECTIONS.map((s) => (
                  <Route
                    key={s.key}
                    path={`/${s.key}`}
                    element={OVERVIEW[s.key] ?? <SectionList sectionKey={s.key} />}
                  />
                ))}

                {/* Mengenermittlung */}
                <Route
                  path="/mengenermittlung/aufmasseditor"
                  element={<AufmassEditor />}
                />
                <Route path="/mengenermittlung/position" element={<PositionLV />} />
                <Route path="/mengenermittlung/manuell" element={<ManuellFoto />} />
                <Route path="/mengenermittlung/aufmasse" element={<AufmasseKI />} />
                <Route path="/mengenermittlung/import" element={<ImportFiles />} />
                <Route path="/mengenermittlung/soll-ist" element={<SollIst />} />
                <Route path="/mengenermittlung/auto" element={<AutoKI />} />
                <Route
                  path="/mengenermittlung/regieberichte"
                  element={<Regieberichte />}
                />
                <Route
                  path="/mengenermittlung/lieferscheine"
                  element={<Lieferscheine />}
                />
                <Route path="/mengenermittlung/historie" element={<HistoriePage />} />
                <Route path="/mengenermittlung/gps" element={<GPSZuweisung />} />
                <Route
                  path="/mengenermittlung/GPSZuweisung"
                  element={<Navigate to="/mengenermittlung/gps" replace />}
                />
                <Route
                  path="/mengenermittlung/verknuepfung"
                  element={<Verknuepfung />}
                />

                {/* Büro */}
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
                <Route path="/buro/outlook" element={<OutlookKalender />} />
                <Route path="/buro/nutzerverwaltung" element={<Nutzerverwaltung />} />
                <Route path="/buro/bauzeitenplan" element={<Bauzeitenplan />} />
                <Route
                  path="/buro/personalverwaltung"
                  element={<Personalverwaltung />}
                />
                <Route
                  path="/buro/maschinenverwaltung"
                  element={<Maschinenverwaltung />}
                />
                <Route
                  path="/buro/materialverwaltung"
                  element={<Materialverwaltung />}
                />
                <Route
                  path="/buro/ressourcenplanung"
                  element={<Ressourcenplanung />}
                />
                <Route path="/buro/sicherheit" element={<Sicherheit />} />
                <Route path="/buro/uebergabe" element={<Uebergabe />} />
                <Route path="/buro/lager" element={<Lager />} />
                <Route
                  path="/buro/tasks"
                  element={
                    <BuroLayout>
                      <Tasks />
                    </BuroLayout>
                  }
                />

                {/* Kalkulation */}
                <Route path="/kalkulation/lv-import" element={<LVImport />} />
                <Route path="/kalkulation/gaeb" element={<GaebPage />} />
                <Route path="/import" element={<ImportPage />} />
                <Route path="/kalkulation/mit-ki" element={<KalkulationMitKI />} />
                <Route path="/kalkulation/manuell" element={<Manuell />} />
                <Route path="/kalkulation/nachtraege" element={<NachtraegePage />} />
                <Route path="/kalkulation/angebot" element={<AngebotPage />} />
                <Route path="/kalkulation/preise" element={<PreisePage />} />
                <Route
                  path="/kalkulation/versionsvergleich"
                  element={<VersionsvergleichPage />}
                />
                <Route path="/kalkulation/aufschlag" element={<AufschlagPage />} />
                <Route
                  path="/kalkulation/lv-export"
                  element={<LVExportOhnePreisePage />}
                />
                <Route
                  path="/kalkulation/crm"
                  element={<CRMAngebotsverfolgungPage />}
                />
                <Route path="/kalkulation" element={<KalkulationUebersicht />} />
                <Route path="/kalkulation/rezepte" element={<Recipes />} />


                {/* CAD / PDF */}
                <Route path="/cad/viewer" element={<CADViewer />} />
                <Route path="/cad/pdf-viewer" element={<PDFViewer />} />
                <Route path="/cad/map" element={<CadWithMap />} />

                {/* KI (nested layout) */}
                <Route path="/ki" element={<KILayout />}>
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

                {/* BUCHHALTUNG (Layout + Outlet) */}
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

                {/* alias */}
                <Route path="/KI" element={<Navigate to="/ki" replace />} />

                {/* GENERIC SUBSECTION FALLBACK */}
                <Route path="/:section/:sub" element={<SubsectionEmpty />} />

                {/* home + catch-all */}
                <Route path="/" element={<Navigate to="/kalkulation" replace />} />
                <Route path="*" element={<Navigate to="/start" replace />} />
              </Routes>
            </div>
          </div>
        </div>
      </BrowserRouter>
    </ProjectProvider>
  );
}

import { Routes, Route, Navigate } from "react-router-dom";
import Placeholder from "./shared/Placeholder";
import AufmassEditor from "./pages/mengenermittlung/AufmassEditor";
// apps/web/src/router.tsx
import { Routes, Route, Navigate } from "react-router-dom";
import { createBrowserRouter } from "react-router-dom";
import Home from "./pages/home";

// ⬇️ CAD
import CadLayout from "./pages/cad";
import CadEditor2D from "./pages/cad/Editor2D";

export const router = createBrowserRouter([
  { path: "/", element: <Home /> },
  {
    path: "/cad",
    element: <CadLayout />,
    children: [
      { index: true, element: <Navigate to="/cad/editor2d" replace /> },
      { path: "editor2d", element: <CadEditor2D /> },
    ],
  },
]);

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/kalkulation/projekt" replace />} />
      {/* …le tue altre Route già esistenti… */}
    </Routes>
  );
}


export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/kalkulation/projekt" replace />} />

      {/* 1. Kalkulation */}
      <Route path="/kalkulation/projekt" element={<Placeholder title="Projekt wählen" />} />
      <Route path="/kalkulation/lv" element={<Placeholder title="Leistungsverzeichnis" />} />
      <Route path="/kalkulation/ki" element={<Placeholder title="KI-Kalkulation" />} />
      <Route path="/kalkulation/manuell" element={<Placeholder title="Manuelle Kalkulation" />} />
      <Route path="/kalkulation/nachtraege" element={<Placeholder title="Nachträge" />} />
      <Route path="/kalkulation/angebot" element={<Placeholder title="Angebot (PDF/Excel)" />} />

      {/* 2. Mengenermittlung */}
      <Route path="/mengenermittlung/position" element={<Placeholder title="Mengenermittlung nach Position" />} />
      <Route path="/mengenermittlung/manuell" element={<Placeholder title="Manuell / Foto / Sprache" />} />
      <Route path="/mengenermittlung/aufmaseditor" element={<AufmassEditor />} /> {/* operativo */}
      <Route path="/mengenermittlung/sollist" element={<Placeholder title="Soll-Ist-Vergleich" />} />
      <Route path="/mengenermittlung/berichte" element={<Placeholder title="Berichte" />} />

      {/* 3–7: placeholder per ora, struttura fissa */}
      <Route path="/cad/editor2d" element={<CadEditor2D />} />
      <Route path="/cad/import" element={<Placeholder title="DWG/DXF/IFC Import" />} />
      <Route path="/cad/asbuilt" element={<Placeholder title="As-Built" />} />

      <Route path="/buero/projekte" element={<Placeholder title="Projektverwaltung" />} />
      <Route path="/buero/dms" element={<Placeholder title="Dokumentenmanagement" />} />
      <Route path="/buero/aufgaben" element={<Placeholder title="Kommunikation & Aufgaben" />} />

      <Route path="/ki/lv" element={<Placeholder title="LV-Vorschläge" />} />
      <Route path="/ki/foto" element={<Placeholder title="Fotoerkennung" />} />
      <Route path="/ki/abrechnung" element={<Placeholder title="Automatische Abrechnung" />} />

      <Route path="/hilfe/guides" element={<Placeholder title="Kurzanleitungen" />} />
      <Route path="/hilfe/videos" element={<Placeholder title="Video-Tutorials" />} />
      <Route path="/hilfe/support" element={<Placeholder title="Support" />} />

      <Route path="/buchhaltung/kosten" element={<Placeholder title="Kostenübersicht" />} />
      <Route path="/buchhaltung/rechnungen" element={<Placeholder title="Rechnungen" />} />
      <Route path="/buchhaltung/kpi" element={<Placeholder title="KPI Dashboard" />} />

      {/* fallback */}
      <Route path="*" element={<Placeholder title="Seite nicht gefunden" />} />
    </Routes>
  );
}

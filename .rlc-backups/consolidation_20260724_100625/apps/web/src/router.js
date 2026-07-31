import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Routes, Route, Navigate } from "react-router-dom";
import Placeholder from "./shared/Placeholder";
import AufmassEditor from "./pages/mengenermittlung/AufmassEditor";
import { createBrowserRouter } from "react-router-dom";
import Home from "./pages/home";
// ⬇️ CAD
import CadLayout from "./pages/cad";
import CadEditor2D from "./pages/cad/Editor2D";
export const router = createBrowserRouter([
    { path: "/", element: _jsx(Home, {}) },
    {
        path: "/cad",
        element: _jsx(CadLayout, {}),
        children: [
            { index: true, element: _jsx(Navigate, { to: "/cad/editor2d", replace: true }) },
            { path: "editor2d", element: _jsx(CadEditor2D, {}) },
        ],
    },
]);
export function AppRoutes() {
    return (_jsx(Routes, { children: _jsx(Route, { path: "/", element: _jsx(Navigate, { to: "/kalkulation/projekt", replace: true }) }) }));
}
export function AppRoutes() {
    return (_jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(Navigate, { to: "/kalkulation/projekt", replace: true }) }), _jsx(Route, { path: "/kalkulation/projekt", element: _jsx(Placeholder, { title: "Projekt w\u00E4hlen" }) }), _jsx(Route, { path: "/kalkulation/lv", element: _jsx(Placeholder, { title: "Leistungsverzeichnis" }) }), _jsx(Route, { path: "/kalkulation/ki", element: _jsx(Placeholder, { title: "KI-Kalkulation" }) }), _jsx(Route, { path: "/kalkulation/manuell", element: _jsx(Placeholder, { title: "Manuelle Kalkulation" }) }), _jsx(Route, { path: "/kalkulation/nachtraege", element: _jsx(Placeholder, { title: "Nachtr\u00E4ge" }) }), _jsx(Route, { path: "/kalkulation/angebot", element: _jsx(Placeholder, { title: "Angebot (PDF/Excel)" }) }), _jsx(Route, { path: "/mengenermittlung/position", element: _jsx(Placeholder, { title: "Mengenermittlung nach Position" }) }), _jsx(Route, { path: "/mengenermittlung/manuell", element: _jsx(Placeholder, { title: "Manuell / Foto / Sprache" }) }), _jsx(Route, { path: "/mengenermittlung/aufmaseditor", element: _jsx(AufmassEditor, {}) }), " ", _jsx(Route, { path: "/mengenermittlung/sollist", element: _jsx(Placeholder, { title: "Soll-Ist-Vergleich" }) }), _jsx(Route, { path: "/mengenermittlung/berichte", element: _jsx(Placeholder, { title: "Berichte" }) }), _jsx(Route, { path: "/cad/editor2d", element: _jsx(CadEditor2D, {}) }), _jsx(Route, { path: "/cad/import", element: _jsx(Placeholder, { title: "DWG/DXF/IFC Import" }) }), _jsx(Route, { path: "/cad/asbuilt", element: _jsx(Placeholder, { title: "As-Built" }) }), _jsx(Route, { path: "/buero/projekte", element: _jsx(Placeholder, { title: "Projektverwaltung" }) }), _jsx(Route, { path: "/buero/dms", element: _jsx(Placeholder, { title: "Dokumentenmanagement" }) }), _jsx(Route, { path: "/buero/aufgaben", element: _jsx(Placeholder, { title: "Kommunikation & Aufgaben" }) }), _jsx(Route, { path: "/ki/lv", element: _jsx(Placeholder, { title: "LV-Vorschl\u00E4ge" }) }), _jsx(Route, { path: "/ki/foto", element: _jsx(Placeholder, { title: "Fotoerkennung" }) }), _jsx(Route, { path: "/ki/abrechnung", element: _jsx(Placeholder, { title: "Automatische Abrechnung" }) }), _jsx(Route, { path: "/hilfe/guides", element: _jsx(Placeholder, { title: "Kurzanleitungen" }) }), _jsx(Route, { path: "/hilfe/videos", element: _jsx(Placeholder, { title: "Video-Tutorials" }) }), _jsx(Route, { path: "/hilfe/support", element: _jsx(Placeholder, { title: "Support" }) }), _jsx(Route, { path: "/buchhaltung/kosten", element: _jsx(Placeholder, { title: "Kosten\u00FCbersicht" }) }), _jsx(Route, { path: "/buchhaltung/rechnungen", element: _jsx(Placeholder, { title: "Rechnungen" }) }), _jsx(Route, { path: "/buchhaltung/kpi", element: _jsx(Placeholder, { title: "KPI Dashboard" }) }), _jsx(Route, { path: "*", element: _jsx(Placeholder, { title: "Seite nicht gefunden" }) })] }));
}

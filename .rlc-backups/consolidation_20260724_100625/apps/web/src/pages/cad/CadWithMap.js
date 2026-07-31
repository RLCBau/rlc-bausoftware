import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// apps/web/src/pages/cad/CadWithMap.tsx
import React from "react";
import CADViewer from "./CADViewer";
import { CadGeoMap } from "./CadGeoMap";
import { solveSimilarity2Points, worldToLatLng } from "./cadGeoTransform";
function Btn(props) {
    return (_jsx("button", { ...props, className: "btn", style: {
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid #343a46",
            background: "#1d2330",
            color: "#e7e9ee",
            cursor: "pointer",
            fontWeight: 800,
            ...(props.style || {}),
        } }));
}
export default function CadWithMap() {
    const mapRef = React.useRef(null);
    const [shape, setShape] = React.useState(null);
    // calibrazione: A e B
    const [A, setA] = React.useState({});
    const [B, setB] = React.useState({});
    const [T, setT] = React.useState(null);
    // modalità: dove salvare il prossimo click
    const [pickTarget, setPickTarget] = React.useState(null);
    const [pickSource, setPickSource] = React.useState(null);
    function resetCalibration() {
        setA({});
        setB({});
        setT(null);
        setShape(null);
        mapRef.current?.setShape(null);
    }
    function trySolve() {
        if (!A.world || !A.map || !B.world || !B.map)
            return;
        const tr = solveSimilarity2Points(A.world, B.world, A.map, B.map);
        setT(tr);
        if (tr) {
            // mostra una linea A->B in mappa come test
            const pts = [worldToLatLng(A.world, tr), worldToLatLng(B.world, tr)];
            const s = { type: "line", pts };
            setShape(s);
            mapRef.current?.setShape(s);
            mapRef.current?.fitToShape();
        }
    }
    // riceve click dal CAD (world XY)
    function handleCadWorldClick(p) {
        if (!pickTarget || pickSource !== "cad")
            return;
        if (pickTarget === "A")
            setA((prev) => ({ ...prev, world: p }));
        if (pickTarget === "B")
            setB((prev) => ({ ...prev, world: p }));
        // dopo pick, resta nello stesso target finché non prendi anche la parte mappa
    }
    // riceve click dalla mappa (lat/lng)
    function handleMapClick(p) {
        if (!pickTarget || pickSource !== "map")
            return;
        if (pickTarget === "A")
            setA((prev) => ({ ...prev, map: p }));
        if (pickTarget === "B")
            setB((prev) => ({ ...prev, map: p }));
    }
    // auto-solve quando A e B completi
    React.useEffect(() => {
        trySolve();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [A.world, A.map, B.world, B.map]);
    // helper: testo stato
    function fmtWorld(p) {
        if (!p)
            return "—";
        return `${p.x.toFixed(2)}, ${p.y.toFixed(2)}`;
    }
    function fmtMap(p) {
        if (!p)
            return "—";
        return `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`;
    }
    // demo: disegna un punto CAD attuale sulla mappa (se calibrato)
    function pushPointToMap(world) {
        if (!T)
            return alert("Prima calibra con A/B (CAD ↔ Mappa).");
        const ll = worldToLatLng(world, T);
        const s = { type: "points", pts: [ll] };
        setShape(s);
        mapRef.current?.setShape(s);
        mapRef.current?.fitToShape();
    }
    return (_jsxs("div", { style: { display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: 16 }, children: [_jsxs("div", { children: [_jsxs("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }, children: [_jsx(Btn, { onClick: () => {
                                    setPickTarget("A");
                                    setPickSource("cad");
                                }, title: "Poi clicca nel CAD in editor mode", children: "Pick A in CAD" }), _jsx(Btn, { onClick: () => {
                                    setPickTarget("A");
                                    setPickSource("map");
                                }, title: "Poi clicca sulla mappa", children: "Pick A in Map" }), _jsx(Btn, { onClick: () => {
                                    setPickTarget("B");
                                    setPickSource("cad");
                                }, title: "Poi clicca nel CAD in editor mode", children: "Pick B in CAD" }), _jsx(Btn, { onClick: () => {
                                    setPickTarget("B");
                                    setPickSource("map");
                                }, title: "Poi clicca sulla mappa", children: "Pick B in Map" }), _jsx(Btn, { onClick: resetCalibration, children: "Reset" }), _jsx("div", { style: { flex: 1 } }), _jsx(Btn, { onClick: () => {
                                    // esempio: manda origine CAD (0,0) su mappa
                                    pushPointToMap({ x: 0, y: 0 });
                                }, children: "Map: CAD (0,0)" })] }), _jsxs("div", { className: "card", style: { padding: 12, marginBottom: 10, border: "1px solid #2d3036", background: "#141821", color: "#e7e9ee", borderRadius: 12 }, children: [_jsxs("div", { style: { display: "grid", gridTemplateColumns: "120px 1fr", gap: 8, fontSize: 12 }, children: [_jsx("div", { style: { opacity: 0.8 }, children: "A (CAD)" }), _jsx("div", { children: fmtWorld(A.world) }), _jsx("div", { style: { opacity: 0.8 }, children: "A (Map)" }), _jsx("div", { children: fmtMap(A.map) }), _jsx("div", { style: { opacity: 0.8 }, children: "B (CAD)" }), _jsx("div", { children: fmtWorld(B.world) }), _jsx("div", { style: { opacity: 0.8 }, children: "B (Map)" }), _jsx("div", { children: fmtMap(B.map) }), _jsx("div", { style: { opacity: 0.8 }, children: "Transform" }), _jsx("div", { children: T ? `OK (scale=${T.s.toFixed(6)})` : "—" })] }), _jsx("div", { style: { marginTop: 8, fontSize: 12, opacity: 0.7 }, children: "Workflow: Pick A CAD \u2192 Pick A Map \u2192 Pick B CAD \u2192 Pick B Map. Dopo 2 coppie, la mappa pu\u00F2 disegnare geometrie dal CAD." })] }), _jsx(CADViewer, { onWorldClick: handleCadWorldClick })] }), _jsx("div", { children: _jsx(CadGeoMap, { ref: mapRef, shape: shape, onMapClick: handleMapClick, autoFit: true }) })] }));
}

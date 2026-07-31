// apps/web/src/pages/cad/CadWithMap.tsx
import React from "react";
import CADViewer from "./CADViewer";
import { CadGeoMap, CadGeoMapHandle, GeoShape, LatLng } from "./CadGeoMap";
import { solveSimilarity2Points, worldToLatLng, type V2, type Similarity } from "./cadGeoTransform";

type AnchorPair = {
  world?: V2; // punto CAD (world XY)
  map?: LatLng; // punto mappa (lat/lng)
};

function Btn(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="btn"
      style={{
        padding: "8px 10px",
        borderRadius: 10,
        border: "1px solid #343a46",
        background: "#1d2330",
        color: "#e7e9ee",
        cursor: "pointer",
        fontWeight: 800,
        ...(props.style || {}),
      }}
    />
  );
}

export default function CadWithMap() {
  const mapRef = React.useRef<CadGeoMapHandle | null>(null);

  const [shape, setShape] = React.useState<GeoShape | null>(null);

  // calibrazione: A e B
  const [A, setA] = React.useState<AnchorPair>({});
  const [B, setB] = React.useState<AnchorPair>({});
  const [T, setT] = React.useState<Similarity | null>(null);

  // modalità: dove salvare il prossimo click
  const [pickTarget, setPickTarget] = React.useState<"A" | "B" | null>(null);
  const [pickSource, setPickSource] = React.useState<"cad" | "map" | null>(null);

  function resetCalibration() {
    setA({});
    setB({});
    setT(null);
    setShape(null);
    mapRef.current?.setShape(null);
  }

  function trySolve() {
    if (!A.world || !A.map || !B.world || !B.map) return;
    const tr = solveSimilarity2Points(A.world, B.world, A.map, B.map);
    setT(tr);
    if (tr) {
      // mostra una linea A->B in mappa come test
      const pts = [worldToLatLng(A.world, tr), worldToLatLng(B.world, tr)];
      const s: GeoShape = { type: "line", pts };
      setShape(s);
      mapRef.current?.setShape(s);
      mapRef.current?.fitToShape();
    }
  }

  // riceve click dal CAD (world XY)
  function handleCadWorldClick(p: V2) {
    if (!pickTarget || pickSource !== "cad") return;

    if (pickTarget === "A") setA((prev) => ({ ...prev, world: p }));
    if (pickTarget === "B") setB((prev) => ({ ...prev, world: p }));

    // dopo pick, resta nello stesso target finché non prendi anche la parte mappa
  }

  // riceve click dalla mappa (lat/lng)
  function handleMapClick(p: LatLng) {
    if (!pickTarget || pickSource !== "map") return;

    if (pickTarget === "A") setA((prev) => ({ ...prev, map: p }));
    if (pickTarget === "B") setB((prev) => ({ ...prev, map: p }));
  }

  // auto-solve quando A e B completi
  React.useEffect(() => {
    trySolve();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [A.world, A.map, B.world, B.map]);

  // helper: testo stato
  function fmtWorld(p?: V2) {
    if (!p) return "—";
    return `${p.x.toFixed(2)}, ${p.y.toFixed(2)}`;
  }
  function fmtMap(p?: LatLng) {
    if (!p) return "—";
    return `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`;
  }

  // demo: disegna un punto CAD attuale sulla mappa (se calibrato)
  function pushPointToMap(world: V2) {
    if (!T) return alert("Prima calibra con A/B (CAD ↔ Mappa).");
    const ll = worldToLatLng(world, T);
    const s: GeoShape = { type: "points", pts: [ll] };
    setShape(s);
    mapRef.current?.setShape(s);
    mapRef.current?.fitToShape();
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: 16 }}>
      {/* LEFT: CAD */}
      <div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <Btn
            onClick={() => {
              setPickTarget("A");
              setPickSource("cad");
            }}
            title="Poi clicca nel CAD in editor mode"
          >
            Pick A in CAD
          </Btn>
          <Btn
            onClick={() => {
              setPickTarget("A");
              setPickSource("map");
            }}
            title="Poi clicca sulla mappa"
          >
            Pick A in Map
          </Btn>

          <Btn
            onClick={() => {
              setPickTarget("B");
              setPickSource("cad");
            }}
            title="Poi clicca nel CAD in editor mode"
          >
            Pick B in CAD
          </Btn>
          <Btn
            onClick={() => {
              setPickTarget("B");
              setPickSource("map");
            }}
            title="Poi clicca sulla mappa"
          >
            Pick B in Map
          </Btn>

          <Btn onClick={resetCalibration}>Reset</Btn>

          <div style={{ flex: 1 }} />

          <Btn
            onClick={() => {
              // esempio: manda origine CAD (0,0) su mappa
              pushPointToMap({ x: 0, y: 0 });
            }}
          >
            Map: CAD (0,0)
          </Btn>
        </div>

        <div className="card" style={{ padding: 12, marginBottom: 10, border: "1px solid #2d3036", background: "#141821", color: "#e7e9ee", borderRadius: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8, fontSize: 12 }}>
            <div style={{ opacity: 0.8 }}>A (CAD)</div>
            <div>{fmtWorld(A.world)}</div>
            <div style={{ opacity: 0.8 }}>A (Map)</div>
            <div>{fmtMap(A.map)}</div>
            <div style={{ opacity: 0.8 }}>B (CAD)</div>
            <div>{fmtWorld(B.world)}</div>
            <div style={{ opacity: 0.8 }}>B (Map)</div>
            <div>{fmtMap(B.map)}</div>
            <div style={{ opacity: 0.8 }}>Transform</div>
            <div>{T ? `OK (scale=${T.s.toFixed(6)})` : "—"}</div>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
            Workflow: Pick A CAD → Pick A Map → Pick B CAD → Pick B Map. Dopo 2 coppie, la mappa può disegnare geometrie dal CAD.
          </div>
        </div>

        {/* CADViewer reale */}
        <CADViewer onWorldClick={handleCadWorldClick} />
      </div>

      {/* RIGHT: MAP */}
      <div>
        <CadGeoMap ref={mapRef} shape={shape} onMapClick={handleMapClick} autoFit />
      </div>
    </div>
  );
}

// apps/web/src/pages/cad/CadWithMap.tsx
import React from "react";
import CADViewer from "./CADViewer";
import {
  CadGeoMap,
  type CadGeoMapHandle,
  type GeoShape,
  type LatLng,
} from "./CadGeoMap";
import {
  solveSimilarity2Points,
  worldToLatLng,
  type V2,
  type Similarity,
} from "./cadGeoTransform";

type AnchorPair = {
  world?: V2;
  map?: LatLng;
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

function NumberInput({
  value,
  onChange,
  placeholder,
}: {
  value: number | "";
  onChange: (v: number | "") => void;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      value={value}
      placeholder={placeholder}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") {
          onChange("");
          return;
        }
        const n = Number(raw);
        onChange(Number.isFinite(n) ? n : "");
      }}
      style={{
        width: "100%",
        padding: "8px 10px",
        borderRadius: 10,
        border: "1px solid #343a46",
        background: "#11161f",
        color: "#e7e9ee",
        boxSizing: "border-box",
      }}
    />
  );
}

export default function CadWithMap() {
  const mapRef = React.useRef<CadGeoMapHandle | null>(null);

  const [shape, setShape] = React.useState<GeoShape | null>(null);

  const [A, setA] = React.useState<AnchorPair>({});
  const [B, setB] = React.useState<AnchorPair>({});
  const [T, setT] = React.useState<Similarity | null>(null);

  const [ax, setAx] = React.useState<number | "">("");
  const [ay, setAy] = React.useState<number | "">("");
  const [bx, setBx] = React.useState<number | "">("");
  const [by, setBy] = React.useState<number | "">("");

  const [pickTarget, setPickTarget] = React.useState<"A" | "B" | null>(null);

  function resetCalibration() {
    setA({});
    setB({});
    setT(null);
    setShape(null);
    setAx("");
    setAy("");
    setBx("");
    setBy("");
    mapRef.current?.setShape(null);
  }

  function trySolve(nextA = A, nextB = B) {
    if (!nextA.world || !nextA.map || !nextB.world || !nextB.map) {
      setT(null);
      return;
    }

    const tr = solveSimilarity2Points(
      nextA.world,
      nextB.world,
      nextA.map,
      nextB.map
    );

    setT(tr);

    if (tr) {
      const pts = [
        worldToLatLng(nextA.world, tr),
        worldToLatLng(nextB.world, tr),
      ];
      const s: GeoShape = { type: "line", pts };
      setShape(s);
      mapRef.current?.setShape(s);
      mapRef.current?.fitToShape();
    }
  }

  function applyManualCadPoints() {
    const nextA: AnchorPair = {
      ...A,
      world:
        typeof ax === "number" && typeof ay === "number"
          ? { x: ax, y: ay }
          : A.world,
    };

    const nextB: AnchorPair = {
      ...B,
      world:
        typeof bx === "number" && typeof by === "number"
          ? { x: bx, y: by }
          : B.world,
    };

    setA(nextA);
    setB(nextB);
    trySolve(nextA, nextB);
  }

  function handleMapClick(p: LatLng) {
    if (!pickTarget) return;

    if (pickTarget === "A") {
      const nextA = { ...A, map: p };
      setA(nextA);
      trySolve(nextA, B);
    }

    if (pickTarget === "B") {
      const nextB = { ...B, map: p };
      setB(nextB);
      trySolve(A, nextB);
    }
  }

  function fmtWorld(p?: V2) {
    if (!p) return "—";
    return `${p.x.toFixed(2)}, ${p.y.toFixed(2)}`;
  }

  function fmtMap(p?: LatLng) {
    if (!p) return "—";
    return `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`;
  }

  function pushPointToMap(world: V2) {
    if (!T) {
      alert("Prima calibra con A/B.");
      return;
    }

    const ll = worldToLatLng(world, T);
    const s: GeoShape = { type: "points", pts: [ll] };
    setShape(s);
    mapRef.current?.setShape(s);
    mapRef.current?.fitToShape();
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: 16 }}>
      <div>
        <div
          className="card"
          style={{
            padding: 12,
            marginBottom: 10,
            border: "1px solid #2d3036",
            background: "#141821",
            color: "#e7e9ee",
            borderRadius: 12,
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 10 }}>
            CAD ↔ Map Kalibrierung
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
                Punkt A (CAD Weltkoordinaten)
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <NumberInput value={ax} onChange={setAx} placeholder="X" />
                <NumberInput value={ay} onChange={setAy} placeholder="Y" />
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
                Punkt B (CAD Weltkoordinaten)
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <NumberInput value={bx} onChange={setBx} placeholder="X" />
                <NumberInput value={by} onChange={setBy} placeholder="Y" />
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <Btn onClick={applyManualCadPoints}>CAD Punkte übernehmen</Btn>

            <Btn
              onClick={() => setPickTarget("A")}
              title="Danach Punkt A direkt auf der Karte klicken"
            >
              Pick A in Map
            </Btn>

            <Btn
              onClick={() => setPickTarget("B")}
              title="Danach Punkt B direkt auf der Karte klicken"
            >
              Pick B in Map
            </Btn>

            <Btn onClick={resetCalibration}>Reset</Btn>

            <div style={{ flex: 1 }} />

            <Btn
              onClick={() => {
                pushPointToMap({ x: 0, y: 0 });
              }}
            >
              Map: CAD (0,0)
            </Btn>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "120px 1fr",
              gap: 8,
              fontSize: 12,
            }}
          >
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
            Aktuell nimmt diese Seite die CAD-Punkte manuell per X/Y auf.
            Wenn du später willst, können wir echten CAD-Klick-Support ergänzen.
          </div>
        </div>

        <CADViewer />
      </div>

      <div>
        <CadGeoMap ref={mapRef} shape={shape} onMapClick={handleMapClick} autoFit />
      </div>
    </div>
  );
}






import { rlcClass } from "../../ui/rlcRuntimeStyle";import React, { useMemo } from "react";
import { loadDoc } from "../../lib/cad/store";

const shell = {
  maxWidth: 980,
  margin: "0 auto",
  padding: "12px 16px 40px",
  fontFamily: "Inter, system-ui, Arial",
  color: "#0f172a"
} as const;

const table = {
  width: "100%",
  borderCollapse: "collapse" as const,
  fontSize: 13
} as const;

const thtd = {
  border: "1px solid #e2e8f0",
  padding: "8px 10px",
  verticalAlign: "middle" as const
} as const;

const head = {
  ...thtd,
  background: "#f8fafc",
  fontWeight: 600,
  textAlign: "left" as const
} as const;

type Vec2 = {
  x: number;
  y: number;
};

type LineEntity = {
  id?: string;
  layerId?: string;
  type: "line";
  a: Vec2;
  b: Vec2;
};

type PolylineEntity = {
  id?: string;
  layerId?: string;
  type: "polyline";
  points: Vec2[];
  closed?: boolean;
};

type DocLayer = {
  id: string;
  name?: string;
};

type DocEntityLike = {
  layerId?: string;
  type?: string;
  [key: string]: unknown;
};

type CadDocLike = {
  layers?: DocLayer[];
  entities?: DocEntityLike[];
};

function normLayerName(v: string | undefined | null) {
  return String(v || "").trim().toLowerCase();
}

function isVec2(v: unknown): v is Vec2 {
  if (!v || typeof v !== "object") return false;
  const x = v as Record<string, unknown>;
  return typeof x.x === "number" && typeof x.y === "number";
}

function isLineEntity(e: unknown): e is LineEntity {
  if (!e || typeof e !== "object") return false;
  const x = e as Record<string, unknown>;
  return x.type === "line" && isVec2(x.a) && isVec2(x.b);
}

function isPolylineEntity(e: unknown): e is PolylineEntity {
  if (!e || typeof e !== "object") return false;
  const x = e as Record<string, unknown>;
  return (
    x.type === "polyline" &&
    Array.isArray(x.points) &&
    x.points.every(isVec2));

}

function isLinearEntity(e: unknown): e is LineEntity | PolylineEntity {
  return isLineEntity(e) || isPolylineEntity(e);
}

function entityLength(e: LineEntity | PolylineEntity): number {
  if (e.type === "line") {
    return Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y);
  }

  const pts = Array.isArray(e.points) ? e.points : [];
  if (pts.length < 2) return 0;

  let sum = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    sum += Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }

  if (e.closed && pts.length >= 3) {
    const first = pts[0];
    const last = pts[pts.length - 1];
    sum += Math.hypot(first.x - last.x, first.y - last.y);
  }

  return sum;
}

export default function AsBuilt() {
  const rawDoc = loadDoc();

  const res = useMemo(() => {
    const doc: CadDocLike =
    rawDoc && typeof rawDoc === "object" ? rawDoc as CadDocLike : {};

    const layers: DocLayer[] = Array.isArray(doc.layers) ? doc.layers : [];
    const entities: DocEntityLike[] = Array.isArray(doc.entities) ?
    doc.entities :
    [];

    const layerNameById = new Map<string, string>();
    for (const l of layers) {
      layerNameById.set(String(l.id), normLayerName(l.name));
    }

    const soll = entities.filter(
      (e) => layerNameById.get(String(e.layerId || "")) === "0"
    );

    const ist = entities.filter(
      (e) => layerNameById.get(String(e.layerId || "")) === "bestand"
    );

    const linearSoll = soll.filter(isLinearEntity);
    const linearIst = ist.filter(isLinearEntity);

    const sumSoll = linearSoll.reduce((acc, e) => acc + entityLength(e), 0);
    const sumIst = linearIst.reduce((acc, e) => acc + entityLength(e), 0);

    return {
      sumSoll,
      sumIst,
      delta: sumIst - sumSoll,
      sollCount: soll.length,
      istCount: ist.length,
      linearSollCount: linearSoll.length,
      linearIstCount: linearIst.length
    };
  }, [rawDoc]);

  const fmt = (n: number) =>
  new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: 2
  }).format(n || 0);

  return (
    <div className={rlcClass(null, shell)}>
      <h2 className="rlc-migrated-pages-cad-asbuild-tsx-750">
        As-Built – Soll/Ist Vergleich
      </h2>

      <table className={rlcClass(null, table)}>
        <thead>
          <tr>
            <th className={rlcClass(null, head)}>Kennzahl</th>
            <th className={rlcClass(null, head)}>Wert</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={rlcClass(null, thtd)}>Soll-Layer („0“)</td>
            <td className={rlcClass(null, thtd)}>{res.sollCount} Elemente</td>
          </tr>
          <tr>
            <td className={rlcClass(null, thtd)}>Ist-Layer („Bestand“)</td>
            <td className={rlcClass(null, thtd)}>{res.istCount} Elemente</td>
          </tr>
          <tr>
            <td className={rlcClass(null, thtd)}>Lineare Soll-Elemente</td>
            <td className={rlcClass(null, thtd)}>{res.linearSollCount}</td>
          </tr>
          <tr>
            <td className={rlcClass(null, thtd)}>Lineare Ist-Elemente</td>
            <td className={rlcClass(null, thtd)}>{res.linearIstCount}</td>
          </tr>
          <tr>
            <td className={rlcClass(null, thtd)}>Soll gesamt</td>
            <td className={rlcClass(null, thtd)}>{fmt(res.sumSoll)} m</td>
          </tr>
          <tr>
            <td className={rlcClass(null, thtd)}>Ist gesamt</td>
            <td className={rlcClass(null, thtd)}>{fmt(res.sumIst)} m</td>
          </tr>
          <tr>
            <td className={rlcClass(null, { ...thtd, fontWeight: 600 })}>Δ Ist-Soll</td>
            <td className={rlcClass(null,
            {
              ...thtd,
              fontWeight: 600,
              color: res.delta >= 0 ? "#065f46" : "#b91c1c"
            })}>
              
              {fmt(res.delta)} m
            </td>
          </tr>
        </tbody>
      </table>

      <p className="rlc-migrated-pages-cad-asbuild-tsx-751">
        Hinweis: Aktuell wird hier die Summenlänge nach Layer verglichen.
        Detaillierte Geometrie-Differenzen (Offset, Stations, Lageabweichung)
        können im nächsten Schritt ergänzt werden.
      </p>
    </div>);

}

import type { ParsedItem } from "./index";
import { parseAsciiDxf, type CadFeature } from "./dxf.engine";

export type RlcCadPoint = { x: number; y: number };
export type RlcCadFeature = {
  id: string;
  kind: "line" | "polyline" | "polygon" | "point" | "circle" | "text";
  layer: string;
  name?: string;
  pts: RlcCadPoint[];
  closed: boolean;
  radius?: number;
  text?: string;
  rotation?: number;
  length: number;
  area: number;
  style?: Record<string, unknown>;
  meta: Record<string, unknown>;
};

function decodeDxfBuffer(buf: Buffer): string {
  const signature = buf.subarray(0, 22).toString("latin1");
  if (signature.startsWith("AutoCAD Binary DXF")) {
    throw new Error(
      "Binäres DXF erkannt. Die Datei muss vor dem Parsen serverseitig in ASCII-DXF konvertiert werden."
    );
  }

  const utf8 = buf.toString("utf8");
  const replacementCount = (utf8.match(/\uFFFD/g) || []).length;
  if (replacementCount <= Math.max(2, Math.floor(utf8.length / 100000))) {
    return utf8;
  }
  return buf.toString("latin1");
}

function normalizeFeature(feature: CadFeature, index: number): RlcCadFeature {
  return {
    id: String(feature.id || `DXF_${String(index + 1).padStart(6, "0")}`),
    kind: (feature.kind || "polyline") as RlcCadFeature["kind"],
    layer: String(feature.layer || "0"),
    name: feature.name,
    pts: Array.isArray(feature.pts)
      ? feature.pts.map((point) => ({ x: Number(point.x), y: Number(point.y) }))
      : [],
    closed: Boolean(feature.closed),
    radius: feature.radius,
    text: feature.text,
    rotation: feature.rotation,
    length: Number(feature.length || 0),
    area: Number(feature.area || 0),
    style: feature.style as Record<string, unknown> | undefined,
    meta: {
      ...(feature.meta || {}),
      source: "DXF",
    },
  };
}

export function parseDXFGeometry(buf: Buffer, fileName = "drawing.dxf"): {
  items: ParsedItem[];
  features: RlcCadFeature[];
  layers: string[];
  source: Record<string, unknown>;
} {
  const document = parseAsciiDxf(decodeDxfBuffer(buf), fileName);
  const features = document.features.map(normalizeFeature);
  const layers = Array.from(new Set(features.map((feature) => feature.layer))).sort();
  const items: ParsedItem[] = [];
  let lineNo = 1;
  let areaNo = 1;
  let pointNo = 1;

  for (const feature of features) {
    const label = feature.name || feature.text || String(feature.meta?.dxfType || feature.kind);
    if (feature.kind === "point" || feature.kind === "text") {
      items.push({
        source: "DXF",
        pos: `DXF.PKT.${String(pointNo++).padStart(3, "0")}`,
        text: label,
        unit: "Stk",
        qty: 1,
      });
    } else if (feature.length > 0) {
      items.push({
        source: "DXF",
        pos: `DXF.LIN.${String(lineNo++).padStart(3, "0")}`,
        text: label,
        unit: "m",
        qty: feature.length,
      });
    }
    if (feature.area > 0) {
      items.push({
        source: "DXF",
        pos: `DXF.AR.${String(areaNo++).padStart(3, "0")}`,
        text: `${label} Fläche`,
        unit: "m²",
        qty: feature.area,
      });
    }
  }

  return {
    items,
    features,
    layers,
    source: document.source || {},
  };
}

export function parseDXF(buf: Buffer): ParsedItem[] {
  return parseDXFGeometry(buf).items;
}

// @ts-ignore – dxf-parser may not provide complete typings
import DxfParser from "dxf-parser";
import type { ParsedItem } from "./index";
import { toNumber, hypot2D, areaPolygon } from "./index";

export type RlcCadPoint = { x: number; y: number };
export type RlcCadFeature = {
  id: string;
  kind: "line" | "polyline" | "polygon" | "point";
  layer: string;
  name?: string;
  pts: RlcCadPoint[];
  closed: boolean;
  length: number;
  area: number;
  meta: Record<string, unknown>;
};

function point(x: unknown, y: unknown): RlcCadPoint {
  return { x: toNumber(x), y: toNumber(y) };
}

function featureLength(pts: RlcCadPoint[], closed: boolean): number {
  let value = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    value += hypot2D(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  }
  if (closed && pts.length > 2) {
    value += hypot2D(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
  }
  return value;
}

function arcPoints(
  cx: number,
  cy: number,
  radius: number,
  startAngleDeg: number,
  endAngleDeg: number,
  segments = 48
): RlcCadPoint[] {
  let start = startAngleDeg;
  let end = endAngleDeg;
  while (end < start) end += 360;
  const sweep = Math.max(0.001, end - start);
  const count = Math.max(8, Math.ceil((segments * sweep) / 360));
  const pts: RlcCadPoint[] = [];
  for (let i = 0; i <= count; i++) {
    const angle = ((start + (sweep * i) / count) * Math.PI) / 180;
    pts.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
  }
  return pts;
}

function entityId(entity: any, index: number): string {
  const handle = String(entity?.handle || "").trim();
  return handle ? `DXF_${handle}` : `DXF_${String(index + 1).padStart(6, "0")}`;
}

export function parseDXFGeometry(buf: Buffer): {
  items: ParsedItem[];
  features: RlcCadFeature[];
  layers: string[];
} {
  const parser = new DxfParser();
  const dxf = parser.parseSync(buf.toString("utf8"));
  const items: ParsedItem[] = [];
  const features: RlcCadFeature[] = [];
  const layers = new Set<string>();
  let lineNo = 1;
  let areaNo = 1;
  let pointNo = 1;

  const entities = Array.isArray(dxf?.entities) ? dxf.entities : [];
  entities.forEach((entity: any, index: number) => {
    const type = String(entity?.type || "").toUpperCase();
    const layer = String(entity?.layer || "0") || "0";
    const id = entityId(entity, index);
    layers.add(layer);

    let pts: RlcCadPoint[] = [];
    let closed = false;
    let kind: RlcCadFeature["kind"] = "polyline";
    let name = type || "DXF-Objekt";

    if (type === "LINE" && entity.start && entity.end) {
      pts = [point(entity.start.x, entity.start.y), point(entity.end.x, entity.end.y)];
      kind = "line";
    } else if (type === "LWPOLYLINE" || type === "POLYLINE") {
      pts = (entity.vertices || []).map((v: any) => point(v.x, v.y));
      closed = Boolean(entity.closed || entity.shape);
      kind = closed ? "polygon" : "polyline";
    } else if (type === "CIRCLE" && entity.center) {
      const radius = Math.abs(toNumber(entity.radius));
      if (radius > 0) {
        pts = arcPoints(toNumber(entity.center.x), toNumber(entity.center.y), radius, 0, 360, 64);
        closed = true;
        kind = "polygon";
      }
    } else if (type === "ARC" && entity.center) {
      const radius = Math.abs(toNumber(entity.radius));
      if (radius > 0) {
        pts = arcPoints(
          toNumber(entity.center.x),
          toNumber(entity.center.y),
          radius,
          toNumber(entity.startAngle),
          toNumber(entity.endAngle),
          64
        );
        kind = "polyline";
      }
    } else if (type === "POINT" && entity.position) {
      pts = [point(entity.position.x, entity.position.y)];
      kind = "point";
    } else if ((type === "TEXT" || type === "MTEXT") && (entity.startPoint || entity.position)) {
      const p = entity.startPoint || entity.position;
      pts = [point(p.x, p.y)];
      kind = "point";
      name = String(entity.text || entity.string || type);
    }

    if (!pts.length || pts.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return;

    const length = featureLength(pts, closed);
    const area = closed && pts.length >= 3 ? areaPolygon(pts) : 0;

    features.push({
      id,
      kind,
      layer,
      name,
      pts,
      closed,
      length,
      area,
      meta: {
        source: "DXF",
        entityType: type,
        handle: entity?.handle || undefined,
        colorNumber: entity?.colorNumber,
      },
    });

    if (kind === "point") {
      items.push({ source: "DXF", pos: `DXF.PKT.${String(pointNo++).padStart(3, "0")}`, text: name, unit: "Stk", qty: 1 });
    } else if (length > 0) {
      items.push({ source: "DXF", pos: `DXF.LIN.${String(lineNo++).padStart(3, "0")}`, text: name, unit: "m", qty: length });
    }
    if (area > 0) {
      items.push({ source: "DXF", pos: `DXF.AR.${String(areaNo++).padStart(3, "0")}`, text: `${name} Fläche`, unit: "m²", qty: area });
    }
  });

  return { items, features, layers: Array.from(layers).sort() };
}

export function parseDXF(buf: Buffer): ParsedItem[] {
  return parseDXFGeometry(buf).items;
}

// @ts-ignore – dxf-parser potrebbe non avere tipi completi
import DxfParser from "dxf-parser";
import type { ParsedItem } from "./index";
import { toNumber, hypot2D, areaPolygon } from "./index";

export function parseDXF(buf: Buffer): ParsedItem[] {
  const parser = new DxfParser();
  const dxf = parser.parseSync(buf.toString("utf8"));

  const out: ParsedItem[] = [];
  let iL = 1, iA = 1;

  const ents = dxf?.entities || [];
  for (const e of ents) {
    if (e.type === "LINE") {
      const len = hypot2D(e.end.x - e.start.x, e.end.y - e.start.y);
      if (len > 0) {
        out.push({ source: "DXF", pos: `DXF.LIN.${String(iL++).padStart(3, "0")}`, text: "Linie", unit: "m", qty: len });
      }
    } else if (e.type === "LWPOLYLINE" || e.type === "POLYLINE") {
      const verts = (e.vertices || []).map((v: any) => ({ x: toNumber(v.x), y: toNumber(v.y) }));
      if (verts.length >= 2) {
        let L = 0;
        for (let i = 0; i < verts.length - 1; i++) {
          L += hypot2D(verts[i + 1].x - verts[i].x, verts[i + 1].y - verts[i].y);
        }
        if (e.closed) {
          L += hypot2D(verts[0].x - verts[verts.length - 1].x, verts[0].y - verts[verts.length - 1].y);
        }
        if (L > 0) {
          out.push({ source: "DXF", pos: `DXF.LIN.${String(iL++).padStart(3, "0")}`, text: "Polyline", unit: "m", qty: L });
        }
        if (e.closed) {
          const A = areaPolygon(verts);
          if (A > 0) {
            out.push({ source: "DXF", pos: `DXF.AR.${String(iA++).padStart(3, "0")}`, text: "Fläche (geschlossen)", unit: "m²", qty: A });
          }
        }
      }
    }
  }
  return out;
}

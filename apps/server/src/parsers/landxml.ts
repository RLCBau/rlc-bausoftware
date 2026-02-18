import { XMLParser } from "fast-xml-parser";
import type { ParsedItem } from "./index";
import { toNumber, hypot2D } from "./index";

export function parseLandXML(buf: Buffer): ParsedItem[] {
  const xml = buf.toString("utf8");
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  const doc = parser.parse(xml);

  const out: ParsedItem[] = [];
  let k = 1;

  // Alignments (lunghezze)
  const alignments = doc?.LandXML?.Alignments?.Alignment;
  const arrAlign = Array.isArray(alignments) ? alignments : alignments ? [alignments] : [];
  for (const al of arrAlign) {
    const len = toNumber(al?.length ?? al?.Length);
    if (len > 0) {
      out.push({
        source: "LandXML",
        pos: `LX.LIN.${String(k++).padStart(3, "0")}`,
        text: al?.name ? `Alignment ${al.name}` : "Alignment",
        unit: "m",
        qty: len,
      });
      continue;
    }
    const cg = al?.CoordGeom;
    if (cg) {
      const segs = ([] as any[]).concat(
        cg.Line || [],
        cg.LineString || [],
        cg.Spiral || [],
        cg.Curve || []
      );
      const lines: { x: number; y: number }[][] = [];
      for (const s of segs) {
        const sp = s?.Start?.pnt || s?.Start?.Pnt || "";
        const ep = s?.End?.pnt || s?.End?.Pnt || "";
        const [sx, sy] = String(sp).split(/\s+/);
        const [ex, ey] = String(ep).split(/\s+/);
        const SX = toNumber(sx), SY = toNumber(sy), EX = toNumber(ex), EY = toNumber(ey);
        if (isFinite(SX) && isFinite(SY) && isFinite(EX) && isFinite(EY)) {
          lines.push([{ x: SX, y: SY }, { x: EX, y: EY }]);
        }
      }
      if (lines.length) {
        const lenSum = lines.reduce((a, seg) => a + hypot2D(seg[1].x - seg[0].x, seg[1].y - seg[0].y), 0);
        if (lenSum > 0) {
          out.push({
            source: "LandXML",
            pos: `LX.LIN.${String(k++).padStart(3, "0")}`,
            text: al?.name ? `Alignment ${al.name}` : "Alignment",
            unit: "m",
            qty: lenSum,
          });
        }
      }
    }
  }

  // Parcels/Surfaces (aree)
  const parcels = doc?.LandXML?.Parcels?.Parcel;
  const arrParc = Array.isArray(parcels) ? parcels : parcels ? [parcels] : [];
  for (const p of arrParc) {
    const area = toNumber(p?.area ?? p?.Area);
    if (area > 0) {
      out.push({
        source: "LandXML",
        pos: `LX.AR.${String(k++).padStart(3, "0")}`,
        text: p?.name ? `Parcel ${p.name}` : "Parcel",
        unit: "m²",
        qty: area,
      });
    }
  }

  // Volumi
  const vols = doc?.LandXML?.Volumes || doc?.LandXML?.Volume;
  const arrVol = Array.isArray(vols) ? vols : vols ? [vols] : [];
  for (const v of arrVol) {
    const vol = toNumber(v?.volume ?? v?.Volume);
    if (vol > 0) {
      out.push({
        source: "LandXML",
        pos: `LX.VOL.${String(k++).padStart(3, "0")}`,
        text: v?.name ? `Volumen ${v.name}` : "Volumen",
        unit: "m³",
        qty: vol,
      });
    }
  }

  return out;
}

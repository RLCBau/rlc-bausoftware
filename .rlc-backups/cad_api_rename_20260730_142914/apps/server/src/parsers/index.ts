import { parseCsvTxt } from "./csvTxt";
import { parseLandXML } from "./landxml";
import { parseDXF } from "./dxf";
import { parseGSI } from "./gsi";

/** Struttura unificata che il frontend conosce */
export type ParsedItem = {
  source: string;   // "CSV" | "TXT" | "LandXML" | "DXF" | "GSI" | "PDF" | "DWG" | "Datei"
  pos: string;      // es. "100.001"
  text: string;     // descrizione breve
  unit: string;     // "m" | "m²" | "m³" | ...
  qty: number;      // quantità
};

/* ---------- utils condivise ---------- */
export function toNumber(v: any, def = 0): number {
  if (v == null) return def;
  const n = Number(String(v).replace(",", "."));
  return isFinite(n) ? n : def;
}
export function hypot2D(dx: number, dy: number): number {
  return Math.sqrt(dx * dx + dy * dy);
}
export function areaPolygon(points: { x: number; y: number }[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a / 2);
}
/** Applica la scala in base all'unità: m→s, m²→s², m³→s³ */
export function applyScale(qty: number, unit: string, scale: number): number {
  if (!isFinite(qty) || !isFinite(scale)) return qty;
  if (unit === "m")  return qty * scale;
  if (unit === "m²") return qty * scale * scale;
  if (unit === "m³") return qty * scale * scale * scale;
  return qty;
}

/* ---------- ROUTER UNIVERSALE ---------- */
export async function parseByExtension(
  originalName: string,
  buf: Buffer,
  scale = 1
): Promise<{ items: ParsedItem[]; note?: string }> {
  const name = (originalName || "").toLowerCase();

  if (name.endsWith(".csv")) {
    return { items: parseCsvTxt(buf, "CSV") };
  }
  if (name.endsWith(".txt")) {
    return { items: parseCsvTxt(buf, "TXT") };
  }
  if (name.endsWith(".xml")) {
    return { items: parseLandXML(buf) };
  }
  if (name.endsWith(".dxf")) {
    return { items: parseDXF(buf) };
  }
  if (name.endsWith(".gsi")) {
    return { items: parseGSI(buf) };
  }
  if (name.endsWith(".dwg")) {
    return {
      items: [],
      note: "DWG non supportato direttamente: convertire in DXF e riprovare.",
    };
  }
  if (name.endsWith(".pdf")) {
    return {
      items: [],
      note: "PDF vettoriale non supportato direttamente: esportare in DXF/SVG e riprovare.",
    };
  }

  return {
    items: [],
    note: "Formato non riconosciuto. Supportati: CSV, TXT, LandXML, DXF, GSI (PDF/DWG tramite conversione).",
  };
}

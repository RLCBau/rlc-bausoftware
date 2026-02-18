// utils/cadImport.ts
// Semplice bridge CAD → (Aufmaß/Kalkulation) via localStorage

export type CadExportPayload = {
  target: "aufmasseditor" | "kalkulation";
  kind: "AREA" | "LINE";
  layer: string;
  label?: string;
  area_m2?: number;
  length_m?: number;
  points?: { x: number; y: number }[];
  ts?: number;
};

const KEY = "rlc.cad.export.v1";

export function saveCadExport(p: CadExportPayload) {
  const pack = { ...p, ts: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(pack));
  } catch {}
}

export function consumeCadExport(expectedTarget: "aufmasseditor" | "kalkulation"): CadExportPayload | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw) as CadExportPayload | null;
    if (!obj || obj.target !== expectedTarget) return null;
    // opzionale: scadenza 2 min per evitare vecchi residui
    if (typeof obj.ts === "number" && Date.now() - obj.ts > 120_000) {
      localStorage.removeItem(KEY);
      return null;
    }
    localStorage.removeItem(KEY);
    return obj;
  } catch {
    return null;
  }
}

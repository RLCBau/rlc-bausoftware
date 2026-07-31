import type { ParsedItem } from "./index";
import { toNumber, hypot2D } from "./index";

/**
 * Parser GSI semplice:
 * - Linee con E N (opz. Z) e ultimo campo come CODE
 * - Raggruppa per CODE e somma lunghezze tra punti consecutivi
 */
export function parseGSI(buf: Buffer): ParsedItem[] {
  const text = buf.toString("utf8");
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  type Pt = { id: string; e: number; n: number; z?: number; code: string };
  const pts: Pt[] = [];

  for (const l of lines) {
    const parts = l.split(/;|,|\s+/).filter(Boolean);
    if (parts.length < 4) continue;
    const code = String(parts[parts.length - 1]);
    const nums = parts.slice(0, parts.length - 1).map(p => toNumber(p, NaN)).filter(n => !isNaN(n));
    if (nums.length < 2) continue;
    const e = nums[0], n = nums[1], z = nums[2];
    pts.push({ id: parts[0], e, n, z, code });
  }

  const map = new Map<string, Pt[]>();
  for (const p of pts) {
    if (!map.has(p.code)) map.set(p.code, []);
    map.get(p.code)!.push(p);
  }

  const out: ParsedItem[] = [];
  let idx = 1;
  map.forEach((arr, code) => {
    arr.sort((a, b) => {
      const na = toNumber(a.id, NaN), nb = toNumber(b.id, NaN);
      if (isNaN(na) || isNaN(nb)) return a.id.localeCompare(b.id);
      return na - nb;
    });
    let L = 0;
    for (let i = 0; i < arr.length - 1; i++) {
      L += hypot2D(arr[i + 1].e - arr[i].e, arr[i + 1].n - arr[i].n);
    }
    if (L > 0) {
      out.push({ source: "GSI", pos: `GSI.LIN.${String(idx++).padStart(3, "0")}`, text: `Linie (Code ${code})`, unit: "m", qty: L });
    }
  });

  return out;
}

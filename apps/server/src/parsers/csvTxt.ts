import type { ParsedItem } from "./index";
import { toNumber } from "./index";

export function parseCsvTxt(buf: Buffer, ext: "CSV" | "TXT"): ParsedItem[] {
  const text = buf.toString("utf8");
  const rows = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => l.split(/;|,|\t/).map(s => s.trim()));

  const items: ParsedItem[] = [];
  let idx = 1;
  for (const cols of rows) {
    if (cols.length < 4) continue;
    const [pos, t, unit, qtyStr] = cols;
    items.push({
      source: ext,
      pos: pos || `${ext}.${String(idx++).padStart(3, "0")}`,
      text: t || "Position",
      unit: unit || "m",
      qty: toNumber(qtyStr, 0),
    });
  }
  return items;
}

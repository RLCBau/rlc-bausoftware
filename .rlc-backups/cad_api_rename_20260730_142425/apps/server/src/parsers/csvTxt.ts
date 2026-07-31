import type { ParsedItem } from "./index";
import { toNumber } from "./index";

function isCsvHeader(cols: string[]): boolean {
  const normalized = cols.map(value =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, "")
  );

  const headerWords = new Set([
    "punkt",
    "punktnr",
    "punktnummer",
    "pos",
    "position",
    "x",
    "y",
    "z",
    "rechtswert",
    "hochwert",
    "hoehe",
    "höhe",
    "text",
    "bezeichnung",
    "einheit",
    "unit",
    "menge",
    "qty",
  ]);

  const matches = normalized.filter(value => headerWords.has(value)).length;

  return matches >= 2;
}

export function parseCsvTxt(buf: Buffer, ext: "CSV" | "TXT"): ParsedItem[] {
  const text = buf.toString("utf8");

  const rows = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.split(/;|,|\t/).map(value => value.trim()));

  const items: ParsedItem[] = [];
  let idx = 1;

  for (const cols of rows) {
    if (cols.length < 4) continue;

    if (ext === "CSV" && isCsvHeader(cols)) {
      continue;
    }

    const [pos, itemText, unit, qtyStr] = cols;

    items.push({
      source: ext,
      pos: pos || `${ext}.${String(idx++).padStart(3, "0")}`,
      text: itemText || "Position",
      unit: unit || "m",
      qty: toNumber(qtyStr, 0),
    });
  }

  return items;
}

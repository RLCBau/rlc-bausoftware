export function parseLieferschein(
  ocrResults: Array<{ file: string; text: string }>
): Array<{
  lieferant?: string;
  datum?: string;
  material?: string;
  menge?: number;
  einheit?: string;
  preis?: number;
  kostenstelle?: string;
}> {
  const out: any[] = [];
  for (const r of ocrResults) {
    const t = r.text;
    if (/Lieferschein/i.test(t)) {
      const lieferant = (t.match(/Firma\s+([^\n]+)/i) || [,"Muster GmbH"])[1];
      const material = (t.match(/Material:\s*([^\n]+)/i) || [,"Material"])[1];
      const mengeStr = (t.match(/Menge:\s*([0-9.,]+)/i) || [,"0"])[1];
      const menge = Number(mengeStr.replace(",", "."));
      const einheit = /t\b/i.test(t) ? "t" : "stk";
      const datum = (t.match(/Datum:\s*([0-9\-./]+)/i) || [,""])[1];
      const kostenstelle = (t.match(/Kostenstelle:\s*([^\n]+)/i) || [,""])[1];
      out.push({ lieferant, datum, material, menge, einheit, preis: undefined, kostenstelle });
    }
  }
  return out;
}

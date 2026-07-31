export function matchLVPositions(
  ocrResults: Array<{ file: string; text: string }>
): Array<{ position?: string; kurztext?: string; einheit?: string; menge?: number; kommentar?: string }> {
  const out: any[] = [];
  for (const r of ocrResults) {
    const t = r.text.toLowerCase();
    if (t.includes("graben")) {
      const m = t.match(/(\d+(?:[.,]\d+)?)\s*m/);
      out.push({
        position: "ERD-1001",
        kurztext: "Graben herstellen",
        einheit: "m",
        menge: m ? Number(m[1].replace(",", ".")) : 1,
        kommentar: "aus Foto/OCR",
      });
    }
    if (t.includes("speedpipe")) {
      out.push({
        position: "LTG-2040",
        kurztext: "Speedpipe DN40 verlegen",
        einheit: "m",
        menge: 10,
        kommentar: "Schätzung KI",
      });
    }
  }
  return out;
}

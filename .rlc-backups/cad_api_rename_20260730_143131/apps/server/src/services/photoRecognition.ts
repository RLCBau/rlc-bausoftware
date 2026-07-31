type OCRResult = { file: string; text: string };

// Placeholder: sostituisci con OCR reale (tesseract.js / Azure / Google Vision)
export async function recognizeFromFiles(paths: string[]): Promise<OCRResult[]> {
  return Promise.all(
    paths.map(async (p) => {
      const lower = p.toLowerCase();
      let text = "";
      if (lower.includes("lieferschein") || lower.includes("liefers")) {
        text = "Lieferschein Firma Muster GmbH\nMaterial: Kies 0/16\nMenge: 12,50 t\nDatum: 2025-10-29\nKostenstelle: KS-101";
      } else if (lower.endsWith(".pdf")) {
        text = "PDF-Aufmaß: Graben 15 m, Speedpipe DN40, Aushub 10 m³, Datum 2025-10-29";
      } else {
        text = "Foto Baustelle: Graben 15 m; 3 Bögen DN40; 1 Abzweig";
      }
      return { file: p, text };
    })
  );
}

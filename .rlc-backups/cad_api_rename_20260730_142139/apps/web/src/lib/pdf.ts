// apps/web/src/lib/pdf.ts
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.js?url";
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = pdfjsWorker;

export async function readPdfText(file: File): Promise<string> {
  const array = new Uint8Array(await file.arrayBuffer());
  const doc = await (pdfjsLib as any).getDocument({ data: array }).promise;
  let text = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items.map((it: any) => it.str);
    text += items.join(" ") + "\n";
  }
  return text.replace(/\s+/g, " ").trim();
}

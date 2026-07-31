// apps/web/src/lib/pdf.ts
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.js?url";
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
export async function readPdfText(file) {
    const array = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjsLib.getDocument({ data: array }).promise;
    let text = "";
    for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        const items = content.items.map((it) => it.str);
        text += items.join(" ") + "\n";
    }
    return text.replace(/\s+/g, " ").trim();
}

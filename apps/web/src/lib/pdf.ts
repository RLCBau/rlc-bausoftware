// apps/web/src/lib/pdf.ts
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.js?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/* =========================================================
   PDF TEXT READ
   ========================================================= */

type TextItem = {
  str?: string;
};

function isPdfFile(file: File) {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

export async function readPdfText(file: File): Promise<string> {
  if (!file) {
    throw new Error("Keine PDF-Datei übergeben.");
  }

  if (!isPdfFile(file)) {
    throw new Error("Ungültige Datei. Bitte eine PDF-Datei auswählen.");
  }

  try {
    const buffer = await file.arrayBuffer();
    const array = new Uint8Array(buffer);

    const loadingTask = pdfjsLib.getDocument({
      data: array,
      useWorkerFetch: false,
      isEvalSupported: false,
    });

    const doc = await loadingTask.promise;

    const pages: string[] = [];

    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();

      const items = (content.items || []) as TextItem[];
      const line = items
        .map((it) => (typeof it?.str === "string" ? it.str : ""))
        .filter(Boolean)
        .join(" ");

      if (line.trim()) {
        pages.push(line.trim());
      }
    }

    const text = pages
      .join("\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{2,}/g, "\n")
      .trim();

    return text;
  } catch (err: any) {
    throw new Error(
      err?.message || "PDF konnte nicht gelesen werden."
    );
  }
}







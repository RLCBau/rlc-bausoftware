// apps/web/src/utils/pdf/printPdf.ts
import { jsPDF } from "jspdf";

export async function printJsPdf(doc: jsPDF) {
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);

  const w = window.open(url, "_blank", "noopener,noreferrer");
  if (!w) {
    // fallback se popup bloccato
    doc.save("document.pdf");
    URL.revokeObjectURL(url);
    return;
  }

  const timer = window.setInterval(() => {
    try {
      // quando il viewer è pronto
      if (w.document?.readyState === "complete") {
        window.clearInterval(timer);
        w.focus();
        w.print();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
    } catch {
      // ignore
    }
  }, 200);
}

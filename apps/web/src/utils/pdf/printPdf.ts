import { savePdfWithCompanyHeader as saveRlcPdfWithCompanyHeader, outputPdfBlobWithCompanyHeader as outputRlcPdfBlobWithCompanyHeader } from "../../lib/pdf/companyPdfHeader";
// apps/web/src/utils/pdf/printPdf.ts
import { jsPDF } from "jspdf";

export async function printJsPdf(
  doc: jsPDF,
  fileName = "document.pdf"
): Promise<void> {
  const blob = await outputRlcPdfBlobWithCompanyHeader(doc);
  const url = URL.createObjectURL(blob);

  let timer: number | null = null;
  let revoked = false;

  const revokeLater = (delay = 10000) => {
    window.setTimeout(() => {
      if (!revoked) {
        URL.revokeObjectURL(url);
        revoked = true;
      }
    }, delay);
  };

  try {
    const win = window.open(url, "_blank");

    if (!win) {
      saveRlcPdfWithCompanyHeader(doc, fileName);
      revokeLater(2000);
      return;
    }

    timer = window.setInterval(() => {
      try {
        if (win.closed) {
          if (timer) window.clearInterval(timer);
          revokeLater(1000);
          return;
        }

        if (win.document?.readyState === "complete") {
          if (timer) window.clearInterval(timer);
          win.focus();
          win.print();
          revokeLater(10000);
        }
      } catch {
        // cross-window access può fallire su alcuni browser/viewer PDF
      }
    }, 250);

    // safety timeout
    window.setTimeout(() => {
      if (timer) {
        window.clearInterval(timer);
        timer = null;
      }
      revokeLater(15000);
    }, 20000);
  } catch {
    saveRlcPdfWithCompanyHeader(doc, fileName);
    revokeLater(2000);
  }
}






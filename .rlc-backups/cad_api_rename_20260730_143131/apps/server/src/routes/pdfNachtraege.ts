// apps/server/src/routes/pdfNachtraege.ts
// @ts-nocheck

import { Router } from "express";
import { jsPDF } from "jspdf";

const r = Router();

/** helpers */
const euro = (n: any) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
    Number(n || 0)
  );

function textOr(v: any) {
  return String(v ?? "").trim();
}

function num(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function todayDE() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}.${mm}.${yy}`;
}

function wrap(doc: any, text: string, maxWidth: number) {
  const t = textOr(text);
  if (!t) return [""];
  return doc.splitTextToSize(t, maxWidth);
}

function ensureSpace(doc: any, y: number, needed: number) {
  const pageH = doc.internal.pageSize.getHeight();
  const bottom = pageH - 12;
  if (y + needed > bottom) {
    doc.addPage();
    return 14;
  }
  return y;
}

/**
 * POST /api/pdf/nachtraege
 */
r.post("/pdf/nachtraege", async (req, res) => {
  try {
    const mwst = num(req.body?.mwst ?? 19);

    const projectName = textOr(req.body?.project?.name);
    const projectNr = textOr(req.body?.project?.number);
    const projectOrt = textOr(req.body?.project?.location);

    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const totalsNetto = num(req.body?.totals?.netto);
    const totalsBrutto = num(req.body?.totals?.brutto);

    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

    const pageW = doc.internal.pageSize.getWidth();
    const left = 14;
    const right = pageW - 14;
    const contentW = right - left;

    doc.setFont("helvetica", "normal");

    // ===== Header =====
    let y = 14;

    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Nachträge", left, y);
    doc.setFont("helvetica", "normal");
    y += 6;

    const headerH = 28;
    doc.setDrawColor(0);
    doc.setLineWidth(0.2);
    doc.rect(left, y, contentW, headerH);

    const midX = left + contentW * 0.68;
    doc.line(midX, y, midX, y + headerH);

    doc.setFontSize(11);

    const lx = left + 4;
    const ly = y + 7;

    doc.setFont("helvetica", "bold");
    doc.text("Baustelle:", lx, ly);
    doc.setFont("helvetica", "normal");
    doc.text(projectName || "-", lx + 25, ly);

    doc.setFont("helvetica", "bold");
    doc.text("Ort:", lx, ly + 7);
    doc.setFont("helvetica", "normal");
    doc.text(projectOrt || "-", lx + 25, ly + 7);

    doc.setFont("helvetica", "bold");
    doc.text("Auftraggeber / Anschrift:", lx, ly + 14);
    doc.setFont("helvetica", "normal");
    doc.line(lx + 52, ly + 14.5, midX - 4, ly + 14.5);

    const rx = midX + 4;
    const rTop = y;
    const rH = headerH / 3;

    doc.rect(midX, rTop, right - midX, rH);
    doc.rect(midX, rTop + rH, right - midX, rH);
    doc.rect(midX, rTop + 2 * rH, right - midX, rH);

    doc.setFont("helvetica", "bold");
    doc.text("Bau-Nr.", rx, rTop + 6);
    doc.setFont("helvetica", "normal");
    doc.text(projectNr || "-", rx + 22, rTop + 6);

    doc.setFont("helvetica", "bold");
    doc.text("Datum", rx, rTop + rH + 6);
    doc.setFont("helvetica", "normal");
    doc.text(todayDE(), rx + 22, rTop + rH + 6);

    doc.setFont("helvetica", "bold");
    doc.text("MwSt", rx, rTop + 2 * rH + 6);
    doc.setFont("helvetica", "normal");
    doc.text(`${mwst} %`, rx + 22, rTop + 2 * rH + 6);

    y += headerH + 10;

    // ===== Nachträge blocks =====
    doc.setFontSize(10);

    for (const r0 of rows) {
      const posNr = textOr(r0.posNr);
      const kurz = textOr(r0.kurztext || r0.text);
      const lang = textOr(r0.langtext);
      const einheit = textOr(r0.einheit) || "m";
      const delta = num(r0.delta);
      const ep = num(r0.preis);
      const status = textOr(r0.status) || "Entwurf";
      const zeilen = Number.isFinite(Number(r0.zeilen)) ? num(r0.zeilen) : delta * ep;

      const boxW = contentW;
      const innerW = boxW - 6;

      doc.setFont("helvetica", "bold");
      const kurzLines = wrap(doc, kurz || "", innerW - 2);
      doc.setFont("helvetica", "normal");
      const langLines = wrap(doc, lang || "", innerW - 2);

      const kurzH = Math.max(7, kurzLines.length * 4.2);
      const langH = Math.max(18, langLines.length * 4.2);
      const freeH = 18;
      const begrH = 16;
      const metaH = 14;

      const blockH = 6 + metaH + kurzH + langH + freeH + begrH + 6;

      y = ensureSpace(doc, y, blockH);

      doc.rect(left, y, boxW, blockH);

      const metaRowY = y + 2;
      const metaRowH = metaH;

      doc.line(left, metaRowY + metaRowH, left + boxW, metaRowY + metaRowH);

      const c1 = left + boxW * 0.20;
      const c2 = left + boxW * 0.52;
      const c3 = left + boxW * 0.66;
      const c4 = left + boxW * 0.80;

      doc.line(c1, metaRowY, c1, metaRowY + metaRowH);
      doc.line(c2, metaRowY, c2, metaRowY + metaRowH);
      doc.line(c3, metaRowY, c3, metaRowY + metaRowH);
      doc.line(c4, metaRowY, c4, metaRowY + metaRowH);

      doc.setFont("helvetica", "bold");
      doc.text("PosNr", left + 3, metaRowY + 6);
      doc.text("Status", c1 + 3, metaRowY + 6);
      doc.text("Menge", c2 + 3, metaRowY + 6);
      doc.text("EP (netto)", c3 + 3, metaRowY + 6);
      doc.text("Zeile (netto)", c4 + 3, metaRowY + 6);

      doc.setFont("helvetica", "normal");
      doc.text(posNr || "-", left + 3, metaRowY + 12);
      doc.text(status, c1 + 3, metaRowY + 12);

      doc.text(
        `${new Intl.NumberFormat("de-DE", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(delta)} ${einheit}`,
        c2 + 3,
        metaRowY + 12
      );

      doc.text(euro(ep), c3 + 3, metaRowY + 12);
      doc.text(euro(zeilen), c4 + 3, metaRowY + 12);

      let yy = metaRowY + metaRowH + 4;

      doc.setFont("helvetica", "bold");
      doc.text("Kurztext", left + 3, yy + 4);
      doc.setFont("helvetica", "normal");
      doc.rect(left + 2, yy + 6, boxW - 4, kurzH + 2);
      doc.text(kurzLines, left + 4, yy + 11);
      yy = yy + 6 + kurzH + 6;

      doc.setFont("helvetica", "bold");
      doc.text("Langtext", left + 3, yy + 4);
      doc.setFont("helvetica", "normal");
      doc.rect(left + 2, yy + 6, boxW - 4, langH + 2);

      if (langLines.join("").trim()) {
        doc.text(langLines, left + 4, yy + 11);
      } else {
        const startY = yy + 11;
        const maxY = yy + 6 + langH;
        for (let ly2 = startY; ly2 <= maxY; ly2 += 6) {
          doc.setDrawColor(210);
          doc.line(left + 4, ly2, right - 4, ly2);
          doc.setDrawColor(0);
        }
      }
      yy = yy + 6 + langH + 8;

      doc.setFont("helvetica", "bold");
      doc.text("Ort / Ausführung / Zusatztext", left + 3, yy + 4);
      doc.setFont("helvetica", "normal");
      doc.rect(left + 2, yy + 6, boxW - 4, freeH);

      {
        const startY = yy + 10;
        for (let ly3 = startY; ly3 <= yy + 6 + freeH - 2; ly3 += 6) {
          doc.setDrawColor(210);
          doc.line(left + 4, ly3, right - 4, ly3);
          doc.setDrawColor(0);
        }
      }
      yy = yy + 6 + freeH + 8;

      doc.setFont("helvetica", "bold");
      doc.text("Begründung / Anordnung", left + 3, yy + 4);
      doc.setFont("helvetica", "normal");
      doc.rect(left + 2, yy + 6, boxW - 4, begrH);

      const begr = textOr(r0.begruendung);
      if (begr) {
        const bLines = wrap(doc, begr, innerW - 2);
        doc.text(bLines, left + 4, yy + 11);
      } else {
        const startY = yy + 10;
        for (let ly4 = startY; ly4 <= yy + 6 + begrH - 2; ly4 += 6) {
          doc.setDrawColor(210);
          doc.line(left + 4, ly4, right - 4, ly4);
          doc.setDrawColor(0);
        }
      }

      y += blockH + 8;
    }

    // Totals box
    y = ensureSpace(doc, y, 22);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);

    const sumW = 80;
    const sumX = right - sumW;
    doc.rect(sumX, y, sumW, 18);
    doc.text(`Gesamt Netto: ${euro(totalsNetto)}`, sumX + 4, y + 7);
    doc.text(`Gesamt Brutto: ${euro(totalsBrutto)}`, sumX + 4, y + 14);

    const pdf = Buffer.from(doc.output("arraybuffer"));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="Nachtraege.pdf"');
    return res.status(200).send(pdf);
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

export default r;

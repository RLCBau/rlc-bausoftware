// apps/server/src/routes/pdf.ts
import { Router } from "express";
import PDFDocument from "pdfkit";

const router = Router();

/* ======================
   Helpers PDF generici
====================== */
function mkDoc() {
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c as Buffer));
  const end = (res: any, filename: string) => {
    doc.on("end", () => {
      const pdf = Buffer.concat(chunks);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
      res.send(pdf);
    });
    doc.end();
  };
  return { doc, end };
}

const fmtEUR = (n: number) =>
  (n ?? 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" });

function hr(doc: PDFKit.PDFDocument, color = "#ddd", y?: number) {
  const yy = y ?? doc.y;
  doc.moveTo(40, yy).lineTo(555, yy).strokeColor(color).stroke();
}

function header(doc: PDFKit.PDFDocument, title: string, subtitle?: string) {
  doc.fontSize(18).text(title, { align: "left" });
  if (subtitle) doc.moveDown(0.1).fontSize(11).fillColor("#444").text(subtitle);
  doc.fillColor("#000");
  doc.moveDown(0.5);
  hr(doc);
  doc.moveDown(0.6);
}

function footerSignatures(doc: PDFKit.PDFDocument, left: string, right: string) {
  const startY = doc.y + 28;
  const x1 = 60, x2 = 320;
  doc.moveTo(x1, startY).lineTo(x1 + 180, startY).stroke("#ccc");
  doc.moveTo(x2, startY).lineTo(x2 + 180, startY).stroke("#ccc");
  doc.fontSize(10).fillColor("#555");
  doc.text(left, x1, startY + 5, { width: 180, align: "center" });
  doc.text(right, x2, startY + 5, { width: 180, align: "center" });
  doc.fillColor("#000");
}

/* ======================
   /angebot
====================== */
/**
 * Body atteso (flessibile):
 * {
 *   project: { number, name, client?, location? },
 *   options: { mwst:number, city?:string, dateISO?:string, payment?:string, showWatermark?:boolean },
 *   rows: [{ posNr, text, einheit, menge, preis, zeilen? }],
 *   totals: { netto, brutto }
 * }
 */
router.post("/angebot", async (req, res) => {
  try {
    const { project, options, rows = [], totals } = req.body || {};
    const mwst = Number(options?.mwst ?? 19);
    const city = String(options?.city ?? "");
    const dateISO = options?.dateISO || new Date().toISOString();
    const payment = String(options?.payment ?? "");

    const { doc, end } = mkDoc();
    header(
      doc,
      "Angebot",
      project ? `Projekt: ${project.number ?? ""}  ${project.name ?? ""}` : undefined
    );

    if (project?.client || project?.location || city) {
      doc.fontSize(10).fillColor("#555");
      if (project?.client) doc.text(`Auftraggeber: ${project.client}`);
      if (project?.location) doc.text(`Ort: ${project.location}`);
      doc.text(
        `${city ? city + " – " : ""}${new Date(dateISO).toLocaleDateString("de-DE")}`
      );
      doc.fillColor("#000").moveDown(0.5);
    }

    // Kopfzeile Tabelle
    doc.fontSize(10).text("PosNr", 40, doc.y, { width: 55 });
    doc.text("Kurztext", 100, doc.y, { width: 200 });
    doc.text("ME", 305, doc.y, { width: 35 });
    doc.text("Menge", 345, doc.y, { width: 55, align: "right" });
    doc.text("EP (€)", 405, doc.y, { width: 65, align: "right" });
    doc.text("Zeilen (€)", 475, doc.y, { width: 80, align: "right" });
    doc.moveDown(0.3); hr(doc, "#ccc"); doc.moveDown(0.2);

    // Righe
    for (const r of rows) {
      const zeile = (Number(r.menge || 0) * Number(r.preis || 0));
      doc.fontSize(9);
      doc.text(String(r.posNr ?? ""), 40, doc.y, { width: 55 });
      doc.text(String(r.text ?? ""), 100, doc.y, { width: 200 });
      doc.text(String(r.einheit ?? ""), 305, doc.y, { width: 35 });
      doc.text(String(r.menge ?? ""), 345, doc.y, { width: 55, align: "right" });
      doc.text(String(r.preis ?? ""), 405, doc.y, { width: 65, align: "right" });
      doc.text(zeile.toFixed(2), 475, doc.y, { width: 80, align: "right" });
      doc.moveDown(0.15);
      if (doc.y > 740) { doc.addPage(); }
    }

    doc.moveDown(0.6); hr(doc, "#aaa"); doc.moveDown(0.6);

    // Totali
    const netto = Number(totals?.netto ?? 0);
    const brutto = Number(totals?.brutto ?? netto * (1 + mwst / 100));
    doc.fontSize(11);
    doc.text(`Gesamt Netto:  ${fmtEUR(netto)}`, 300, doc.y, { align: "right" });
    doc.text(`+ MwSt (${mwst}%):  ${fmtEUR(netto * mwst / 100)}`, 300, doc.y, { align: "right" });
    doc.fontSize(12).text(`Gesamt Brutto:  ${fmtEUR(brutto)}`, 300, doc.y, { align: "right", underline: true });
    doc.moveDown(1);

    // Note / watermark
    if (payment) { doc.fontSize(9).fillColor("#444").text(payment); doc.fillColor("#000"); }
    if (options?.showWatermark) {
      doc.fontSize(8).fillColor("#bbb").text("Powered by OpenAI – RLC Bausoftware", 40, 790, { align: "center" });
      doc.fillColor("#000");
    }

    end(res, "angebot.pdf");
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e?.message || "PDF error" });
  }
});

/* ======================
   /regiebericht
====================== */
/**
 * Body:
 * {
 *   project: { number, name, location? },
 *   header: { dateISO, crew?: string, machine?: string, weather?: string, note?: string },
 *   rows: [{ zeit?, leistung, einheit, menge, preis?, betrag? }],
 *   signatures?: { left?: string, right?: string }
 * }
 */
router.post("/regiebericht", async (req, res) => {
  try {
    const { project, header: H = {}, rows = [], signatures = {} } = req.body || {};
    const { doc, end } = mkDoc();

    header(
      doc,
      "Regiebericht",
      project ? `Projekt: ${project.number ?? ""}  ${project.name ?? ""}` : undefined
    );

    // Meta
    doc.fontSize(10).fillColor("#555");
    if (project?.location) doc.text(`Ort: ${project.location}`);
    if (H.dateISO) doc.text(`Datum: ${new Date(H.dateISO).toLocaleDateString("de-DE")}`);
    if (H.crew) doc.text(`Kolonne: ${H.crew}`);
    if (H.machine) doc.text(`Maschine: ${H.machine}`);
    if (H.weather) doc.text(`Wetter: ${H.weather}`);
    doc.fillColor("#000").moveDown(0.6);

    // Tabelle
    doc.fontSize(10).text("Zeit", 40, doc.y, { width: 55 });
    doc.text("Leistung / Tätigkeit", 100, doc.y, { width: 260 });
    doc.text("ME", 365, doc.y, { width: 35 });
    doc.text("Menge", 405, doc.y, { width: 60, align: "right" });
    doc.text("EP (€)", 470, doc.y, { width: 55, align: "right" });
    doc.text("Betrag (€)", 525, doc.y, { width: 55, align: "right" });
    doc.moveDown(0.3); hr(doc, "#ccc"); doc.moveDown(0.2);

    let sum = 0;
    for (const r of rows) {
      const betrag = Number(r.betrag ?? (Number(r.menge || 0) * Number(r.preis || 0)));
      sum += betrag;
      doc.fontSize(9);
      doc.text(String(r.zeit ?? ""), 40, doc.y, { width: 55 });
      doc.text(String(r.leistung ?? ""), 100, doc.y, { width: 260 });
      doc.text(String(r.einheit ?? ""), 365, doc.y, { width: 35 });
      doc.text(String(r.menge ?? ""), 405, doc.y, { width: 60, align: "right" });
      doc.text(String(r.preis ?? ""), 470, doc.y, { width: 55, align: "right" });
      doc.text(betrag.toFixed(2), 525, doc.y, { width: 55, align: "right" });
      doc.moveDown(0.15);
      if (doc.y > 740) doc.addPage();
    }

    doc.moveDown(0.6); hr(doc, "#aaa"); doc.moveDown(0.4);
    doc.fontSize(11).text(`Summe: ${fmtEUR(sum)}`, { align: "right" });

    if (H.note) { doc.moveDown(0.6); doc.fontSize(9).fillColor("#555").text(H.note); doc.fillColor("#000"); }
    doc.moveDown(1);
    footerSignatures(doc, signatures.left ?? "Unterschrift Bauleiter", signatures.right ?? "Unterschrift Auftraggeber");

    end(res, "regiebericht.pdf");
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e?.message || "PDF error" });
  }
});

/* ======================
   /lieferschein
====================== */
/**
 * Body:
 * {
 *   project: { number, name, location? },
 *   header: { dateISO, lieferant?: string, fahrer?: string, fahrzeug?: string, empfaenger?: string, baustelle?: string, bemerkung?: string },
 *   rows: [{ pos?, bezeichnung, menge, einheit }],
 * }
 */
router.post("/lieferschein", async (req, res) => {
  try {
    const { project, header: H = {}, rows = [] } = req.body || {};
    const { doc, end } = mkDoc();

    header(
      doc,
      "Lieferschein",
      project ? `Projekt: ${project.number ?? ""}  ${project.name ?? ""}` : undefined
    );

    // Meta
    doc.fontSize(10).fillColor("#555");
    doc.text(`Datum: ${new Date(H.dateISO || Date.now()).toLocaleDateString("de-DE")}`);
    if (H.empfaenger) doc.text(`Empfänger: ${H.empfaenger}`);
    if (H.baustelle ?? project?.location) doc.text(`Baustelle: ${H.baustelle ?? project?.location}`);
    if (H.lieferant) doc.text(`Lieferant: ${H.lieferant}`);
    if (H.fahrer || H.fahrzeug) doc.text(`Fahrer/Fahrzeug: ${[H.fahrer, H.fahrzeug].filter(Boolean).join(" / ")}`);
    doc.fillColor("#000").moveDown(0.6);

    // Tabelle
    doc.fontSize(10).text("Pos", 40, doc.y, { width: 35 });
    doc.text("Bezeichnung", 80, doc.y, { width: 330 });
    doc.text("ME", 415, doc.y, { width: 40 });
    doc.text("Menge", 460, doc.y, { width: 90, align: "right" });
    doc.moveDown(0.3); hr(doc, "#ccc"); doc.moveDown(0.2);

    let i = 1;
    for (const r of rows) {
      doc.fontSize(9);
      doc.text(String(r.pos ?? i), 40, doc.y, { width: 35 });
      doc.text(String(r.bezeichnung ?? ""), 80, doc.y, { width: 330 });
      doc.text(String(r.einheit ?? ""), 415, doc.y, { width: 40 });
      doc.text(String(r.menge ?? ""), 460, doc.y, { width: 90, align: "right" });
      doc.moveDown(0.15);
      if (doc.y > 740) doc.addPage();
      i++;
    }

    if (H.bemerkung) {
      doc.moveDown(0.6); hr(doc, "#eee"); doc.moveDown(0.2);
      doc.fontSize(9).fillColor("#555").text(`Bemerkung: ${H.bemerkung}`);
      doc.fillColor("#000");
    }

    doc.moveDown(1);
    footerSignatures(doc, "Warenausgabe / Fahrer", "Annahme Empfänger");

    end(res, "lieferschein.pdf");
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e?.message || "PDF error" });
  }
});

export default router;

// apps/server/src/services/pdf/regieberichtPdf.ts
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";

/**
 * Input dalla route /api/regie/generate
 *
 * – projectId: ID / Code del progetto
 * – date: stringa "YYYY-MM-DD"
 * – items.aufmass: array di righe Regie
 * – photos: opzionale, non obbligatorio per il layout tipo LKS
 */
export type RegieItem = {
  date?: string;
  worker?: string;
  hours?: number;
  machine?: string;
  material?: string;
  quantity?: number;
  unit?: string;
  comment?: string;
  lvItemPos?: string;
};

export type CreateRegieberichtPdfInput = {
  projectId: string;
  date: string;
  items: { aufmass: RegieItem[]; lieferscheine?: any[] };
  photos?: { name: string; dataUrl: string }[];
  participants?: any;
  meta?: any;
};

// ⚙️ root per i file progetto – adatta se usi già una costante altrove
const PROJECT_DATA_ROOT =
  process.env.PROJECT_DATA_ROOT ||
  path.join(process.cwd(), "project_data");

/**
 * Crea un PDF tipo LKS e lo salva in
 *   {PROJECT_DATA_ROOT}/{projectId}/regieberichte/Regiebericht_YYYY-MM-DD_xxx.pdf
 *
 * Ritorna l'URL relativo da usare come pdfUrl (es. "/files/PRJ-1/regieberichte/…")
 */
export async function createRegieberichtPdf(
  input: CreateRegieberichtPdfInput
): Promise<{ filePath: string; pdfUrl: string; fileName: string }> {
  const { projectId, date, items } = input;
  const aufmass = items.aufmass || [];

  // directory e nome file
  const projDir = path.join(PROJECT_DATA_ROOT, projectId);
  const regieDir = path.join(projDir, "regieberichte");
  if (!fs.existsSync(regieDir)) fs.mkdirSync(regieDir, { recursive: true });

  const safeDate = (date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const fileName = `Regiebericht_${safeDate}_${Date.now()}.pdf`;
  const filePath = path.join(regieDir, fileName);

  const doc = new PDFDocument({
    size: "A4",
    margin: 20,
  });

  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  // --------------------------------------------------
  // Basis-Koordinaten
  // --------------------------------------------------
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const left = 30;
  const right = pageW - 30;

  doc.font("Helvetica").fontSize(9);

  // --------------------------------------------------
  // Kopfbereich (ähnlich LKS)
  // --------------------------------------------------
  const topY = 40;

  // Linker Block: Tagesbericht / Bautagebuch / Regiebericht
  const leftBlockW = 190;
  doc
    .rect(left, topY, leftBlockW, 60)
    .lineWidth(0.7)
    .stroke();

  const cbX = left + leftBlockW - 25;
  let yy = topY + 10;

  doc.fontSize(11);
  doc.text("Tagesbericht", left + 12, yy);
  doc.rect(cbX, yy - 3, 10, 10).stroke();

  yy += 18;
  doc.text("Bautagebuch", left + 12, yy);
  doc.rect(cbX, yy - 3, 10, 10).stroke();

  yy += 18;
  doc.text("Regiebericht", left + 12, yy);
  // Regiebericht angekreuzt
  doc.rect(cbX, yy - 3, 10, 10).stroke();
  doc
    .moveTo(cbX + 1.5, yy - 1.5)
    .lineTo(cbX + 8.5, yy + 5.5)
    .moveTo(cbX + 8.5, yy - 1.5)
    .lineTo(cbX + 1.5, yy + 5.5)
    .stroke();

  // Mittel-Block: Baustelle / Auftraggeber
  const midX = left + leftBlockW;
  const midW = 260;
  doc.rect(midX, topY, midW, 60).stroke();

  doc.fontSize(9);
  doc.text("Baustelle:", midX + 8, topY + 8);
  doc
    .moveTo(midX + 60, topY + 14)
    .lineTo(midX + midW - 8, topY + 14)
    .stroke();

  doc.text("Auftraggeber/Anschrift:", midX + 8, topY + 28);
  doc
    .moveTo(midX + 95, topY + 34)
    .lineTo(midX + midW - 8, topY + 34)
    .stroke();

  // rechter Block: Bau-Nr, Wo-Nr, Datum
  const rightW = right - (midX + midW);
  const rightX = midX + midW;
  doc.rect(rightX, topY, rightW, 60).stroke();

  const smallFieldW = rightW - 70;

  let rY = topY + 6;
  doc.text("Bau-Nr.", rightX + 6, rY + 3);
  doc.rect(rightX + 50, rY, smallFieldW, 14).stroke();

  rY += 18;
  doc.text("Wo.-Nr.", rightX + 6, rY + 3);
  doc.rect(rightX + 50, rY, smallFieldW, 14).stroke();

  rY += 18;
  doc.text("Datum", rightX + 6, rY + 3);
  doc.rect(rightX + 50, rY, smallFieldW, 14).stroke();
  doc.fontSize(10).text(safeDate, rightX + 54, rY + 3);

  // --------------------------------------------------
  // Wochentage – JETZT ÜBER Arbeitsbeginn
  // --------------------------------------------------
  const days = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const daysY = topY + 60; // direkt unter Kopf, aber über Arbeitsbeginn
  const dayCellW = 24;

  // Linie unter den Tagen über die ganze Seite
  doc.rect(left, daysY, right - left, 16).stroke();

  days.forEach((d, idx) => {
    const x = left + idx * dayCellW;
    // Zellengrenze
    doc
      .moveTo(x, daysY)
      .lineTo(x, daysY + 16)
      .stroke();
    doc.fontSize(9).text(d, x + 6, daysY + 4);
  });
  // rechte Seite der Zeile
  doc
    .moveTo(left + days.length * dayCellW, daysY)
    .lineTo(left + days.length * dayCellW, daysY + 16)
    .stroke();

  // --------------------------------------------------
  // Zeile Arbeitsbeginn / Pausen / Arbeitsende / Blatt / Wetter
  // + 1 Zeile leer für Uhrzeiten
  // --------------------------------------------------
  const headY = daysY + 16;
  const rowH = 14;

  const colArbeitsbeginnW = 90;
  const colPauseW = 70;
  const colArbeitsendeW = 90;
  const colBlattW = 70;
  const colWetterW = right - left - (colArbeitsbeginnW + 2 * colPauseW + colArbeitsendeW + colBlattW);

  const xArbeitsbeginn = left;
  const xPause1 = xArbeitsbeginn + colArbeitsbeginnW;
  const xPause2 = xPause1 + colPauseW;
  const xArbeitsende = xPause2 + colPauseW;
  const xBlatt = xArbeitsende + colArbeitsendeW;
  const xWetter = xBlatt + colBlattW;

  // Header-Zeile
  doc.rect(left, headY, right - left, rowH).stroke();
  doc
    .moveTo(xPause1, headY)
    .lineTo(xPause1, headY + rowH)
    .stroke();
  doc
    .moveTo(xPause2, headY)
    .lineTo(xPause2, headY + rowH)
    .stroke();
  doc
    .moveTo(xArbeitsende, headY)
    .lineTo(xArbeitsende, headY + rowH)
    .stroke();
  doc
    .moveTo(xBlatt, headY)
    .lineTo(xBlatt, headY + rowH)
    .stroke();
  doc
    .moveTo(xWetter, headY)
    .lineTo(xWetter, headY + rowH)
    .stroke();

  doc.fontSize(9);
  doc.text("Arbeitsbeginn", xArbeitsbeginn + 4, headY + 3);
  doc.text("Pause 1", xPause1 + 4, headY + 3);
  doc.text("Pause 2", xPause2 + 4, headY + 3);
  doc.text("Arbeitsende", xArbeitsende + 4, headY + 3);
  doc.text("Blatt Nr.", xBlatt + 4, headY + 3);
  doc.text("Wetter", xWetter + 4, headY + 3);

  // LEERE ZEILE für Uhrzeiten
  const timeY = headY + rowH;
  doc.rect(left, timeY, right - left, rowH).stroke();
  doc
    .moveTo(xPause1, timeY)
    .lineTo(xPause1, timeY + rowH)
    .stroke();
  doc
    .moveTo(xPause2, timeY)
    .lineTo(xPause2, timeY + rowH)
    .stroke();
  doc
    .moveTo(xArbeitsende, timeY)
    .lineTo(xArbeitsende, timeY + rowH)
    .stroke();
  doc
    .moveTo(xBlatt, timeY)
    .lineTo(xBlatt, timeY + rowH)
    .stroke();
  doc
    .moveTo(xWetter, timeY)
    .lineTo(xWetter, timeY + rowH)
    .stroke();
  // (Kein Text – alles leer)

  // --------------------------------------------------
  // Tabelle: Geräte / Mitarbeiter / Besondere Leistungen
  // max 6 Zeilen
  // --------------------------------------------------
  const tableHeadY = timeY + rowH + 6;
  const tableRowH = 18;
  const maxRows = 6;

  const colGerätW = 250;
  const colNameW = 220;
  const colBesW = right - left - colGerätW - colNameW;

  const xGerät = left;
  const xName = xGerät + colGerätW;
  const xBes = xName + colNameW;

  // Kopfzeile
  doc.rect(left, tableHeadY, right - left, tableRowH).stroke();
  doc
    .moveTo(xName, tableHeadY)
    .lineTo(xName, tableHeadY + tableRowH)
    .stroke();
  doc
    .moveTo(xBes, tableHeadY)
    .lineTo(xBes, tableHeadY + tableRowH)
    .stroke();

  doc.fontSize(9);
  doc.text("Bezeichnung der Geräte", xGerät + 4, tableHeadY + 4);
  doc.text(
    "Name der Arbeitnehmer / Fuhrunternehmer",
    xName + 4,
    tableHeadY + 4
  );
  doc.text("Besondere Leistungen / Material", xBes + 4, tableHeadY + 4);

  // Zeilen
  const lines: RegieItem[] = [...aufmass];
  // Wenn mehr als 6 → die ersten 6 auf dieser Seite, Rest im Moment ignoriert
  // (später kann man ggf. Folgeseiten bauen)
  const shown = lines.slice(0, maxRows);

  for (let i = 0; i < maxRows; i++) {
    const y = tableHeadY + tableRowH + i * tableRowH;
    doc.rect(left, y, right - left, tableRowH).stroke();
    doc
      .moveTo(xName, y)
      .lineTo(xName, y + tableRowH)
      .stroke();
    doc
      .moveTo(xBes, y)
      .lineTo(xBes, y + tableRowH)
      .stroke();

    const row = shown[i];
    if (!row) continue;

    // Linke Spalte – Gerät
    const gerätParts: string[] = [];
    if (row.machine) gerätParts.push(row.machine);
    if (row.lvItemPos) gerätParts.push(`Pos. ${row.lvItemPos}`);
    const gerätText = gerätParts.join(" • ");
    if (gerätText) {
      doc.fontSize(9).text(gerätText, xGerät + 4, y + 4, {
        width: colGerätW - 8,
        height: tableRowH - 8,
      });
    }

    // Mitte – Name + Stunden
    const nameParts: string[] = [];
    if (row.worker) nameParts.push(row.worker);
    if (row.hours != null && !Number.isNaN(row.hours)) {
      nameParts.push(
        `${row.hours.toLocaleString("de-DE", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} Std.`
      );
    }
    const nameText = nameParts.join(" • ");
    if (nameText) {
      doc.fontSize(9).text(nameText, xName + 4, y + 4, {
        width: colNameW - 8,
        height: tableRowH - 8,
      });
    }

    // Rechts – besondere Leistung / Material + Menge
    const matParts: string[] = [];
    if (row.material) matParts.push(row.material);
    if (
      row.quantity != null &&
      !Number.isNaN(row.quantity) &&
      row.quantity !== 0
    ) {
      const qtyStr = row.quantity.toLocaleString("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      matParts.push(`${qtyStr} ${row.unit || ""}`.trim());
    }
    const matText = matParts.join(" – ");
    if (matText) {
      doc.fontSize(9).text(matText, xBes + 4, y + 4, {
        width: colBesW - 8,
        height: tableRowH - 8,
      });
    }
  }

  // --------------------------------------------------
  // Beschreibung der Arbeit – größerer Bereich
  // --------------------------------------------------
  const descY = tableHeadY + tableRowH + maxRows * tableRowH + 10;
  const descH = 120; // etwas größer, weil nur 6 Zeilen oben

  doc.rect(left, descY, right - left, descH).stroke();
  doc.fontSize(9).text(
    "Beschreibung der Arbeit, besondere Vorkommnisse, Anordnungen",
    left + 4,
    descY + 3
  );

  // Text aus allen comment-Feldern zusammenfassen
  const allComments = aufmass
    .map((r) => r.comment?.trim())
    .filter(Boolean)
    .join("\n• ");

  if (allComments) {
    doc.fontSize(9).text("• " + allComments, left + 4, descY + 14, {
      width: right - left - 8,
      height: descH - 18,
    });
  }

  // --------------------------------------------------
  // Signaturbereich unten: Geprüft / Aufgestellt + Erfasst BA / Lohn
  // --------------------------------------------------
  const signTop = pageH - 80;
  const signH = 22;

  const signLeftW = (right - left - 140) / 2; // Platz für BA/Lohn rechts
  const signMiddleX = left + signLeftW;
  const baBoxX = signMiddleX + signLeftW;
  const baBoxW = 70;
  const lohnBoxX = baBoxX + baBoxW;
  const lohnBoxW = 70;

  // Reihe 1: Geprüft – Bauleiter / Bauherr
  doc.rect(left, signTop, signLeftW, signH).stroke();
  doc
    .fontSize(8)
    .text("Geprüft – Bauleiter", left + 4, signTop + 4);
  doc
    .moveTo(left + 4, signTop + signH - 4)
    .lineTo(left + signLeftW - 4, signTop + signH - 4)
    .stroke();

  doc.rect(signMiddleX, signTop, signLeftW, signH).stroke();
  doc.fontSize(8).text("Geprüft – Bauherr", signMiddleX + 4, signTop + 4);
  doc
    .moveTo(signMiddleX + 4, signTop + signH - 4)
    .lineTo(signMiddleX + signLeftW - 4, signTop + signH - 4)
    .stroke();

  // Rechte Seite: Erfasst BA + Erfasst Lohn
  doc.rect(baBoxX, signTop, baBoxW, signH).stroke();
  doc.fontSize(8).text("Erfasst BA", baBoxX + 4, signTop + 4);

  doc.rect(lohnBoxX, signTop, lohnBoxW, signH).stroke();
  doc.fontSize(8).text("Erfasst Lohn", lohnBoxX + 4, signTop + 4);

  // Reihe 2: Aufgestellt – Polier / Bauführer
  const sign2Top = signTop + signH;
  doc.rect(left, sign2Top, signLeftW, signH).stroke();
  doc
    .fontSize(8)
    .text("Aufgestellt – Polier", left + 4, sign2Top + 4);
  doc
    .moveTo(left + 4, sign2Top + signH - 4)
    .lineTo(left + signLeftW - 4, sign2Top + signH - 4)
    .stroke();

  doc.rect(signMiddleX, sign2Top, signLeftW, signH).stroke();
  doc.fontSize(8).text("Aufgestellt – Bauführer", signMiddleX + 4, sign2Top + 4);
  doc
    .moveTo(signMiddleX + 4, sign2Top + signH - 4)
    .lineTo(signMiddleX + signLeftW - 4, sign2Top + signH - 4)
    .stroke();

  // --------------------------------------------------
  // Fotos (optional) – separate Seite, ganz einfach
  // --------------------------------------------------
  if (input.photos && input.photos.length) {
    doc.addPage();
    doc.fontSize(11).text("Fotodokumentation", left, 40);
    let y = 60;
    const maxW = 200;
    const maxH = 140;

    for (const ph of input.photos) {
      try {
        const base64 = ph.dataUrl.split(";base64,").pop() || "";
        const buf = Buffer.from(base64, "base64");
        doc
          .rect(left, y - 4, maxW + 8, maxH + 8)
          .stroke();
        doc.image(buf, left + 4, y, {
          fit: [maxW, maxH],
          align: "center",
          valign: "center",
        });
        y += maxH + 20;
        if (y + maxH > pageH - 40) {
          doc.addPage();
          y = 60;
        }
      } catch {
        // ignora errori immagine singola
      }
    }
  }

  doc.end();

  await new Promise<void>((resolve, reject) => {
    stream.on("finish", () => resolve());
    stream.on("error", (err) => reject(err));
  });

  // URL relativo – adatta al tuo handler /files
  const relPath = `/files/${encodeURIComponent(
    projectId
  )}/regieberichte/${encodeURIComponent(fileName)}`;

  return { filePath, pdfUrl: relPath, fileName };
}

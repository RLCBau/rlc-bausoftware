// apps/server/src/services/pdf/regieberichtPdf.ts
import fs from "fs";
import path from "path";
import {
  RLC_PDF_THEME,
  RlcPdfAsset,
  RlcPdfCompany,
  createRlcPdfDocument,
  drawRlcInfoField,
  drawRlcRoundedBox,
  drawRlcSectionTitle,
  resolveRlcAssetBuffer,
  resolveRlcPdfPathContext,
  rlcFirstText,
  rlcGermanDate,
  rlcGermanNumber,
  rlcNumber,
} from "./rlcPdfCore";

export type RegieItem = {
  date?: string;
  worker?: string;
  mitarbeiter?: string;
  hours?: number;
  stunden?: number;
  machine?: string;
  maschine?: string;
  material?: string;
  quantity?: number;
  menge?: number;
  unit?: string;
  einheit?: string;
  comment?: string;
  text?: string;
  bemerkungen?: string;
  lvItemPos?: string;
  position?: string;
  pos?: string;
  regieNummer?: string;
  auftraggeber?: string;
  arbeitsbeginn?: string;
  arbeitsende?: string;
  pause1?: string;
  pause2?: string;
  blattNr?: string;
  wetter?: string;
  kostenstelle?: string;
  photos?: RegiePdfPhoto[];
  attachments?: RegiePdfPhoto[];
  [key: string]: any;
};

export type RegiePdfPhoto = RlcPdfAsset;
export type CompanyPdfHeader = RlcPdfCompany;

export type CreateRegieberichtPdfInput = {
  pdfPath: string;
  projectId: string;
  projectName?: string;
  date: string;
  regieNummer?: string;
  auftraggeber?: string;
  arbeitsbeginn?: string;
  arbeitsende?: string;
  pause1?: string;
  pause2?: string;
  blattNr?: string;
  wetter?: string;
  kostenstelle?: string;
  bemerkungen?: string;
  photos?: RegiePdfPhoto[];
  aufmass?: RegieItem[];
  lieferscheine?: any[];
  participants?: any;
  company?: CompanyPdfHeader;
};

function normalizedRows(rows: RegieItem[]): RegieItem[] {
  return rows.map((row) => ({
    ...row,
    date: rlcFirstText(row.date),
    worker: rlcFirstText(row.worker, row.mitarbeiter),
    hours: rlcNumber(row.hours ?? row.stunden),
    machine: rlcFirstText(row.machine, row.maschine),
    material: rlcFirstText(row.material),
    quantity: rlcNumber(row.quantity ?? row.menge),
    unit: rlcFirstText(row.unit, row.einheit),
    comment: rlcFirstText(row.comment, row.text),
    lvItemPos: rlcFirstText(row.lvItemPos, row.position, row.pos),
  }));
}

function uniquePhotos(photos: RegiePdfPhoto[]): RegiePdfPhoto[] {
  const seen = new Set<string>();
  const result: RegiePdfPhoto[] = [];

  for (const photo of photos) {
    const key = rlcFirstText(
      photo?.dataUrl,
      photo?.filePath,
      photo?.localPath,
      photo?.path,
      photo?.url,
      photo?.publicUrl,
      photo?.storagePath,
      photo?.storageKey,
      photo?.uri,
      photo?.name
    );
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(photo);
  }

  return result;
}

function drawMissingPhoto(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  message: string
) {
  doc
    .fillColor(RLC_PDF_THEME.muted)
    .font("Helvetica")
    .fontSize(9)
    .text(message, x + 12, y + height / 2 - 12, {
      width: width - 24,
      align: "center",
      height: 38,
      ellipsis: true,
    });
}

export async function createRegieberichtPdf(
  input: CreateRegieberichtPdfInput
): Promise<{ filePath: string; pdfUrl: string; fileName: string }> {
  const rows = normalizedRows(input.aufmass || []);
  const firstRow = rows[0] || {};
  const safeDate = rlcFirstText(input.date, new Date().toISOString().slice(0, 10)).slice(0, 10);
  const projectName = rlcFirstText(input.projectName, input.projectId);
  const regieNummer = rlcFirstText(input.regieNummer, firstRow.regieNummer);
  const auftraggeber = rlcFirstText(input.auftraggeber, firstRow.auftraggeber);
  const arbeitsbeginn = rlcFirstText(input.arbeitsbeginn, firstRow.arbeitsbeginn);
  const arbeitsende = rlcFirstText(input.arbeitsende, firstRow.arbeitsende);
  const pause1 = rlcFirstText(input.pause1, firstRow.pause1);
  const pause2 = rlcFirstText(input.pause2, firstRow.pause2);
  const blattNr = rlcFirstText(input.blattNr, firstRow.blattNr);
  const wetter = rlcFirstText(input.wetter, firstRow.wetter);
  const kostenstelle = rlcFirstText(input.kostenstelle, firstRow.kostenstelle);
  const bemerkungen = rlcFirstText(input.bemerkungen, firstRow.bemerkungen);

  const rowPhotos = rows.flatMap((row) => [
    ...(Array.isArray(row.photos) ? row.photos : []),
    ...(Array.isArray(row.attachments) ? row.attachments : []),
  ]);
  const photos = uniquePhotos([...(input.photos || []), ...rowPhotos]);

  const pdf = createRlcPdfDocument({
    pdfPath: input.pdfPath,
    title: "Regiebericht",
    documentType: "Regiebericht",
    projectId: input.projectId,
    projectName,
    date: safeDate,
    company: input.company,
    subject: `Regiebericht ${regieNummer || safeDate}`,
  });

  const { doc } = pdf;
  let y = pdf.startCurrentPage();
  const contentWidth = doc.page.width - RLC_PDF_THEME.marginX * 2;
  const gap = 8;

  const firstRowWidth = (contentWidth - gap * 3) / 4;
  drawRlcInfoField(doc, 34, y, firstRowWidth, "Regie-Nr.", regieNummer);
  drawRlcInfoField(doc, 34 + (firstRowWidth + gap), y, firstRowWidth, "Datum", rlcGermanDate(safeDate));
  drawRlcInfoField(doc, 34 + (firstRowWidth + gap) * 2, y, firstRowWidth, "Projekt", projectName);
  drawRlcInfoField(doc, 34 + (firstRowWidth + gap) * 3, y, firstRowWidth, "Kostenstelle", kostenstelle);
  y += 58;

  const halfWidth = (contentWidth - gap) / 2;
  drawRlcInfoField(doc, 34, y, halfWidth, "Auftraggeber / Anschrift", auftraggeber, 54);
  drawRlcInfoField(
    doc,
    34 + halfWidth + gap,
    y,
    halfWidth,
    "Arbeitszeit",
    [
      arbeitsbeginn && `Beginn ${arbeitsbeginn}`,
      arbeitsende && `Ende ${arbeitsende}`,
      pause1 && `Pause ${pause1}`,
      pause2 && `Pause 2 ${pause2}`,
    ]
      .filter(Boolean)
      .join(" · "),
    54
  );
  y += 64;

  const thirdWidth = (contentWidth - gap * 2) / 3;
  drawRlcInfoField(doc, 34, y, thirdWidth, "Wetter", wetter);
  drawRlcInfoField(doc, 34 + thirdWidth + gap, y, thirdWidth, "Blatt Nr.", blattNr);
  drawRlcInfoField(doc, 34 + (thirdWidth + gap) * 2, y, thirdWidth, "Positionen", String(rows.length));
  y += 62;

  y = drawRlcSectionTitle(doc, "Leistungen, Personal und Material", y);

  const columns = [
    { key: "lvItemPos", label: "Pos.", width: 47 },
    { key: "worker", label: "Mitarbeiter", width: 88 },
    { key: "hours", label: "Std.", width: 38, align: "right" as const },
    { key: "machine", label: "Maschine", width: 72 },
    { key: "material", label: "Material", width: 78 },
    { key: "quantity", label: "Menge", width: 56, align: "right" as const },
    { key: "comment", label: "Beschreibung", width: contentWidth - 379 },
  ];

  const drawTableHeader = () => {
    doc.roundedRect(34, y, contentWidth, 24, 5).fill(RLC_PDF_THEME.blueDark);
    let x = 34;
    for (const column of columns) {
      doc.fillColor(RLC_PDF_THEME.white).font("Helvetica-Bold").fontSize(7.7).text(column.label, x + 5, y + 8, {
        width: column.width - 10,
        align: column.align || "left",
        lineBreak: false,
        ellipsis: true,
      });
      x += column.width;
    }
    y += 28;
  };

  drawTableHeader();

  const tableRows = rows.length ? rows : [{} as RegieItem];
  for (let index = 0; index < tableRows.length; index++) {
    const row = tableRows[index];
    const values: Record<string, string> = {
      lvItemPos: rlcFirstText(row.lvItemPos),
      worker: rlcFirstText(row.worker),
      hours: rlcNumber(row.hours) ? rlcGermanNumber(row.hours) : "",
      machine: rlcFirstText(row.machine),
      material: rlcFirstText(row.material),
      quantity: rlcNumber(row.quantity)
        ? `${rlcGermanNumber(row.quantity)} ${rlcFirstText(row.unit)}`.trim()
        : "",
      comment: rlcFirstText(row.comment),
    };

    let rowHeight = 34;
    for (const column of columns) {
      const measured = doc.font("Helvetica").fontSize(7.8).heightOfString(values[column.key] || "-", {
        width: column.width - 10,
        align: column.align || "left",
      });
      rowHeight = Math.max(rowHeight, measured + 14);
    }
    rowHeight = Math.min(rowHeight, 72);

    if (y + rowHeight > pdf.contentBottom()) {
      y = pdf.addPage();
      y = drawRlcSectionTitle(doc, "Leistungen, Personal und Material", y);
      drawTableHeader();
    }

    drawRlcRoundedBox(
      doc,
      34,
      y,
      contentWidth,
      rowHeight,
      index % 2 === 0 ? RLC_PDF_THEME.white : RLC_PDF_THEME.background,
      RLC_PDF_THEME.line,
      4
    );
    let x = 34;
    for (const column of columns) {
      doc.fillColor(RLC_PDF_THEME.text).font("Helvetica").fontSize(7.8).text(values[column.key] || "-", x + 5, y + 7, {
        width: column.width - 10,
        height: rowHeight - 12,
        ellipsis: true,
        align: column.align || "left",
      });
      x += column.width;
    }
    y += rowHeight + 5;
  }

  const descriptionText = rows.map((row) => rlcFirstText(row.comment)).filter(Boolean).join("\n");
  const notesText = [descriptionText, bemerkungen].filter(Boolean).join("\n\n");

  if (notesText) {
    const notesHeight = Math.min(
      170,
      Math.max(72, doc.font("Helvetica").fontSize(9).heightOfString(notesText, { width: contentWidth - 20 }) + 34)
    );
    if (y + notesHeight + 34 > pdf.contentBottom()) y = pdf.addPage();
    y = drawRlcSectionTitle(doc, "Beschreibung und Bemerkungen", y);
    drawRlcRoundedBox(doc, 34, y, contentWidth, notesHeight, RLC_PDF_THEME.background, RLC_PDF_THEME.line, 7);
    doc.fillColor(RLC_PDF_THEME.text).font("Helvetica").fontSize(9).text(notesText, 44, y + 12, {
      width: contentWidth - 20,
      height: notesHeight - 24,
      ellipsis: true,
      lineGap: 2,
    });
    y += notesHeight + 14;
  }

  if (y + 92 > pdf.contentBottom()) y = pdf.addPage();
  y = drawRlcSectionTitle(doc, "Freigabe", y);
  const signatureWidth = (contentWidth - gap) / 2;
  for (const [index, label] of ["Auftraggeber / Bauherr", "Aufgestellt durch"].entries()) {
    const x = 34 + index * (signatureWidth + gap);
    drawRlcRoundedBox(doc, x, y, signatureWidth, 74, RLC_PDF_THEME.white, RLC_PDF_THEME.line, 7);
    doc.fillColor(RLC_PDF_THEME.muted).font("Helvetica-Bold").fontSize(8).text(label, x + 10, y + 10, {
      width: signatureWidth - 20,
      lineBreak: false,
      ellipsis: true,
    });
    doc.moveTo(x + 10, y + 54).lineTo(x + signatureWidth - 10, y + 54).lineWidth(0.8).strokeColor(RLC_PDF_THEME.line).stroke();
    doc.fillColor(RLC_PDF_THEME.muted).font("Helvetica").fontSize(7.5).text("Datum / Unterschrift", x + 10, y + 59, {
      lineBreak: false,
    });
  }

  if (photos.length) {
    y = pdf.addPage();
    y = drawRlcSectionTitle(doc, "Fotodokumentation", y);
    const photoGap = 12;
    const photoWidth = (contentWidth - photoGap) / 2;
    const photoHeight = 190;

    for (let index = 0; index < photos.length; index++) {
      const column = index % 2;
      if (column === 0 && index > 0) y += photoHeight + 20;
      if (column === 0 && y + photoHeight > pdf.contentBottom()) {
        y = pdf.addPage();
        y = drawRlcSectionTitle(doc, "Fotodokumentation", y);
      }

      const x = 34 + column * (photoWidth + photoGap);
      drawRlcRoundedBox(doc, x, y, photoWidth, photoHeight, RLC_PDF_THEME.background, RLC_PDF_THEME.line, 7);
      const buffer = resolveRlcAssetBuffer(input.pdfPath, photos[index]);

      if (buffer) {
        try {
          doc.image(buffer, x + 8, y + 8, {
            fit: [photoWidth - 16, photoHeight - 34],
            align: "center",
            valign: "center",
          });
        } catch {
          drawMissingPhoto(doc, x, y, photoWidth, photoHeight, "Bildformat konnte nicht verarbeitet werden.");
        }
      } else {
        drawMissingPhoto(doc, x, y, photoWidth, photoHeight, "Bilddatei wurde auf dem Server nicht gefunden.");
        console.warn("[RLC PDF] Regie photo not found", {
          projectId: input.projectId,
          name: photos[index]?.name,
          url: photos[index]?.url,
          filePath: photos[index]?.filePath,
          uri: photos[index]?.uri,
        });
      }

      doc.fillColor(RLC_PDF_THEME.text).font("Helvetica").fontSize(7.5).text(
        rlcFirstText(photos[index].name, `Foto ${index + 1}`),
        x + 8,
        y + photoHeight - 20,
        {
          width: photoWidth - 16,
          align: "center",
          ellipsis: true,
          lineBreak: false,
        }
      );
    }
  }

  await pdf.finish();

  const fileName = path.basename(input.pdfPath);
  const context = resolveRlcPdfPathContext(input.pdfPath);
  const relative = path.relative(context.projectRoot, input.pdfPath).split(path.sep).map(encodeURIComponent).join("/");
  const pdfUrl = `/projects/${encodeURIComponent(context.projectKey)}/${relative}`;

  return { filePath: input.pdfPath, pdfUrl, fileName };
}

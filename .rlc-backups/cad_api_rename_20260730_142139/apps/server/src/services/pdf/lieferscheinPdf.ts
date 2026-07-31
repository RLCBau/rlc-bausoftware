import path from "path";
import {
  RLC_PDF_THEME,
  createRlcPdfDocument,
  drawRlcInfoField,
  drawRlcRoundedBox,
  drawRlcSectionTitle,
  resolveRlcPdfPathContext,
  rlcFirstText,
  rlcGermanDate,
  rlcGermanNumber,
  rlcNumber,
  type RlcPdfAsset,
  type RlcPdfCompany,
} from "./rlcPdfCore";
import {
  drawRlcPhotoDocumentation,
  drawRlcSignatureSection,
  drawRlcTextPanel,
  uniqueRlcAssets,
} from "./rlcDocumentBlocks";

export type LieferscheinPdfInput = {
  pdfPath: string;
  projectId: string;
  projectName?: string;
  date?: string;
  lieferscheinNummer?: string;
  supplier?: string;
  site?: string;
  driver?: string;
  material?: string;
  quantity?: number | string;
  unit?: string;
  kostenstelle?: string;
  lvItemPos?: string | null;
  comment?: string;
  bemerkungen?: string;
  attachments?: RlcPdfAsset[];
  photos?: RlcPdfAsset[];
  company?: RlcPdfCompany;
  rows?: any[];
};

function normalizedRows(input: LieferscheinPdfInput): any[] {
  const rows = Array.isArray(input.rows) && input.rows.length ? input.rows : [input];
  return rows.filter(Boolean);
}

export async function createLieferscheinPdf(
  input: LieferscheinPdfInput
): Promise<{ filePath: string; pdfUrl: string; fileName: string }> {
  const rows = normalizedRows(input);
  const first = rows[0] || input;
  const safeDate = rlcFirstText(input.date, first.date, new Date().toISOString().slice(0, 10)).slice(0, 10);
  const projectName = rlcFirstText(input.projectName, first.projectName, first.site, input.projectId);
  const lsNumber = rlcFirstText(input.lieferscheinNummer, first.lieferscheinNummer, first.number);
  const supplier = rlcFirstText(input.supplier, first.supplier, first.lieferant);
  const site = rlcFirstText(input.site, first.site, first.baustelle, projectName);
  const driver = rlcFirstText(input.driver, first.driver, first.fahrer);
  const costCenter = rlcFirstText(input.kostenstelle, first.kostenstelle, first.costCenter);
  const notes = rlcFirstText(input.bemerkungen, first.bemerkungen, first.notes);

  const assets = uniqueRlcAssets([
    ...(input.photos || []),
    ...(input.attachments || []),
    ...rows.flatMap((row) => [
      ...(Array.isArray(row?.photos) ? row.photos : []),
      ...(Array.isArray(row?.attachments) ? row.attachments : []),
      ...(Array.isArray(row?.files) ? row.files : []),
    ]),
  ]);

  const pdf = createRlcPdfDocument({
    pdfPath: input.pdfPath,
    title: "Lieferschein",
    documentType: "Lieferschein",
    projectId: input.projectId,
    projectName,
    date: safeDate,
    company: input.company,
    subject: `Lieferschein ${lsNumber || safeDate}`,
  });

  const { doc } = pdf;
  const runtime = { doc, addPage: pdf.addPage, contentBottom: pdf.contentBottom };
  let y = pdf.startCurrentPage();
  const x0 = RLC_PDF_THEME.marginX;
  const width = doc.page.width - x0 * 2;
  const gap = 8;

  const quarter = (width - gap * 3) / 4;
  drawRlcInfoField(doc, x0, y, quarter, "LS-Nr.", lsNumber);
  drawRlcInfoField(doc, x0 + quarter + gap, y, quarter, "Datum", rlcGermanDate(safeDate));
  drawRlcInfoField(doc, x0 + (quarter + gap) * 2, y, quarter, "Projekt", projectName);
  drawRlcInfoField(doc, x0 + (quarter + gap) * 3, y, quarter, "Kostenstelle", costCenter);
  y += 58;

  const half = (width - gap) / 2;
  drawRlcInfoField(doc, x0, y, half, "Lieferant / Anschrift", supplier, 54);
  drawRlcInfoField(doc, x0 + half + gap, y, half, "Baustelle / Lieferort", site, 54);
  y += 64;

  drawRlcInfoField(doc, x0, y, half, "Fahrer / Fahrzeug", driver);
  drawRlcInfoField(doc, x0 + half + gap, y, half, "Positionen", String(rows.length));
  y += 62;

  y = drawRlcSectionTitle(doc, "Lieferpositionen", y);

  const columns = [
    { key: "lv", label: "LV-Pos.", width: 70 },
    { key: "material", label: "Material / Leistung", width: 210 },
    { key: "quantity", label: "Menge", width: 70, align: "right" as const },
    { key: "unit", label: "Einheit", width: 55 },
    { key: "comment", label: "Beschreibung", width: width - 405 },
  ];

  const drawHeader = () => {
    doc.roundedRect(x0, y, width, 24, 5).fill(RLC_PDF_THEME.blueDark);
    let x = x0;
    for (const column of columns) {
      doc
        .fillColor(RLC_PDF_THEME.white)
        .font("Helvetica-Bold")
        .fontSize(7.7)
        .text(column.label, x + 5, y + 8, {
          width: column.width - 10,
          align: column.align || "left",
          lineBreak: false,
          ellipsis: true,
        });
      x += column.width;
    }
    y += 28;
  };

  drawHeader();

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index] || {};
    const quantityRaw = row.quantity ?? row.qty ?? input.quantity;
    const values: Record<string, string> = {
      lv: rlcFirstText(row.lvItemPos, row.lvPos, input.lvItemPos),
      material: rlcFirstText(row.material, input.material),
      quantity: rlcNumber(quantityRaw) ? rlcGermanNumber(quantityRaw) : rlcFirstText(quantityRaw),
      unit: rlcFirstText(row.unit, input.unit),
      comment: rlcFirstText(row.comment, row.text, input.comment),
    };

    let rowHeight = 36;
    for (const column of columns) {
      rowHeight = Math.max(
        rowHeight,
        doc.font("Helvetica").fontSize(7.8).heightOfString(values[column.key] || "—", {
          width: column.width - 10,
          align: column.align || "left",
        }) + 14
      );
    }
    rowHeight = Math.min(rowHeight, 76);

    if (y + rowHeight > pdf.contentBottom()) {
      y = pdf.addPage();
      y = drawRlcSectionTitle(doc, "Lieferpositionen", y);
      drawHeader();
    }

    drawRlcRoundedBox(
      doc,
      x0,
      y,
      width,
      rowHeight,
      index % 2 === 0 ? RLC_PDF_THEME.white : RLC_PDF_THEME.background,
      RLC_PDF_THEME.line,
      4
    );

    let x = x0;
    for (const column of columns) {
      doc
        .fillColor(RLC_PDF_THEME.text)
        .font("Helvetica")
        .fontSize(7.8)
        .text(values[column.key] || "—", x + 5, y + 7, {
          width: column.width - 10,
          height: rowHeight - 12,
          ellipsis: true,
          align: column.align || "left",
        });
      x += column.width;
    }
    y += rowHeight + 5;
  }

  const descriptions = rows
    .map((row) => rlcFirstText(row?.comment, row?.text))
    .filter(Boolean)
    .join("\n");
  const combinedNotes = [descriptions, notes].filter(Boolean).join("\n\n");
  if (combinedNotes) y = drawRlcTextPanel(runtime, "Beschreibung und Bemerkungen", combinedNotes, y);

  y = drawRlcSignatureSection(runtime, y, ["Lieferant / Fahrer", "Empfänger / Bauleitung"]);
  y = drawRlcPhotoDocumentation(runtime, input.pdfPath, assets, y);

  await pdf.finish();

  const fileName = path.basename(input.pdfPath);
  const context = resolveRlcPdfPathContext(input.pdfPath);
  const relative = path
    .relative(context.projectRoot, input.pdfPath)
    .split(path.sep)
    .map(encodeURIComponent)
    .join("/");
  const pdfUrl = `/projects/${encodeURIComponent(context.projectKey)}/${relative}`;

  return { filePath: input.pdfPath, pdfUrl, fileName };
}

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

export type FotoDokumentationPdfInput = {
  pdfPath: string;
  projectId: string;
  projectName?: string;
  date?: string;
  kostenstelle?: string;
  lvItemPos?: string | null;
  comment?: string;
  bemerkungen?: string;
  main?: RlcPdfAsset | null;
  files?: RlcPdfAsset[];
  attachments?: RlcPdfAsset[];
  photos?: RlcPdfAsset[];
  extras?: any[];
  boxes?: any[];
  company?: RlcPdfCompany;
};

export async function createFotoDokumentationPdf(
  input: FotoDokumentationPdfInput
): Promise<{ filePath: string; pdfUrl: string; fileName: string }> {
  const safeDate = rlcFirstText(input.date, new Date().toISOString().slice(0, 10)).slice(0, 10);
  const projectName = rlcFirstText(input.projectName, input.projectId);
  const assets = uniqueRlcAssets([
    input.main || undefined,
    ...(input.photos || []),
    ...(input.files || []),
    ...(input.attachments || []),
  ]);

  const pdf = createRlcPdfDocument({
    pdfPath: input.pdfPath,
    title: "Fotodokumentation",
    documentType: "Fotodokumentation",
    projectId: input.projectId,
    projectName,
    date: safeDate,
    company: input.company,
    subject: `Fotodokumentation ${safeDate}`,
  });

  const { doc } = pdf;
  const runtime = { doc, addPage: pdf.addPage, contentBottom: pdf.contentBottom };
  let y = pdf.startCurrentPage();
  const x0 = RLC_PDF_THEME.marginX;
  const width = doc.page.width - x0 * 2;
  const gap = 8;
  const quarter = (width - gap * 3) / 4;

  drawRlcInfoField(doc, x0, y, quarter, "Datum", rlcGermanDate(safeDate));
  drawRlcInfoField(doc, x0 + quarter + gap, y, quarter, "Projekt", projectName);
  drawRlcInfoField(
    doc,
    x0 + (quarter + gap) * 2,
    y,
    quarter,
    "Kostenstelle",
    rlcFirstText(input.kostenstelle)
  );
  drawRlcInfoField(
    doc,
    x0 + (quarter + gap) * 3,
    y,
    quarter,
    "LV-Position",
    rlcFirstText(input.lvItemPos)
  );
  y += 62;

  const notes = [rlcFirstText(input.comment), rlcFirstText(input.bemerkungen)]
    .filter(Boolean)
    .join("\n\n");
  if (notes) y = drawRlcTextPanel(runtime, "Beschreibung und Bemerkungen", notes, y);

  const extras = Array.isArray(input.extras) ? input.extras : [];
  if (extras.length) {
    if (y + 110 > pdf.contentBottom()) y = pdf.addPage();
    y = drawRlcSectionTitle(doc, "Erkannte und dokumentierte Positionen", y);

    const columns = [
      { key: "pos", label: "Pos.", width: 72 },
      { key: "description", label: "Beschreibung", width: width - 202 },
      { key: "quantity", label: "Menge", width: 72, align: "right" as const },
      { key: "unit", label: "Einheit", width: 58 },
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

    for (let index = 0; index < extras.length; index++) {
      const row = extras[index] || {};
      const quantity = row.menge ?? row.quantity ?? row.qty;
      const values: Record<string, string> = {
        pos: rlcFirstText(row.lvPos, row.lvItemPos, row.position, row.id),
        description: rlcFirstText(row.beschreibung, row.description, row.label),
        quantity: rlcNumber(quantity) ? rlcGermanNumber(quantity) : rlcFirstText(quantity),
        unit: rlcFirstText(row.einheit, row.unit),
      };

      let rowHeight = Math.max(
        36,
        doc.font("Helvetica").fontSize(7.8).heightOfString(values.description || "—", {
          width: columns[1].width - 10,
        }) + 14
      );
      rowHeight = Math.min(rowHeight, 70);

      if (y + rowHeight > pdf.contentBottom()) {
        y = pdf.addPage();
        y = drawRlcSectionTitle(doc, "Erkannte und dokumentierte Positionen", y);
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
  }

  y = drawRlcSignatureSection(runtime, y, ["Dokumentiert durch", "Geprüft / Freigegeben"]);
  y = drawRlcPhotoDocumentation(runtime, input.pdfPath, assets, y, "Fotodokumentation");

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

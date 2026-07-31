import {
  RLC_PDF_THEME,
  drawRlcRoundedBox,
  drawRlcSectionTitle,
  resolveRlcAssetBuffer,
  rlcFirstText,
  type RlcPdfAsset,
} from "./rlcPdfCore";

export type RlcPdfRuntime = {
  doc: PDFKit.PDFDocument;
  addPage: () => number;
  contentBottom: () => number;
};

export function uniqueRlcAssets(input: Array<RlcPdfAsset | null | undefined>): RlcPdfAsset[] {
  const seen = new Set<string>();
  return input
    .filter(Boolean)
    .map((asset) => asset as RlcPdfAsset)
    .filter((asset) => {
      const key = rlcFirstText(
        asset.dataUrl,
        asset.filePath,
        asset.localPath,
        asset.storagePath,
        asset.storageKey,
        asset.url,
        asset.publicUrl,
        asset.uri,
        asset.name
      );
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function drawRlcTextPanel(
  runtime: RlcPdfRuntime,
  title: string,
  text: string,
  y: number,
  options?: { minHeight?: number; maxHeight?: number }
): number {
  const { doc } = runtime;
  const contentWidth = doc.page.width - RLC_PDF_THEME.marginX * 2;
  const normalized = rlcFirstText(text) || "—";
  const minHeight = options?.minHeight ?? 70;
  const maxHeight = options?.maxHeight ?? 190;
  const measured = doc
    .font("Helvetica")
    .fontSize(9)
    .heightOfString(normalized, { width: contentWidth - 20, lineGap: 2 });
  const height = Math.min(maxHeight, Math.max(minHeight, measured + 28));

  if (y + height + 34 > runtime.contentBottom()) y = runtime.addPage();
  y = drawRlcSectionTitle(doc, title, y);
  drawRlcRoundedBox(
    doc,
    RLC_PDF_THEME.marginX,
    y,
    contentWidth,
    height,
    RLC_PDF_THEME.background,
    RLC_PDF_THEME.line,
    7
  );
  doc
    .fillColor(RLC_PDF_THEME.text)
    .font("Helvetica")
    .fontSize(9)
    .text(normalized, RLC_PDF_THEME.marginX + 10, y + 12, {
      width: contentWidth - 20,
      height: height - 22,
      ellipsis: true,
      lineGap: 2,
    });
  return y + height + 14;
}

export function drawRlcSignatureSection(
  runtime: RlcPdfRuntime,
  y: number,
  labels: [string, string] = ["Aufgestellt durch", "Geprüft / Freigegeben"]
): number {
  const { doc } = runtime;
  const contentWidth = doc.page.width - RLC_PDF_THEME.marginX * 2;
  const gap = 8;
  const width = (contentWidth - gap) / 2;

  if (y + 96 > runtime.contentBottom()) y = runtime.addPage();
  y = drawRlcSectionTitle(doc, "Freigabe", y);

  labels.forEach((label, index) => {
    const x = RLC_PDF_THEME.marginX + index * (width + gap);
    drawRlcRoundedBox(doc, x, y, width, 74, RLC_PDF_THEME.white, RLC_PDF_THEME.line, 7);
    doc
      .fillColor(RLC_PDF_THEME.muted)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(label, x + 10, y + 10, {
        width: width - 20,
        lineBreak: false,
        ellipsis: true,
      });
    doc
      .moveTo(x + 10, y + 54)
      .lineTo(x + width - 10, y + 54)
      .lineWidth(0.8)
      .strokeColor(RLC_PDF_THEME.line)
      .stroke();
    doc
      .fillColor(RLC_PDF_THEME.muted)
      .font("Helvetica")
      .fontSize(7.5)
      .text("Datum / Unterschrift", x + 10, y + 59, { lineBreak: false });
  });

  return y + 88;
}

export function drawRlcPhotoDocumentation(
  runtime: RlcPdfRuntime,
  pdfPath: string,
  assets: RlcPdfAsset[],
  y: number,
  title = "Fotodokumentation"
): number {
  if (!assets.length) return y;

  const { doc } = runtime;
  const contentWidth = doc.page.width - RLC_PDF_THEME.marginX * 2;
  const gap = 12;
  const width = (contentWidth - gap) / 2;
  const height = 190;

  y = runtime.addPage();
  y = drawRlcSectionTitle(doc, title, y);

  for (let index = 0; index < assets.length; index++) {
    const column = index % 2;
    if (column === 0 && index > 0) y += height + 20;
    if (column === 0 && y + height > runtime.contentBottom()) {
      y = runtime.addPage();
      y = drawRlcSectionTitle(doc, title, y);
    }

    const x = RLC_PDF_THEME.marginX + column * (width + gap);
    drawRlcRoundedBox(doc, x, y, width, height, RLC_PDF_THEME.background, RLC_PDF_THEME.line, 7);
    const buffer = resolveRlcAssetBuffer(pdfPath, assets[index]);

    if (buffer) {
      try {
        doc.image(buffer, x + 8, y + 8, {
          fit: [width - 16, height - 34],
          align: "center",
          valign: "center",
        });
      } catch {
        doc
          .fillColor(RLC_PDF_THEME.muted)
          .font("Helvetica")
          .fontSize(9)
          .text("Bildformat konnte nicht verarbeitet werden.", x + 12, y + height / 2 - 12, {
            width: width - 24,
            align: "center",
          });
      }
    } else {
      doc
        .fillColor(RLC_PDF_THEME.muted)
        .font("Helvetica")
        .fontSize(9)
        .text("Bilddatei wurde auf dem Server nicht gefunden.", x + 12, y + height / 2 - 12, {
          width: width - 24,
          align: "center",
        });
      console.warn("[RLC PDF] asset not found", {
        name: assets[index]?.name,
        url: assets[index]?.url,
        uri: assets[index]?.uri,
        filePath: assets[index]?.filePath,
      });
    }

    doc
      .fillColor(RLC_PDF_THEME.text)
      .font("Helvetica")
      .fontSize(7.5)
      .text(rlcFirstText(assets[index].name, `Foto ${index + 1}`), x + 8, y + height - 20, {
        width: width - 16,
        align: "center",
        ellipsis: true,
        lineBreak: false,
      });
  }

  return y + height + 20;
}

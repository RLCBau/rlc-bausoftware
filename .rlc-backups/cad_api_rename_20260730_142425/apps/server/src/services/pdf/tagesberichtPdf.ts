import path from "path";
import {
  RLC_PDF_THEME,
  createRlcPdfDocument,
  drawRlcInfoField,
  resolveRlcPdfPathContext,
  rlcFirstText,
  rlcGermanDate,
  type RlcPdfAsset,
  type RlcPdfCompany,
} from "./rlcPdfCore";
import {
  drawRlcPhotoDocumentation,
  drawRlcSignatureSection,
  drawRlcTextPanel,
  uniqueRlcAssets,
} from "./rlcDocumentBlocks";

export type TagesberichtPdfInput = {
  pdfPath: string;
  projectId: string;
  projectName?: string;
  date?: string;
  weather?: string;
  temperature?: string;
  workers?: string;
  machines?: string;
  materials?: string;
  workDone?: string;
  issues?: string;
  notes?: string;
  attachments?: RlcPdfAsset[];
  photos?: RlcPdfAsset[];
  files?: RlcPdfAsset[];
  company?: RlcPdfCompany;
};

export async function createTagesberichtPdf(
  input: TagesberichtPdfInput
): Promise<{ filePath: string; pdfUrl: string; fileName: string }> {
  const safeDate = rlcFirstText(input.date, new Date().toISOString().slice(0, 10)).slice(0, 10);
  const projectName = rlcFirstText(input.projectName, input.projectId);
  const assets = uniqueRlcAssets([
    ...(input.photos || []),
    ...(input.attachments || []),
    ...(input.files || []),
  ]);

  const pdf = createRlcPdfDocument({
    pdfPath: input.pdfPath,
    title: "Tagesbericht",
    documentType: "Tagesbericht",
    projectId: input.projectId,
    projectName,
    date: safeDate,
    company: input.company,
    subject: `Tagesbericht ${safeDate}`,
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
  drawRlcInfoField(doc, x0 + (quarter + gap) * 2, y, quarter, "Wetter", rlcFirstText(input.weather));
  drawRlcInfoField(
    doc,
    x0 + (quarter + gap) * 3,
    y,
    quarter,
    "Temperatur",
    rlcFirstText(input.temperature)
  );
  y += 62;

  const half = (width - gap) / 2;
  drawRlcInfoField(doc, x0, y, half, "Mitarbeiter", rlcFirstText(input.workers), 62);
  drawRlcInfoField(doc, x0 + half + gap, y, half, "Maschinen", rlcFirstText(input.machines), 62);
  y += 72;

  if (rlcFirstText(input.materials)) {
    y = drawRlcTextPanel(runtime, "Materialien", rlcFirstText(input.materials), y, {
      minHeight: 58,
      maxHeight: 120,
    });
  }

  y = drawRlcTextPanel(runtime, "Ausgeführte Arbeiten", rlcFirstText(input.workDone), y, {
    minHeight: 100,
    maxHeight: 230,
  });

  if (rlcFirstText(input.issues)) {
    y = drawRlcTextPanel(
      runtime,
      "Störungen und besondere Vorkommnisse",
      rlcFirstText(input.issues),
      y,
      { minHeight: 72, maxHeight: 180 }
    );
  }

  if (rlcFirstText(input.notes)) {
    y = drawRlcTextPanel(runtime, "Notizen", rlcFirstText(input.notes), y, {
      minHeight: 62,
      maxHeight: 170,
    });
  }

  y = drawRlcSignatureSection(runtime, y, ["Aufgestellt durch", "Bauleitung / Auftraggeber"]);
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

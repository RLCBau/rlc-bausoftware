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
  type RlcPdfAsset,
  type RlcPdfCompany,
} from "./rlcPdfCore";
import {
  drawRlcPhotoDocumentation,
  drawRlcSignatureSection,
  drawRlcTextPanel,
  uniqueRlcAssets,
} from "./rlcDocumentBlocks";

export type BautagebuchReport = {
  id?: string;
  sourceDocId?: string;
  date?: string;
  datum?: string;
  weather?: string;
  wetter?: string;
  temperature?: string;
  temperatur?: string;
  workers?: string;
  mitarbeiter?: string;
  machines?: string;
  maschinen?: string;
  materials?: string;
  materialien?: string;
  material?: string;
  workDone?: string;
  arbeiten?: string;
  taetigkeit?: string;
  issues?: string;
  vorkommnisse?: string;
  notes?: string;
  notizen?: string;
  lines?: any[];
  rows?: any[];
  attachments?: RlcPdfAsset[];
  photos?: RlcPdfAsset[];
  files?: RlcPdfAsset[];
  [key: string]: any;
};

export type BautagebuchPdfInput = {
  pdfPath: string;
  projectId: string;
  projectName?: string;
  period?: string;
  reports: BautagebuchReport[];
  company?: RlcPdfCompany;
};

function dateOf(report: BautagebuchReport): string {
  return rlcFirstText(report.date, report.datum).slice(0, 10);
}

function linesOf(report: BautagebuchReport): any[] {
  if (Array.isArray(report.lines)) return report.lines;
  if (Array.isArray(report.rows)) return report.rows;
  return [];
}

function hoursOf(report: BautagebuchReport): number {
  return linesOf(report).reduce(
    (sum, line) => sum + Number(line?.stunden || line?.hours || 0),
    0,
  );
}

function linesText(report: BautagebuchReport): string {
  const lines = linesOf(report);
  if (!lines.length) return "";

  return lines
    .map((line, index) => {
      const time = [line?.von, line?.bis].filter(Boolean).join("–");
      const values = [
        time,
        rlcFirstText(line?.mitarbeiter, line?.worker),
        rlcFirstText(line?.maschine, line?.machine),
        rlcFirstText(line?.ort, line?.location),
        rlcFirstText(line?.taetigkeit, line?.activity, line?.notiz),
        Number(line?.stunden || line?.hours || 0)
          ? `${rlcGermanNumber(line?.stunden || line?.hours)} Std.`
          : "",
      ].filter(Boolean);

      return `${index + 1}. ${values.join(" · ")}`;
    })
    .join("\n");
}

function assetsOf(report: BautagebuchReport): RlcPdfAsset[] {
  return uniqueRlcAssets([
    ...(Array.isArray(report.photos) ? report.photos : []),
    ...(Array.isArray(report.attachments) ? report.attachments : []),
    ...(Array.isArray(report.files) ? report.files : []),
  ]);
}

function groupReports(reports: BautagebuchReport[]) {
  const groups = new Map<string, BautagebuchReport[]>();

  for (const report of reports) {
    const date = dateOf(report) || "Ohne Datum";
    const current = groups.get(date) || [];
    current.push(report);
    groups.set(date, current);
  }

  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
}

export async function createBautagebuchPdf(
  input: BautagebuchPdfInput,
): Promise<{ filePath: string; pdfUrl: string; fileName: string }> {
  const reports = [...(input.reports || [])].sort((a, b) =>
    dateOf(a).localeCompare(dateOf(b)),
  );

  if (!reports.length) {
    throw new Error("Keine Tagesberichte für das Bautagebuch vorhanden.");
  }

  const dates = reports.map(dateOf).filter(Boolean).sort();
  const firstDate = dates[0] || new Date().toISOString().slice(0, 10);
  const lastDate = dates[dates.length - 1] || firstDate;
  const period = rlcFirstText(
    input.period,
    firstDate === lastDate
      ? rlcGermanDate(firstDate)
      : `${rlcGermanDate(firstDate)} – ${rlcGermanDate(lastDate)}`,
  );
  const projectName = rlcFirstText(input.projectName, input.projectId);
  const totalHours = reports.reduce((sum, report) => sum + hoursOf(report), 0);
  const issueCount = reports.filter((report) =>
    rlcFirstText(report.issues, report.vorkommnisse),
  ).length;
  const photoCount = reports.reduce(
    (sum, report) => sum + assetsOf(report).length,
    0,
  );

  const pdf = createRlcPdfDocument({
    pdfPath: input.pdfPath,
    title: "Bautagebuch",
    documentType: "Bautagebuch",
    projectId: input.projectId,
    projectName,
    date: lastDate,
    company: input.company,
    subject: `Bautagebuch ${period}`,
  });

  const { doc } = pdf;
  const runtime = {
    doc,
    addPage: pdf.addPage,
    contentBottom: pdf.contentBottom,
  };
  const x0 = RLC_PDF_THEME.marginX;
  const width = doc.page.width - x0 * 2;
  const gap = 8;
  const quarter = (width - gap * 3) / 4;
  let y = pdf.startCurrentPage();

  drawRlcInfoField(doc, x0, y, quarter, "Projekt", projectName);
  drawRlcInfoField(doc, x0 + quarter + gap, y, quarter, "Zeitraum", period);
  drawRlcInfoField(
    doc,
    x0 + (quarter + gap) * 2,
    y,
    quarter,
    "Tagesberichte",
    String(reports.length),
  );
  drawRlcInfoField(
    doc,
    x0 + (quarter + gap) * 3,
    y,
    quarter,
    "Gesamtstunden",
    rlcGermanNumber(totalHours),
  );
  y += 62;

  const third = (width - gap * 2) / 3;
  drawRlcInfoField(doc, x0, y, third, "Tage", String(new Set(dates).size));
  drawRlcInfoField(
    doc,
    x0 + third + gap,
    y,
    third,
    "Vorkommnisse",
    String(issueCount),
  );
  drawRlcInfoField(
    doc,
    x0 + (third + gap) * 2,
    y,
    third,
    "Fotos / Anhänge",
    String(photoCount),
  );
  y += 70;

  y = drawRlcTextPanel(
    runtime,
    "Inhalt des Bautagebuchs",
    "Chronologische Zusammenstellung sämtlicher Tagesberichte im ausgewählten Zeitraum. Die nachfolgenden Einträge enthalten Personal, Arbeitszeiten, Maschinen, Materialien, ausgeführte Arbeiten, Vorkommnisse, Notizen und Fotodokumentation.",
    y,
    { minHeight: 76, maxHeight: 110 },
  );

  const groups = groupReports(reports);

  for (const [date, dateReports] of groups) {
    y = pdf.addPage();
    y = drawRlcSectionTitle(doc, `Baustellentag · ${rlcGermanDate(date)}`, y);

    const dayHours = dateReports.reduce(
      (sum, report) => sum + hoursOf(report),
      0,
    );
    const half = (width - gap) / 2;
    drawRlcInfoField(doc, x0, y, half, "Tagesberichte", String(dateReports.length));
    drawRlcInfoField(
      doc,
      x0 + half + gap,
      y,
      half,
      "Gesamtstunden",
      rlcGermanNumber(dayHours),
    );
    y += 62;

    for (let index = 0; index < dateReports.length; index++) {
      const report = dateReports[index];
      if (y + 150 > pdf.contentBottom()) y = pdf.addPage();

      drawRlcRoundedBox(
        doc,
        x0,
        y,
        width,
        34,
        RLC_PDF_THEME.blueSoft,
        RLC_PDF_THEME.line,
        7,
      );
      doc
        .fillColor(RLC_PDF_THEME.blueDark)
        .font("Helvetica-Bold")
        .fontSize(11)
        .text(`Tagesbericht ${index + 1}`, x0 + 10, y + 10, {
          width: width - 20,
          lineBreak: false,
        });
      y += 44;

      const reportQuarter = (width - gap * 3) / 4;
      drawRlcInfoField(
        doc,
        x0,
        y,
        reportQuarter,
        "Wetter",
        rlcFirstText(report.weather, report.wetter),
      );
      drawRlcInfoField(
        doc,
        x0 + reportQuarter + gap,
        y,
        reportQuarter,
        "Temperatur",
        rlcFirstText(report.temperature, report.temperatur),
      );
      drawRlcInfoField(
        doc,
        x0 + (reportQuarter + gap) * 2,
        y,
        reportQuarter,
        "Mitarbeiter",
        rlcFirstText(report.workers, report.mitarbeiter),
      );
      drawRlcInfoField(
        doc,
        x0 + (reportQuarter + gap) * 3,
        y,
        reportQuarter,
        "Stunden",
        rlcGermanNumber(hoursOf(report)),
      );
      y += 62;

      const machines = rlcFirstText(report.machines, report.maschinen);
      const materials = rlcFirstText(
        report.materials,
        report.materialien,
        report.material,
      );
      if (machines || materials) {
        const halfWidth = (width - gap) / 2;
        drawRlcInfoField(doc, x0, y, halfWidth, "Maschinen", machines, 58);
        drawRlcInfoField(
          doc,
          x0 + halfWidth + gap,
          y,
          halfWidth,
          "Materialien",
          materials,
          58,
        );
        y += 68;
      }

      y = drawRlcTextPanel(
        runtime,
        "Ausgeführte Arbeiten",
        rlcFirstText(
          report.workDone,
          report.arbeiten,
          report.taetigkeit,
        ),
        y,
        { minHeight: 70, maxHeight: 190 },
      );

      const lineSummary = linesText(report);
      if (lineSummary) {
        y = drawRlcTextPanel(runtime, "Tageszeilen", lineSummary, y, {
          minHeight: 68,
          maxHeight: 220,
        });
      }

      const issues = rlcFirstText(report.issues, report.vorkommnisse);
      if (issues) {
        y = drawRlcTextPanel(runtime, "Vorkommnisse / Behinderungen", issues, y, {
          minHeight: 64,
          maxHeight: 170,
        });
      }

      const notes = rlcFirstText(report.notes, report.notizen);
      if (notes) {
        y = drawRlcTextPanel(runtime, "Notizen", notes, y, {
          minHeight: 58,
          maxHeight: 150,
        });
      }

      const assets = assetsOf(report);
      if (assets.length) {
        y = drawRlcPhotoDocumentation(
          runtime,
          input.pdfPath,
          assets,
          y,
          `Fotodokumentation · ${rlcGermanDate(date)} · Tagesbericht ${index + 1}`,
        );
      }

      y += 8;
    }
  }

  y = drawRlcSignatureSection(runtime, y, [
    "Bautagebuch geführt durch",
    "Bauleitung / Auftraggeber",
  ]);

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

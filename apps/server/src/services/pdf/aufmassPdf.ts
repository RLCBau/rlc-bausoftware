import {
  createRlcPdfDocument,
  drawRlcInfoField,
  drawRlcSectionTitle,
  RLC_PDF_THEME,
  type RlcPdfCompany,
} from "./rlcPdfCore";

export type CreateAufmassPdfInput = {
  pdfPath: string;
  projectId?: string;
  projectName?: string;
  title?: string;
  date?: string;
  company?: RlcPdfCompany;
  data?: any;
  payload?: any;
  document?: any;
};

function s(value: unknown): string {
  return String(value ?? "").trim();
}

function germanNumber(value: unknown): string {
  const number = Number(value ?? 0);

  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(Number.isFinite(number) ? number : 0);
}

export async function createAufmassPdf(input: CreateAufmassPdfInput) {
  const source = input.data || input.payload || input.document || {};

  const projectId = s(
    input.projectId ||
    source.projectId ||
    source.projectKey ||
    source.project?.id ||
    source.project?.code ||
    "Projekt"
  );

  const projectName = s(
    input.projectName ||
    source.projectName ||
    source.projectTitle ||
    source.project?.name ||
    projectId
  );

  const date = s(
    input.date ||
    source.date ||
    source.datum ||
    source.options?.dateISO ||
    new Date().toISOString().slice(0, 10)
  ).slice(0, 10);

  const rows = Array.isArray(source.rows)
    ? source.rows
    : Array.isArray(source.lines)
      ? source.lines
      : Array.isArray(source.aufmass)
        ? source.aufmass
        : Array.isArray(source.entries)
          ? source.entries
          : [];

  const pdf = createRlcPdfDocument({
    pdfPath: input.pdfPath,
    title: "Aufma?blatt",
    documentType: "Aufma?",
    projectId,
    projectName,
    date,
    company: input.company || source.company,
    subject: `Aufma? ${projectId}`,
  });

  const { doc } = pdf;

  let y = pdf.startCurrentPage();

  const marginX = RLC_PDF_THEME.marginX;
  const contentWidth = doc.page.width - marginX * 2;
  const gap = 8;
  const fieldWidth = (contentWidth - gap * 3) / 4;

  drawRlcInfoField(doc, marginX, y, fieldWidth, "Projekt", projectId);

  drawRlcInfoField(
    doc,
    marginX + fieldWidth + gap,
    y,
    fieldWidth,
    "Bezeichnung",
    projectName
  );

  drawRlcInfoField(
    doc,
    marginX + (fieldWidth + gap) * 2,
    y,
    fieldWidth,
    "Ort",
    s(source.ort || source.location || source.ortName) || "?"
  );

  drawRlcInfoField(
    doc,
    marginX + (fieldWidth + gap) * 3,
    y,
    fieldWidth,
    "Zeilen",
    String(rows.length)
  );

  y += 64;
  y = drawRlcSectionTitle(doc, "Aufma?zeilen", y);

  const columns = [
    { label: "Kreis", x: 34, width: 34 },
    { label: "Blatt", x: 72, width: 38 },
    { label: "Nr.", x: 114, width: 32 },
    { label: "REB", x: 150, width: 34 },
    { label: "Pos.", x: 188, width: 54 },
    { label: "Bezeichnung / Rechenansatz", x: 246, width: 190 },
    { label: "Menge", x: 440, width: 58, align: "right" as const },
    { label: "ME", x: 502, width: 59 },
  ];

  function drawHeader() {
    if (y > pdf.contentBottom() - 44) {
      y = pdf.addPage();
    }

    doc
      .roundedRect(marginX, y, contentWidth, 24, 4)
      .fill(RLC_PDF_THEME.blueSoft);

    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor(RLC_PDF_THEME.blueDark);

    for (const column of columns) {
      doc.text(column.label, column.x, y + 8, {
        width: column.width,
        align: column.align || "left",
      });
    }

    y += 30;
  }

  drawHeader();

  for (const row of rows) {
    const description = [
      s(row.kurztext || row.bezeichnung || row.text),
      s(row.langtext),
      s(row.rechenansatz || row.formula || row.formel),
    ]
      .filter(Boolean)
      .join("\n");

    const rowHeight = Math.max(
      27,
      doc.heightOfString(description || "?", {
        width: 184,
        lineGap: 1,
      }) + 12
    );

    if (y + rowHeight > pdf.contentBottom()) {
      y = pdf.addPage();
      drawHeader();
    }

    const values = [
      s(row.kreis),
      s(row.blatt),
      s(row.nr || row.nummer),
      s(row.reb),
      s(row.posNr || row.position || row.pos),
      description || "?",
      germanNumber(
        row.ergebnis ??
        row.result ??
        row.menge ??
        row.ist
      ),
      s(row.einheit || row.unit),
    ];

    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(RLC_PDF_THEME.text);

    values.forEach((value, index) => {
      const column = columns[index];

      doc.text(value || "?", column.x, y + 5, {
        width: column.width,
        align: column.align || "left",
        lineGap: 1,
      });
    });

    doc
      .strokeColor(RLC_PDF_THEME.line)
      .lineWidth(0.35)
      .moveTo(marginX, y + rowHeight)
      .lineTo(marginX + contentWidth, y + rowHeight)
      .stroke();

    y += rowHeight + 4;
  }

  await pdf.finish();

  return {
    pdfPath: input.pdfPath,
    rowCount: rows.length,
  };
}

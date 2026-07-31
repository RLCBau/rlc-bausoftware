import {
  createRlcPdfDocument,
  drawRlcInfoField,
  drawRlcSectionTitle,
  RLC_PDF_THEME,
  type RlcPdfCompany,
} from "./rlcPdfCore";

export type KaufmaennischePdfInput = {
  pdfPath: string;
  projectId?: string;
  projectName?: string;
  title?: string;
  date?: string;
  documentId?: string;
  company?: RlcPdfCompany;
  data?: any;
  payload?: any;
  document?: any;
};

function s(value: unknown): string {
  return String(value ?? "").trim();
}

function n(value: unknown): number {
  const parsed = Number(
    typeof value === "string"
      ? value.replace(/\s/g, "").replace(/\./g, "").replace(",", ".")
      : value
  );

  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: unknown): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(n(value));
}

function number(value: unknown, digits = 3): string {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(n(value));
}

function array(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function resolveRows(source: any): any[] {
  return (
    array(source?.rows).length
      ? array(source.rows)
      : array(source?.items).length
        ? array(source.items)
        : array(source?.positions).length
          ? array(source.positions)
          : array(source?.lines).length
            ? array(source.lines)
            : array(source?.data?.rows)
  );
}

function resolveDocumentType(input: KaufmaennischePdfInput): string {
  const source = input.data || input.payload || input.document || {};
  const raw = s(
    source.documentType ||
    source.type ||
    source.art ||
    input.title
  ).toLowerCase();

  if (raw.includes("schluss")) return "Schlussrechnung";
  if (raw.includes("abschlag")) return "Abschlagsrechnung";
  if (raw.includes("angebot")) return "Angebot";
  if (raw.includes("menge")) return "Mengenermittlung";
  if (raw.includes("rechnung")) return "Rechnung";

  return input.title || "Dokument";
}

export async function createKaufmaennischesDokumentPdf(
  input: KaufmaennischePdfInput
) {
  const source = input.data || input.payload || input.document || {};
  const project = source.project || {};

  const documentType = resolveDocumentType(input);

  const projectId = s(
    input.projectId ||
    source.projectId ||
    source.projectKey ||
    project.id ||
    project.code ||
    "Projekt"
  );

  const projectName = s(
    input.projectName ||
    source.projectName ||
    source.projectTitle ||
    project.name ||
    project.title ||
    projectId
  );

  const clientName = s(
    source.clientName ||
    source.auftraggeber ||
    source.client?.name ||
    project.client ||
    project.auftraggeber
  );

  const date = s(
    input.date ||
    source.date ||
    source.datum ||
    source.options?.dateISO ||
    new Date().toISOString().slice(0, 10)
  ).slice(0, 10);

  const documentNumber = s(
    input.documentId ||
    source.documentId ||
    source.number ||
    source.nr ||
    source.offerNo ||
    source.angebotNr ||
    source.rechnungNr
  );

  const rows = resolveRows(source);
  const totals = source.totals || source.summary || {};

  const pdf = createRlcPdfDocument({
    pdfPath: input.pdfPath,
    title: documentType,
    documentType,
    projectId,
    projectName,
    date,
    company: input.company || source.company,
    subject: `${documentType} ${projectId}`,
  });

  const { doc } = pdf;

  let y = pdf.startCurrentPage();

  const marginX = RLC_PDF_THEME.marginX;
  const contentWidth = doc.page.width - marginX * 2;
  const gap = 8;
  const fieldWidth = (contentWidth - gap * 3) / 4;

  drawRlcInfoField(
    doc,
    marginX,
    y,
    fieldWidth,
    documentType === "Angebot" ? "Angebot Nr." : "Dokument Nr.",
    documentNumber || "?"
  );

  drawRlcInfoField(
    doc,
    marginX + fieldWidth + gap,
    y,
    fieldWidth,
    "Projekt",
    projectId
  );

  drawRlcInfoField(
    doc,
    marginX + (fieldWidth + gap) * 2,
    y,
    fieldWidth,
    "Auftraggeber",
    clientName || "?"
  );

  drawRlcInfoField(
    doc,
    marginX + (fieldWidth + gap) * 3,
    y,
    fieldWidth,
    "Datum",
    date
  );

  y += 64;

  y = drawRlcSectionTitle(
    doc,
    documentType === "Mengenermittlung"
      ? "Ermittelte Mengen"
      : "Leistungspositionen",
    y
  );

  const columns =
    documentType === "Mengenermittlung"
      ? [
          { label: "Pos.", x: 34, width: 60 },
          { label: "Leistungsbeschreibung", x: 98, width: 282 },
          { label: "ME", x: 384, width: 38 },
          { label: "Menge", x: 426, width: 70, align: "right" as const },
          { label: "Faktor", x: 500, width: 61, align: "right" as const },
        ]
      : [
          { label: "Pos.", x: 34, width: 54 },
          { label: "Leistungsbeschreibung", x: 92, width: 235 },
          { label: "ME", x: 331, width: 32 },
          { label: "Menge", x: 367, width: 52, align: "right" as const },
          { label: "EP", x: 423, width: 62, align: "right" as const },
          { label: "Gesamt", x: 489, width: 72, align: "right" as const },
        ];

  function drawTableHeader() {
    if (y > pdf.contentBottom() - 45) {
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

  drawTableHeader();

  let calculatedNet = 0;

  for (const row of rows) {
    const position = s(
      row.posNr ||
      row.lvPos ||
      row.position ||
      row.pos ||
      row.nr
    );

    const description = [
      s(row.kurztext || row.text || row.title || row.bezeichnung),
      s(row.langtext),
      s(row.rechenansatz || row.formula || row.formel),
    ]
      .filter(Boolean)
      .join("\n");

    const unit = s(row.einheit || row.unit || row.me);
    const qty = n(
      row.menge ??
      row.qty ??
      row.quantity ??
      row.ergebnis ??
      row.result ??
      row.ist
    );

    const factor = n(row.faktor ?? row.factor ?? 1) || 1;

    const ep = n(
      row.finalUnitPrice ??
      row.rlcKiUnitPrice ??
      row.preis ??
      row.ep ??
      row.unitPrice
    );

    const total = n(
      row.gesamt ??
      row.total ??
      row.zeilen ??
      row.rlcKiTotal ??
      qty * ep
    );

    calculatedNet += total;

    const descriptionWidth =
      documentType === "Mengenermittlung" ? 274 : 225;

    const rowHeight = Math.max(
      28,
      doc.heightOfString(description || "?", {
        width: descriptionWidth,
        lineGap: 1,
      }) + 12
    );

    if (y + rowHeight > pdf.contentBottom()) {
      y = pdf.addPage();
      drawTableHeader();
    }

    doc
      .font("Helvetica")
      .fontSize(7.6)
      .fillColor(RLC_PDF_THEME.text);

    const values =
      documentType === "Mengenermittlung"
        ? [
            position || "?",
            description || "?",
            unit || "?",
            number(qty),
            number(factor),
          ]
        : [
            position || "?",
            description || "?",
            unit || "?",
            number(qty),
            money(ep),
            money(total),
          ];

    values.forEach((value, index) => {
      const column = columns[index];

      doc.text(value, column.x, y + 5, {
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

  if (documentType !== "Mengenermittlung") {
    const netto = n(
      totals.netto ??
      totals.totalNet ??
      totals.summeNetto ??
      source.netto ??
      calculatedNet
    );

    const mwstRate = n(
      totals.mwstRate ??
      source.mwstRate ??
      source.mwst ??
      source.options?.mwst ??
      19
    );

    const tax = n(
      totals.steuer ??
      totals.tax ??
      totals.mwst ??
      netto * mwstRate / 100
    );

    const brutto = n(
      totals.brutto ??
      totals.totalGross ??
      source.brutto ??
      netto + tax
    );

    if (y > pdf.contentBottom() - 130) {
      y = pdf.addPage();
    }

    y = drawRlcSectionTitle(doc, "Summen", y);

    const sumWidth = (contentWidth - gap * 2) / 3;

    drawRlcInfoField(
      doc,
      marginX,
      y,
      sumWidth,
      "Netto",
      money(netto)
    );

    drawRlcInfoField(
      doc,
      marginX + sumWidth + gap,
      y,
      sumWidth,
      `MwSt. ${number(mwstRate, 2)} %`,
      money(tax)
    );

    drawRlcInfoField(
      doc,
      marginX + (sumWidth + gap) * 2,
      y,
      sumWidth,
      "Brutto",
      money(brutto)
    );

    y += 70;

    const paymentText = s(
      source.payment ||
      source.zahlungsbedingungen ||
      source.options?.payment
    );

    if (paymentText) {
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(RLC_PDF_THEME.text)
        .text(paymentText, marginX, y, {
          width: contentWidth,
        });
    }
  }

  await pdf.finish();

  return {
    pdfPath: input.pdfPath,
    rowCount: rows.length,
    documentType,
  };
}

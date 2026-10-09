import fs from "fs";
import path from "path";
import {
  RLC_PDF_THEME,
  createRlcPdfDocument,
  drawRlcInfoField,
  drawRlcSectionTitle,
  resolveRlcPdfPathContext,
  rlcFirstText,
  rlcGermanDate,
} from "./rlcPdfCore";
import {
  drawRlcTextPanel,
} from "./rlcDocumentBlocks";

export type HandoverPdfItem = {
  text?: string;
  status?: string;
  note?: string | null;
};

export type HandoverPdfSignature = {
  role?: string;
  name?: string | null;
  signedAt?: Date | string | null;
  imageData?: string | null;
};

export type HandoverPdfInput = {
  pdfPath: string;
  projectId: string;
  title?: string;
  client?: string | null;
  address?: string | null;
  date?: Date | string | null;
  status?: string;
  notes?: string | null;
  items?: HandoverPdfItem[];
  signatures?: HandoverPdfSignature[];
  legalMeta?: any;
};

function statusLabel(value?: string) {
  switch (String(value || "").toUpperCase()) {
    case "OK":
      return "Erledigt";
    case "MANGEL":
      return "Mangel";
    case "OPEN":
      return "Offen";
    case "ABGESCHLOSSEN":
      return "Abgeschlossen";
    case "ABGELEHNT":
      return "Abgelehnt";
    case "IM_GANGE":
      return "Im Gange";
    default:
      return "Entwurf";
  }
}

function signatureBuffer(dataUrl?: string | null) {
  const value = String(dataUrl || "");
  const match = value.match(/^data:image\/[^;]+;base64,(.+)$/i);

  if (!match) return null;

  try {
    return Buffer.from(match[1], "base64");
  } catch {
    return null;
  }
}

export async function createHandoverPdf(
  input: HandoverPdfInput
): Promise<{ filePath: string; pdfUrl: string; fileName: string }> {
  fs.mkdirSync(path.dirname(input.pdfPath), {
    recursive: true,
  });

  const safeDate = input.date
    ? new Date(input.date).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const pdf = createRlcPdfDocument({
    pdfPath: input.pdfPath,
    title: "Übergabe & Abnahme",
    documentType: "Übergabe / Abnahme",
    projectId: input.projectId,
    projectName: input.projectId,
    date: safeDate,
    subject: rlcFirstText(input.title, "Abnahme"),
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

  let y = pdf.startCurrentPage();

  const quarter = (width - gap * 3) / 4;

  drawRlcInfoField(
    doc,
    x0,
    y,
    quarter,
    "Datum",
    rlcGermanDate(safeDate)
  );

  drawRlcInfoField(
    doc,
    x0 + quarter + gap,
    y,
    quarter,
    "Projekt",
    input.projectId
  );

  drawRlcInfoField(
    doc,
    x0 + (quarter + gap) * 2,
    y,
    quarter,
    "Status",
    statusLabel(input.status)
  );

  drawRlcInfoField(
    doc,
    x0 + (quarter + gap) * 3,
    y,
    quarter,
    "Punkte",
    String(input.items?.length || 0)
  );

  y += 62;

  const half = (width - gap) / 2;

  drawRlcInfoField(
    doc,
    x0,
    y,
    half,
    "Auftraggeber",
    rlcFirstText(input.client),
    58
  );

  drawRlcInfoField(
    doc,
    x0 + half + gap,
    y,
    half,
    "Adresse / Ort",
    rlcFirstText(input.address),
    58
  );

  y += 70;

  y = drawRlcTextPanel(
    runtime,
    "Übergabe / Abnahme",
    rlcFirstText(input.title, "Abnahme"),
    y,
    {
      minHeight: 52,
      maxHeight: 100,
    }
  );

  if (input.legalMeta) {
    const m=input.legalMeta||{};
    const basis=String(m.contractBasis||"—").replace("VOBB","VOB/B");
    const typeLabels:any={EXPRESS:"Ausdrückliche Abnahme",FORMAL:"Förmliche Abnahme",FICTITIOUS_BGB:"Fiktive Abnahme nach BGB",FICTITIOUS_VOB_COMPLETION:"Fiktive Abnahme nach Fertigstellungsmitteilung",FICTITIOUS_VOB_USE:"Fiktive Abnahme nach Benutzung",REFUSED:"Abnahme verweigert",CONDITION_ASSESSMENT:"Zustandsfeststellung",PARTIAL:"Teilabnahme"};
    const legalText=[`Vertragsgrundlage: ${basis}`,`Art: ${typeLabels[m.acceptanceType]||m.acceptanceType||"—"}`,m.knownDefectsReserved?`Mängelrechte vorbehalten: ${m.defectRightsReservedText||"ja"}`:"",m.contractualPenaltyReserved?"Vertragsstrafe vorbehalten":"",m.refusalReason?`Verweigerungsgrund: ${m.refusalReason}`:"",m.contractorObjections?`Einwendungen Auftragnehmer: ${m.contractorObjections}`:"",m.partialAcceptanceScope?`Umfang Teilabnahme: ${m.partialAcceptanceScope}`:"",m.legalNote?`Hinweis: ${m.legalNote}`:""].filter(Boolean).join("\n");
    y = drawRlcTextPanel(runtime,"Rechtsgrundlage / Abnahmeart",legalText,y,{minHeight:70,maxHeight:190});
  }

  y = drawRlcSectionTitle(
    doc,
    "Checkliste / Mängel",
    y
  );

  const items = input.items || [];

  if (!items.length) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(RLC_PDF_THEME.muted)
      .text(
        "Keine Abnahmepunkte vorhanden.",
        x0,
        y,
        { width }
      );

    y += 28;
  } else {
    for (let index = 0; index < items.length; index++) {
      const item = items[index];

      if (y > pdf.contentBottom() - 70) {
        pdf.addPage();
        y = pdf.startCurrentPage();

        y = drawRlcSectionTitle(
          doc,
          "Checkliste / Mängel",
          y
        );
      }

      const rowHeight = item.note ? 52 : 38;

      doc
        .roundedRect(
          x0,
          y,
          width,
          rowHeight,
          5
        )
        .fillAndStroke(
          "#F8FAFC",
          "#DCE5F0"
        );

      doc
        .fillColor(RLC_PDF_THEME.blueDark)
        .font("Helvetica-Bold")
        .fontSize(8)
        .text(
          `${index + 1}. ${statusLabel(item.status)}`,
          x0 + 8,
          y + 8,
          {
            width: 90,
          }
        );

      doc
        .fillColor("#172033")
        .font("Helvetica")
        .fontSize(9)
        .text(
          rlcFirstText(item.text),
          x0 + 105,
          y + 8,
          {
            width: width - 113,
          }
        );

      if (item.note) {
        doc
          .fillColor(RLC_PDF_THEME.muted)
          .font("Helvetica")
          .fontSize(8)
          .text(
            `Bemerkung: ${item.note}`,
            x0 + 105,
            y + 27,
            {
              width: width - 113,
            }
          );
      }

      y += rowHeight + 6;
    }
  }

  if (input.notes) {
    y = drawRlcTextPanel(
      runtime,
      "Abschlussbemerkungen",
      input.notes,
      y,
      {
        minHeight: 70,
        maxHeight: 180,
      }
    );
  }

  if (y > pdf.contentBottom() - 180) {
    pdf.addPage();
    y = pdf.startCurrentPage();
  }

  y = drawRlcSectionTitle(
    doc,
    "Unterschriften",
    y
  );

  const signatures = input.signatures || [];

  const contractor = signatures.find(
    (s) =>
      String(s.role).toUpperCase() ===
      "AUFTRAGNEHMER"
  );

  const client = signatures.find(
    (s) =>
      String(s.role).toUpperCase() ===
      "AUFTRAGGEBER"
  );

  const signatureWidth = (width - gap) / 2;

  for (const entry of [
    {
      x: x0,
      title: "Auftragnehmer",
      signature: contractor,
    },
    {
      x: x0 + signatureWidth + gap,
      title: "Auftraggeber",
      signature: client,
    },
  ]) {
    doc
      .roundedRect(
        entry.x,
        y,
        signatureWidth,
        120,
        6
      )
      .stroke("#DCE5F0");

    doc
      .fillColor(RLC_PDF_THEME.blueDark)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(
        entry.title,
        entry.x + 10,
        y + 10,
        {
          width: signatureWidth - 20,
        }
      );

    if (entry.signature) {
      const image = signatureBuffer(
        entry.signature.imageData
      );

      if (image) {
        try {
          doc.image(
            image,
            entry.x + 12,
            y + 30,
            {
              fit: [
                signatureWidth - 24,
                52,
              ],
              align: "center",
            }
          );
        } catch {
        }
      }

      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#172033")
        .text(
          rlcFirstText(
            entry.signature.name,
            "Unterschrieben"
          ),
          entry.x + 10,
          y + 88,
          {
            width: signatureWidth - 20,
          }
        );

      if (entry.signature.signedAt) {
        doc
          .fontSize(7.5)
          .fillColor(RLC_PDF_THEME.muted)
          .text(
            rlcGermanDate(
              String(
                entry.signature.signedAt
              )
            ),
            entry.x + 10,
            y + 103,
            {
              width: signatureWidth - 20,
            }
          );
      }
    } else {
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(RLC_PDF_THEME.muted)
        .text(
          "Nicht unterschrieben",
          entry.x + 10,
          y + 55,
          {
            width: signatureWidth - 20,
            align: "center",
          }
        );
    }
  }

  await pdf.finish();

  const fileName =
    path.basename(input.pdfPath);

  const context =
    resolveRlcPdfPathContext(
      input.pdfPath
    );

  const relative = path
    .relative(
      context.projectRoot,
      input.pdfPath
    )
    .split(path.sep)
    .map(encodeURIComponent)
    .join("/");

  const pdfUrl =
    `/projects/${encodeURIComponent(
      context.projectKey
    )}/${relative}`;

  return {
    filePath: input.pdfPath,
    pdfUrl,
    fileName,
  };
}
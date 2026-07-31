import AdmZip from "adm-zip";
import ExcelJS from "exceljs";
import path from "path";
import {
  RLC_PDF_THEME,
  createRlcPdfDocument,
  drawRlcSectionTitle,
  type RlcPdfCompany,
} from "./pdf/rlcPdfCore";

export type VorlageValueMap = Record<string, string | number | boolean | null | undefined>;

export function flattenVorlageValues(
  input: Record<string, unknown> | null | undefined,
  prefix = "",
  output: VorlageValueMap = {}
): VorlageValueMap {
  if (!input || typeof input !== "object") return output;

  for (const [key, value] of Object.entries(input)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flattenVorlageValues(value as Record<string, unknown>, fullKey, output);
    } else {
      output[fullKey] = value as string | number | boolean | null | undefined;
    }
  }

  return output;
}

export function compileVorlageText(
  content: unknown,
  values: VorlageValueMap
): string {
  const source =
    typeof content === "string"
      ? content
      : content && typeof content === "object" && "text" in content
        ? String((content as { text?: unknown }).text ?? "")
        : String(content ?? "");

  return source.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, rawKey: string) => {
    const key = String(rawKey).trim();
    const direct = values[key];
    if (direct !== undefined && direct !== null && String(direct).trim()) {
      return String(direct);
    }

    const caseInsensitiveKey = Object.keys(values).find(
      (candidate) => candidate.toLowerCase() === key.toLowerCase()
    );
    const fallback = caseInsensitiveKey ? values[caseInsensitiveKey] : undefined;
    return fallback !== undefined && fallback !== null && String(fallback).trim()
      ? String(fallback)
      : `{{${key}}}`;
  });
}

export async function createVorlagePdf(input: {
  pdfPath: string;
  title: string;
  content: string;
  projectId?: string;
  projectName?: string;
  company?: RlcPdfCompany;
}): Promise<void> {
  const pdf = createRlcPdfDocument({
    pdfPath: input.pdfPath,
    title: input.title,
    documentType: "Vorlagen-Center",
    projectId: input.projectId,
    projectName: input.projectName,
    date: new Date().toISOString().slice(0, 10),
    company: input.company,
    subject: input.title,
  });

  const { doc } = pdf;
  const width = doc.page.width - RLC_PDF_THEME.marginX * 2;
  let y = pdf.startCurrentPage();

  const ensureSpace = (height: number) => {
    if (y + height > pdf.contentBottom()) y = pdf.addPage();
  };

  const lines = input.content.replace(/\r\n/g, "\n").split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      y += 6;
      continue;
    }

    if (line.startsWith("# ")) {
      ensureSpace(36);
      doc
        .fillColor(RLC_PDF_THEME.blueDark)
        .font("Helvetica-Bold")
        .fontSize(15)
        .text(line.slice(2), RLC_PDF_THEME.marginX, y, { width });
      y += doc.heightOfString(line.slice(2), { width }) + 12;
      continue;
    }

    if (line.startsWith("## ")) {
      ensureSpace(42);
      y = drawRlcSectionTitle(doc, line.slice(3), y);
      continue;
    }

    const isCheck = line.startsWith("☐");
    const isNumbered = /^\d+\.\s/.test(line);
    const text = isCheck ? `□${line.slice(1)}` : line;
    const font = isNumbered ? "Helvetica-Bold" : "Helvetica";
    const fontSize = isNumbered ? 9.2 : 9;
    const lineHeight = doc.font(font).fontSize(fontSize).heightOfString(text, {
      width,
      lineGap: 2,
    });

    ensureSpace(lineHeight + 5);
    doc
      .fillColor(RLC_PDF_THEME.text)
      .font(font)
      .fontSize(fontSize)
      .text(text, RLC_PDF_THEME.marginX, y, {
        width,
        lineGap: 2,
      });
    y += lineHeight + 4;
  }

  await pdf.finish();
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function createVorlageDocx(title: string, content: string): Buffer {
  const zip = new AdmZip();
  const paragraphs = content.replace(/\r\n/g, "\n").split("\n").map((raw) => {
    const line = raw.trimEnd();
    const heading1 = line.startsWith("# ");
    const heading2 = line.startsWith("## ");
    const clean = heading1 ? line.slice(2) : heading2 ? line.slice(3) : line;
    const style = heading1
      ? '<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>'
      : heading2
        ? '<w:pPr><w:pStyle w:val="Heading2"/></w:pPr>'
        : "";
    return `<w:p>${style}<w:r><w:t xml:space="preserve">${xmlEscape(clean || " ")}</w:t></w:r></w:p>`;
  }).join("");

  zip.addFile(
    "[Content_Types].xml",
    Buffer.from(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
        "</Types>",
      "utf8"
    )
  );
  zip.addFile(
    "_rels/.rels",
    Buffer.from(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        "</Relationships>",
      "utf8"
    )
  );
  zip.addFile(
    "word/_rels/document.xml.rels",
    Buffer.from(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        "</Relationships>",
      "utf8"
    )
  );
  zip.addFile(
    "word/styles.xml",
    Buffer.from(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="20"/></w:rPr></w:style>' +
        '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:color w:val="0B2F7F"/><w:sz w:val="32"/></w:rPr></w:style>' +
        '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:color w:val="1546B8"/><w:sz w:val="24"/></w:rPr></w:style>' +
        "</w:styles>",
      "utf8"
    )
  );
  zip.addFile(
    "word/document.xml",
    Buffer.from(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        `<w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${xmlEscape(title)}</w:t></w:r></w:p>${paragraphs}` +
        '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>' +
        "</w:body></w:document>",
      "utf8"
    )
  );

  return zip.toBuffer();
}

export async function createVorlageXlsx(
  title: string,
  content: string,
  values: VorlageValueMap
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "RLC Bausoftware";
  workbook.created = new Date();

  const documentSheet = workbook.addWorksheet("Dokument");
  documentSheet.columns = [
    { header: "Abschnitt", key: "section", width: 28 },
    { header: "Inhalt", key: "content", width: 95 },
  ];
  documentSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  documentSheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1546B8" },
  };
  documentSheet.addRow({ section: "Dokument", content: title });

  let currentSection = "Inhalt";
  for (const rawLine of content.replace(/\r\n/g, "\n").split("\n")) {
    if (rawLine.startsWith("# ")) {
      currentSection = rawLine.slice(2);
      continue;
    }
    if (rawLine.startsWith("## ")) {
      currentSection = rawLine.slice(3);
      continue;
    }
    if (rawLine.trim()) documentSheet.addRow({ section: currentSection, content: rawLine });
  }
  documentSheet.eachRow((row) => {
    row.alignment = { vertical: "top", wrapText: true };
  });
  documentSheet.views = [{ state: "frozen", ySplit: 1 }];

  const fieldSheet = workbook.addWorksheet("Felder");
  fieldSheet.columns = [
    { header: "Feld", key: "field", width: 36 },
    { header: "Wert", key: "value", width: 70 },
  ];
  fieldSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  fieldSheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1546B8" },
  };
  Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right, "de"))
    .forEach(([field, value]) => fieldSheet.addRow({ field, value: String(value ?? "") }));
  fieldSheet.views = [{ state: "frozen", ySplit: 1 }];

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function safeVorlageFileName(title: string): string {
  const clean = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100);
  return clean || `RLC_Vorlage_${path.basename(String(Date.now()))}`;
}

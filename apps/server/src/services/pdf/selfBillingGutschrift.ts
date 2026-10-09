import fs from "fs";
import path from "path";
import {
  createRlcPdfDocument,
  drawRlcInfoField,
  drawRlcSectionTitle,
  RLC_PDF_THEME,
  type RlcPdfCompany,
} from "./rlcPdfCore";
import {
  buildXRechnungUbl,
  runKositXRechnungValidator,
  type XRechnungInvoice,
  type XRechnungParty,
} from "../xrechnung";

export type SelfBillingSupplier = XRechnungParty;

export type SelfBillingInput = {
  outputDir: string;
  projectId: string;
  projectName?: string;
  number: string;
  issueDate: string;
  dueDate: string;
  serviceDate: string;
  serviceDescription: string;
  netAmount: number;
  vatRate: number;
  supplier: SelfBillingSupplier;
  buyerCompany: RlcPdfCompany;
  buyerReference?: string;
  note?: string;
};

function s(value: any): string {
  return String(value ?? "").trim();
}

function money(value: any): string {
  const n = Number(value || 0);
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number.isFinite(n) ? n : 0);
}

function dateDe(value: any): string {
  const raw = s(value);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  const de = raw.match(/^\d{1,2}\.\d{1,2}\.\d{4}$/);
  return de ? raw : raw;
}

function safeName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").slice(0, 120);
}

function validate(input: SelfBillingInput): string[] {
  const errors: string[] = [];
  if (!s(input.number)) errors.push("Gutschriftnummer fehlt");
  if (!s(input.issueDate)) errors.push("Ausstellungsdatum fehlt");
  if (!s(input.serviceDate)) errors.push("Leistungsdatum fehlt");
  if (!s(input.serviceDescription)) errors.push("Leistungsbeschreibung fehlt");
  if (!(Number(input.netAmount) >= 0)) errors.push("Nettobetrag ungültig");
  for (const [label, value] of [
    ["Lieferantenname", input.supplier.name],
    ["Lieferantenstraße", input.supplier.street],
    ["Lieferanten-PLZ", input.supplier.postalCode],
    ["Lieferanten-Ort", input.supplier.city],
    ["Lieferanten-E-Mail", input.supplier.email],
    ["Lieferanten-USt-IdNr./Steuernummer", input.supplier.vatId || input.supplier.taxNumber],
    ["Lieferanten-IBAN", input.supplier.iban],
    ["Lieferanten-Telefon", input.supplier.phone],
    ["Eigene Firmenanschrift", input.buyerCompany.street],
    ["Eigene PLZ", input.buyerCompany.postalCode],
    ["Eigener Ort", input.buyerCompany.city],
    ["Eigene E-Mail", input.buyerCompany.email],
  ] as Array<[string, any]>) {
    if (!s(value)) errors.push(`${label} fehlt`);
  }
  return errors;
}

export async function createSelfBillingGutschrift(input: SelfBillingInput) {
  const errors = validate(input);
  if (errors.length) throw new Error(`GUTSCHRIFT_DATEN_UNVOLLSTAENDIG: ${errors.join(" | ")}`);

  fs.mkdirSync(input.outputDir, { recursive: true });
  const base = safeName(`Gutschrift_${input.number}`);
  const pdfPath = path.join(input.outputDir, `${base}.pdf`);
  const xmlPath = path.join(input.outputDir, `${base}_XRechnung.xml`);

  const buyer = input.buyerCompany;
  const pdf = createRlcPdfDocument({
    pdfPath,
    title: "Gutschrift",
    documentType: "Gutschrift",
    projectId: input.projectId,
    projectName: input.projectName || input.projectId,
    date: input.issueDate,
    company: buyer,
    subject: `Gutschrift ${input.number}`,
  });

  const { doc } = pdf;
  let y = pdf.startCurrentPage();
  const mx = RLC_PDF_THEME.marginX;
  const width = doc.page.width - mx * 2;
  const gap = 8;
  const quarter = (width - gap * 3) / 4;

  drawRlcInfoField(doc, mx, y, quarter, "Gutschrift Nr.", input.number);
  drawRlcInfoField(doc, mx + quarter + gap, y, quarter, "Ausgestellt am", dateDe(input.issueDate));
  drawRlcInfoField(doc, mx + (quarter + gap) * 2, y, quarter, "Leistungsdatum", dateDe(input.serviceDate));
  drawRlcInfoField(doc, mx + (quarter + gap) * 3, y, quarter, "Fällig am", dateDe(input.dueDate));
  y += 66;

  y = drawRlcSectionTitle(doc, "Gutschrift gemäß § 14 UStG", y);
  doc.font("Helvetica-Bold").fontSize(12).fillColor(RLC_PDF_THEME.blueDark)
    .text("GUTSCHRIFT", mx, y, { width, align: "center" });
  y += 28;

  const half = (width - gap) / 2;
  const supplierAddress = [input.supplier.street, `${input.supplier.postalCode} ${input.supplier.city}`.trim(), input.supplier.country || "DE"].filter(Boolean).join(", ");
  const buyerAddress = [buyer.street, `${buyer.postalCode || ""} ${buyer.city || ""}`.trim(), buyer.country || "DE"].filter(Boolean).join(", ");
  drawRlcInfoField(doc, mx, y, half, "Leistender Unternehmer / Gutschrift-Empfänger", `${input.supplier.name} · ${supplierAddress}`);
  drawRlcInfoField(doc, mx + half + gap, y, half, "Leistungsempfänger / Aussteller", `${buyer.legalName || buyer.name || ""} · ${buyerAddress}`);
  y += 62;

  drawRlcInfoField(doc, mx, y, half, "USt-IdNr./Steuernummer Lieferant", input.supplier.vatId || input.supplier.taxNumber || "—");
  drawRlcInfoField(doc, mx + half + gap, y, half, "BuyerReference", input.buyerReference || "-");
  y += 66;

  y = drawRlcSectionTitle(doc, "Leistung", y);
  doc.font("Helvetica").fontSize(9).fillColor(RLC_PDF_THEME.text)
    .text(input.serviceDescription, mx, y, { width });
  y += Math.max(34, doc.heightOfString(input.serviceDescription, { width }) + 12);

  const vatRate = Number(input.vatRate || 0);
  const tax = Number((Number(input.netAmount) * vatRate / 100).toFixed(2));
  const gross = Number((Number(input.netAmount) + tax).toFixed(2));
  const third = (width - gap * 2) / 3;
  drawRlcInfoField(doc, mx, y, third, "Netto", money(input.netAmount));
  drawRlcInfoField(doc, mx + third + gap, y, third, `MwSt. ${vatRate.toFixed(2)} %`, money(tax));
  drawRlcInfoField(doc, mx + (third + gap) * 2, y, third, "Brutto / Zahlbetrag", money(gross));
  y += 64;

  doc.font("Helvetica").fontSize(8.5).fillColor(RLC_PDF_THEME.text)
    .text([
      s(input.note),
      input.supplier.iban ? `IBAN Lieferant: ${input.supplier.iban}` : "",
      input.supplier.bic ? `BIC: ${input.supplier.bic}` : "",
    ].filter(Boolean).join(" · "), mx, y, { width });

  await pdf.finish();

  const xInvoice: XRechnungInvoice = {
    number: input.number,
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    deliveryDate: input.serviceDate,
    buyerReference: input.buyerReference || "-",
    invoiceTypeCode: 389,
    seller: input.supplier,
    buyer: {
      name: s(buyer.legalName || buyer.name),
      street: s(buyer.street),
      postalCode: s(buyer.postalCode),
      city: s(buyer.city),
      country: s(buyer.country || "DE"),
      email: s(buyer.email),
      vatId: s(buyer.vatId),
      taxNumber: s(buyer.taxNumber),
    },
    vatRate: Number(input.vatRate || 0),
    netAmount: Number(input.netAmount || 0),
    lines: [{
      id: "1",
      pos: "1",
      text: input.serviceDescription,
      unit: "Psch",
      qty: 1,
      unitPrice: Number(input.netAmount || 0),
      total: Number(input.netAmount || 0),
    }],
    currency: "EUR",
    note: ["Gutschrift gemäß § 14 UStG", s(input.note)].filter(Boolean).join(" | "),
  };

  const xml = buildXRechnungUbl(xInvoice);
  fs.writeFileSync(xmlPath, xml, "utf8");
  const validation = runKositXRechnungValidator(xmlPath);
  if (!validation.valid) {
    throw new Error(`GUTSCHRIFT_XRECHNUNG_KOSIT_INVALID: ${validation.errors.join(" | ").slice(0, 6000)}`);
  }

  let reportPath: string | null = null;
  if (validation.reportPath && fs.existsSync(validation.reportPath)) {
    reportPath = path.join(input.outputDir, `${base}_KoSIT-Validierungsbericht.xml`);
    fs.copyFileSync(validation.reportPath, reportPath);
  }

  return { pdfPath, xmlPath, reportPath, validation, grossAmount: gross, taxAmount: tax };
}

import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";

export type XRechnungParty = {
  name: string;
  street: string;
  postalCode: string;
  city: string;
  country?: string;
  email: string;
  vatId?: string;
  taxNumber?: string;
  iban?: string;
  bic?: string;
  bankName?: string;
  contactName?: string;
  phone?: string;
};

export type XRechnungInvoiceLine = {
  id?: string;
  pos?: string;
  text: string;
  unit?: string;
  qty: number;
  unitPrice: number;
  total: number;
};

export type XRechnungInvoice = {
  number: string;
  issueDate: string;
  dueDate: string;
  deliveryDate: string;
  buyerReference: string;
  invoiceTypeCode?: number;
  precedingInvoiceReference?: string;
  buyer: XRechnungParty;
  seller: XRechnungParty;
  vatRate: number;
  taxTreatment?: "STANDARD" | "REVERSE_CHARGE_13B";
  netAmount: number;
  prepaidAmount?: number;
  supportingDocument?: { id: string; description: string; filename: string; contentBase64?: string };
  lines: XRechnungInvoiceLine[];
  currency?: string;
  note?: string;
};

export type XRechnungValidationResult = {
  valid: boolean;
  errors: string[];
  reportPath?: string | null;
};

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function money(value: unknown): string {
  const n = Number(value || 0);
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

function qty(value: unknown): string {
  const n = Number(value || 0);
  return (Number.isFinite(n) ? n : 0).toFixed(3).replace(/0+$/, "").replace(/\.$/, "") || "0";
}

function normalizeDate(value: unknown): string {
  const raw = String(value || "").trim();
  const de = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (de) return `${de[3]}-${de[2].padStart(2, "0")}-${de[1].padStart(2, "0")}`;
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  return "";
}

function normalizeCountry(value: unknown): string {
  const raw = String(value || "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(raw)) return raw;
  if (!raw || raw === "DEUTSCHLAND" || raw === "GERMANY") return "DE";
  return raw.slice(0, 2);
}

function unitCode(value: unknown): string {
  const raw = String(value || "").trim().toLowerCase().replace(/²/g, "2").replace(/³/g, "3");
  const map: Record<string, string> = {
    st: "C62",
    stk: "C62",
    stück: "C62",
    stueck: "C62",
    psch: "XPP",
    pauschal: "XPP",
    h: "HUR",
    std: "HUR",
    m: "MTR",
    m2: "MTK",
    "m²": "MTK",
    m3: "MTQ",
    "m³": "MTQ",
    kg: "KGM",
    t: "TNE",
    l: "LTR",
    lt: "LTR",
    tag: "DAY",
    d: "DAY",
  };
  return map[raw] || "C62";
}

function validateParty(prefix: string, party: XRechnungParty, requirePayment = false): string[] {
  const errors: string[] = [];
  if (!party.name?.trim()) errors.push(`${prefix}: Name fehlt`);
  if (!party.street?.trim()) errors.push(`${prefix}: Straße fehlt`);
  if (!party.postalCode?.trim()) errors.push(`${prefix}: PLZ fehlt`);
  if (!party.city?.trim()) errors.push(`${prefix}: Ort fehlt`);
  if (!party.email?.trim()) errors.push(`${prefix}: E-Mail/Endpoint fehlt`);
  if (prefix === "Verkäufer" && !String(party.vatId || party.taxNumber || "").trim()) {
    errors.push("Verkäufer: USt-IdNr. oder Steuernummer fehlt");
  }
  if (prefix === "Verkäufer" && !party.phone?.trim()) {
    errors.push("Verkäufer: Telefonnummer des Kontakts fehlt");
  }
  if (requirePayment && !party.iban?.trim()) errors.push("Verkäufer: IBAN fehlt");
  return errors;
}

export function validateXRechnungInput(invoice: XRechnungInvoice): string[] {
  const errors = [
    ...validateParty("Verkäufer", invoice.seller, true),
    ...validateParty("Käufer", invoice.buyer, false),
  ];
  if (!invoice.number?.trim()) errors.push("Rechnungsnummer fehlt");
  if (!normalizeDate(invoice.issueDate)) errors.push("Rechnungsdatum fehlt/ungültig");
  if (!normalizeDate(invoice.dueDate)) errors.push("Fälligkeitsdatum fehlt/ungültig");
  if (!normalizeDate(invoice.deliveryDate)) errors.push("Leistungsdatum fehlt/ungültig");
  if (!invoice.buyerReference?.trim()) errors.push("BuyerReference / Leitweg-ID / Kundenreferenz fehlt");
  if (Number(invoice.invoiceTypeCode || 380) === 384 && !invoice.precedingInvoiceReference?.trim()) {
    errors.push("Rechnungskorrektur: Referenz auf die ursprüngliche Rechnung fehlt");
  }
  if (!Number.isFinite(Number(invoice.netAmount)) || Number(invoice.netAmount) < 0) errors.push("Nettobetrag ungültig");
  if (invoice.prepaidAmount !== undefined && (!Number.isFinite(Number(invoice.prepaidAmount)) || Number(invoice.prepaidAmount) < 0)) errors.push("Vorauszahlungsbetrag ungültig");
  if (!Number.isFinite(Number(invoice.vatRate)) || Number(invoice.vatRate) < 0) errors.push("MwSt.-Satz ungültig");
  if (invoice.taxTreatment === "REVERSE_CHARGE_13B") {
    if (!invoice.seller.vatId?.trim()) errors.push("§13b: USt-IdNr. des Verkäufers fehlt");
    if (!invoice.buyer.vatId?.trim()) errors.push("§13b: USt-IdNr. des Leistungsempfängers fehlt");
  }
  if (!Array.isArray(invoice.lines) || !invoice.lines.length) errors.push("Mindestens eine Rechnungsposition erforderlich");
  for (const [index, line] of (invoice.lines || []).entries()) {
    if (!line.text?.trim()) errors.push(`Position ${index + 1}: Leistungsbeschreibung fehlt`);
    if (!(Number(line.qty) > 0)) errors.push(`Position ${index + 1}: Menge muss > 0 sein`);
    if (!Number.isFinite(Number(line.unitPrice))) errors.push(`Position ${index + 1}: EP ungültig`);
  }
  return errors;
}

function partyXml(party: XRechnungParty, seller = false): string {
  const tax =
    party.vatId
      ? `<cac:PartyTaxScheme><cbc:CompanyID>${esc(party.vatId)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>`
      : seller && party.taxNumber
        ? `<cac:PartyTaxScheme><cbc:CompanyID>${esc(party.taxNumber)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>FC</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>`
        : "";
  const contact = seller
    ? `<cac:Contact><cbc:Name>${esc(party.contactName || party.name)}</cbc:Name>${party.phone ? `<cbc:Telephone>${esc(party.phone)}</cbc:Telephone>` : ""}<cbc:ElectronicMail>${esc(party.email)}</cbc:ElectronicMail></cac:Contact>`
    : "";
  return `<cac:Party>
<cbc:EndpointID schemeID="EM">${esc(party.email)}</cbc:EndpointID>
<cac:PartyName><cbc:Name>${esc(party.name)}</cbc:Name></cac:PartyName>
<cac:PostalAddress>
<cbc:StreetName>${esc(party.street)}</cbc:StreetName>
<cbc:CityName>${esc(party.city)}</cbc:CityName>
<cbc:PostalZone>${esc(party.postalCode)}</cbc:PostalZone>
<cac:Country><cbc:IdentificationCode>${esc(normalizeCountry(party.country))}</cbc:IdentificationCode></cac:Country>
</cac:PostalAddress>
${tax}
<cac:PartyLegalEntity><cbc:RegistrationName>${esc(party.name)}</cbc:RegistrationName></cac:PartyLegalEntity>
${contact}
</cac:Party>`;
}

export function buildXRechnungUbl(invoice: XRechnungInvoice): string {
  const errors = validateXRechnungInput(invoice);
  if (errors.length) {
    throw new Error(`XRECHNUNG_DATEN_UNVOLLSTAENDIG: ${errors.join(" | ")}`);
  }

  const currency = String(invoice.currency || "EUR").toUpperCase();
  const net = Number(invoice.netAmount);
  const reverseCharge = invoice.taxTreatment === "REVERSE_CHARGE_13B";
  const vatRate = reverseCharge ? 0 : Number(invoice.vatRate);
  const tax = reverseCharge ? 0 : Number((net * vatRate / 100).toFixed(2));
  const gross = Number((net + tax).toFixed(2));
  const prepaidAmount = Math.max(0, Math.min(gross, Number(invoice.prepaidAmount || 0)));
  const payableAmount = Number((gross - prepaidAmount).toFixed(2));
  const taxCategory = reverseCharge ? "AE" : vatRate > 0 ? "S" : "Z";
  const taxExemptionReason = reverseCharge ? "Steuerschuldnerschaft des Leistungsempfängers" : "";

  const lines = invoice.lines.map((line, index) => {
    const lineTotal = Number.isFinite(Number(line.total)) ? Number(line.total) : Number(line.qty) * Number(line.unitPrice);
    return `<cac:InvoiceLine>
<cbc:ID>${esc(line.pos || line.id || String(index + 1))}</cbc:ID>
<cbc:InvoicedQuantity unitCode="${unitCode(line.unit)}">${qty(line.qty)}</cbc:InvoicedQuantity>
<cbc:LineExtensionAmount currencyID="${currency}">${money(lineTotal)}</cbc:LineExtensionAmount>
<cac:Item>
<cbc:Name>${esc(line.text)}</cbc:Name>
<cac:ClassifiedTaxCategory><cbc:ID>${taxCategory}</cbc:ID><cbc:Percent>${money(vatRate)}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory>
</cac:Item>
<cac:Price><cbc:PriceAmount currencyID="${currency}">${money(line.unitPrice)}</cbc:PriceAmount></cac:Price>
</cac:InvoiceLine>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<ubl:Invoice xmlns:ubl="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</cbc:CustomizationID>
<cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
<cbc:ID>${esc(invoice.number)}</cbc:ID>
<cbc:IssueDate>${normalizeDate(invoice.issueDate)}</cbc:IssueDate>
<cbc:DueDate>${normalizeDate(invoice.dueDate)}</cbc:DueDate>
<cbc:InvoiceTypeCode>${Number(invoice.invoiceTypeCode || 380)}</cbc:InvoiceTypeCode>
${invoice.note ? `<cbc:Note>${esc(invoice.note)}</cbc:Note>` : ""}
<cbc:DocumentCurrencyCode>${currency}</cbc:DocumentCurrencyCode>
<cbc:BuyerReference>${esc(invoice.buyerReference)}</cbc:BuyerReference>
${invoice.precedingInvoiceReference ? `<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${esc(invoice.precedingInvoiceReference)}</cbc:ID></cac:InvoiceDocumentReference></cac:BillingReference>` : ""}
${invoice.supportingDocument ? `<cac:AdditionalDocumentReference><cbc:ID>${esc(invoice.supportingDocument.id)}</cbc:ID><cbc:DocumentDescription>${esc(invoice.supportingDocument.description)}</cbc:DocumentDescription><cac:Attachment>${invoice.supportingDocument.contentBase64 ? `<cbc:EmbeddedDocumentBinaryObject mimeCode="application/pdf" filename="${esc(invoice.supportingDocument.filename)}">${invoice.supportingDocument.contentBase64}</cbc:EmbeddedDocumentBinaryObject>` : `<cac:ExternalReference><cbc:URI>${esc(invoice.supportingDocument.filename)}</cbc:URI></cac:ExternalReference>`}</cac:Attachment></cac:AdditionalDocumentReference>` : ""}
<cac:AccountingSupplierParty>${partyXml(invoice.seller, true)}</cac:AccountingSupplierParty>
<cac:AccountingCustomerParty>${partyXml(invoice.buyer, false)}</cac:AccountingCustomerParty>
<cac:Delivery><cbc:ActualDeliveryDate>${normalizeDate(invoice.deliveryDate)}</cbc:ActualDeliveryDate></cac:Delivery>
<cac:PaymentMeans><cbc:PaymentMeansCode>58</cbc:PaymentMeansCode><cac:PayeeFinancialAccount><cbc:ID>${esc(invoice.seller.iban)}</cbc:ID>${invoice.seller.bic ? `<cac:FinancialInstitutionBranch><cbc:ID>${esc(invoice.seller.bic)}</cbc:ID></cac:FinancialInstitutionBranch>` : ""}</cac:PayeeFinancialAccount></cac:PaymentMeans>
<cac:TaxTotal>
<cbc:TaxAmount currencyID="${currency}">${money(tax)}</cbc:TaxAmount>
<cac:TaxSubtotal>
<cbc:TaxableAmount currencyID="${currency}">${money(net)}</cbc:TaxableAmount>
<cbc:TaxAmount currencyID="${currency}">${money(tax)}</cbc:TaxAmount>
<cac:TaxCategory><cbc:ID>${taxCategory}</cbc:ID><cbc:Percent>${money(vatRate)}</cbc:Percent>${taxExemptionReason ? `<cbc:TaxExemptionReason>${esc(taxExemptionReason)}</cbc:TaxExemptionReason>` : ""}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
</cac:TaxSubtotal>
</cac:TaxTotal>
<cac:LegalMonetaryTotal>
<cbc:LineExtensionAmount currencyID="${currency}">${money(net)}</cbc:LineExtensionAmount>
<cbc:TaxExclusiveAmount currencyID="${currency}">${money(net)}</cbc:TaxExclusiveAmount>
<cbc:TaxInclusiveAmount currencyID="${currency}">${money(gross)}</cbc:TaxInclusiveAmount>
${prepaidAmount > 0 ? `<cbc:PrepaidAmount currencyID="${currency}">${money(prepaidAmount)}</cbc:PrepaidAmount>` : ""}
<cbc:PayableAmount currencyID="${currency}">${money(payableAmount)}</cbc:PayableAmount>
</cac:LegalMonetaryTotal>
${lines}
</ubl:Invoice>
`;
}

export function runKositXRechnungValidator(xmlPath: string): XRechnungValidationResult {
  const root = String(process.env.XRECHNUNG_VALIDATOR_ROOT || path.resolve(__dirname, "../../resources/xrechnung")).trim();

  const jar = path.join(root, "validator-1.6.3-standalone.jar");
  const scenarios = path.join(root, "validator-config", "scenarios.xml");
  const resourceDir = path.join(root, "validator-config");
  if (!fs.existsSync(jar) || !fs.existsSync(scenarios)) {
    return { valid: false, errors: ["KoSIT Validator-Ressourcen fehlen."], reportPath: null };
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "rlc-xrechnung-"));
  const target = path.join(workDir, path.basename(xmlPath));
  fs.copyFileSync(xmlPath, target);

  const run = spawnSync("java", ["-jar", jar, "-s", scenarios, "-r", resourceDir, "-h", target], {
    cwd: workDir,
    encoding: "utf8",
    timeout: 120000,
  });

  const report = target.replace(/\.xml$/i, "-report.xml");
  const output = `${run.stdout || ""}\n${run.stderr || ""}`.trim();
  const reportText = fs.existsSync(report) ? fs.readFileSync(report, "utf8") : "";
  const invalid =
    run.status !== 0 ||
    /<[^>]*assessment[^>]*>\s*reject\s*</i.test(reportText) ||
    /<[^>]*(?:validation|conformance)[^>]*>\s*invalid\s*</i.test(reportText) ||
    /\breject\b/i.test(output);

  const errors: string[] = [];
  if (invalid) {
    if (output) errors.push(output.slice(0, 4000));
    if (reportText) {
      const matches = [...reportText.matchAll(/<[^>]*(?:error|message)[^>]*>([\s\S]*?)<\//gi)];
      for (const match of matches.slice(0, 20)) {
        const msg = String(match[1] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        if (msg) errors.push(msg);
      }
    }
  }

  return { valid: !invalid, errors: errors.length ? errors : invalid ? ["KoSIT-Validierung fehlgeschlagen."] : [], reportPath: fs.existsSync(report) ? report : null };
}

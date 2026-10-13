// apps/mobile/src/lib/exporters/documentPdfBuilder.ts
import * as Print from "expo-print";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import {
  getCompanyHeaderCached,
  getCompanyLogoUriCached,
} from "../companyCache";

export type PdfDocType =
  | "ANGEBOT"
  | "MENGENERMITTLUNG"
  | "RECHNUNG"
  | "ABSCHLAGSRECHNUNG"
  | "SCHLUSSRECHNUNG";

export type PdfCustomer = {
  name?: string;
  address?: string;
  email?: string;
  phone?: string;
};

export type PdfBank = {
  bank?: string;
  iban?: string;
  bic?: string;
  owner?: string;
  steuerNr?: string;
  ustId?: string;
  zahlungsziel?: string;
};

export type PdfRow = {
  pos?: string;
  text?: string;
  unit?: string;
  qty?: string | number;
  ep?: string | number;
  gp?: string | number;
  formula?: string;
};

export type PdfTotals = {
  netto?: number;
  rabattPct?: number;
  rabattValue?: number;
  zuschlagPct?: number;
  zuschlagValue?: number;
  mwstPct?: number;
  mwstValue?: number;
  brutto?: number;
  bezahlt?: number;
  rest?: number;
};

export type PdfExtraBlock = {
  title: string;
  lines: string[];
};

export type BuildDocumentPdfInput = {
  type: PdfDocType;
  projectCode: string;
  fileName: string;

  title: string;
  subTitle?: string;

  docNo?: string;
  date?: string;
  period?: string;

  customer?: PdfCustomer;
  bank?: PdfBank;

  rows?: PdfRow[];
  totals?: PdfTotals;

  note?: string;
  extraBlocks?: PdfExtraBlock[];

  showFormulaColumn?: boolean;
  shareAfterCreate?: boolean;
};

function esc(v: any) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function num(v: string | number | null | undefined) {
  return Number(String(v ?? "").replace(",", ".") || 0);
}

function money(v: number) {
  return Number(v || 0).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

async function ensurePdfDir(projectCode: string) {
  const base = FileSystem.documentDirectory || FileSystem.cacheDirectory || "";
  const dir = `${base}rlc-pdfs/${projectCode}/`;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
}

async function toDataUri(uri?: string | null) {
  try {
    if (!uri) return "";
    if (uri.startsWith("data:")) return uri;

    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const lower = uri.toLowerCase();
    const mime = lower.endsWith(".png")
      ? "image/png"
      : lower.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";

    return `data:${mime};base64,${base64}`;
  } catch {
    return "";
  }
}

function hasCustomer(customer?: PdfCustomer) {
  return !!(
    customer?.name ||
    customer?.address ||
    customer?.email ||
    customer?.phone
  );
}

function renderHeader(params: {
  type: PdfDocType;
  title: string;
  subTitle?: string;
  logoDataUri?: string;
  company?: any;
  docNo?: string;
  date?: string;
  period?: string;
  projectCode?: string;
}) {
  const {
    type,
    title,
    subTitle,
    logoDataUri,
    company,
    docNo,
    date,
    period,
    projectCode,
  } = params;

  const docTypeLabel =
    type === "ANGEBOT"
      ? "ANGEBOT"
      : type === "MENGENERMITTLUNG"
      ? "MENGENERMITTLUNG"
      : type === "ABSCHLAGSRECHNUNG"
      ? "ABSCHLAGSRECHNUNG"
      : type === "SCHLUSSRECHNUNG"
      ? "SCHLUSSRECHNUNG"
      : "RECHNUNG";

  return `
    <div style="border-bottom:1px solid #d8e1ea;padding-bottom:10px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
        <div style="flex:1;">
          <div style="font-size:22px;font-weight:800;letter-spacing:0.2px;color:#0f172a;line-height:1.1;">
            ${esc(title || docTypeLabel)}
          </div>
          ${
            subTitle
              ? `<div style="margin-top:3px;font-size:10px;color:#64748b;font-weight:600;">${esc(
                  subTitle
                )}</div>`
              : ""
          }
        </div>
        ${
          logoDataUri
            ? `<img src="${logoDataUri}" style="max-width:100px;max-height:46px;object-fit:contain;" />`
            : ""
        }
      </div>

      <div style="display:flex;justify-content:space-between;gap:16px;margin-top:10px;">
        <div style="flex:1;font-size:10px;line-height:1.4;color:#0f172a;">
          <div style="font-size:12px;font-weight:800;margin-bottom:3px;">
            ${company?.name ? esc(company.name) : "Firma"}
          </div>
          ${company?.address ? `<div>${esc(company.address)}</div>` : ""}
          ${company?.phone ? `<div>Tel: ${esc(company.phone)}</div>` : ""}
          ${company?.email ? `<div>E-Mail: ${esc(company.email)}</div>` : ""}
        </div>

        <div style="min-width:210px;font-size:10px;line-height:1.4;color:#0f172a;text-align:right;">
          ${docNo ? `<div><strong>Nr:</strong> ${esc(docNo)}</div>` : ""}
          ${date ? `<div><strong>Datum:</strong> ${esc(date)}</div>` : ""}
          ${
            period
              ? `<div><strong>Leistungszeitraum:</strong> ${esc(period)}</div>`
              : ""
          }
          ${
            projectCode
              ? `<div><strong>Projektcode:</strong> ${esc(projectCode)}</div>`
              : ""
          }
        </div>
      </div>
    </div>
  `;
}

function renderCustomer(customer?: PdfCustomer) {
  if (!hasCustomer(customer)) return "";

  return `
    <div style="margin-bottom:10px;">
      <div style="font-size:12px;font-weight:800;margin-bottom:4px;color:#0f172a;">Kunde</div>
      <div style="border:1px solid #dbe3ea;border-radius:8px;padding:8px 10px;font-size:10px;line-height:1.4;color:#0f172a;background:#ffffff;">
        ${customer?.name ? `<div>${esc(customer.name)}</div>` : ""}
        ${customer?.address ? `<div>${esc(customer.address)}</div>` : ""}
        ${customer?.email ? `<div>${esc(customer.email)}</div>` : ""}
        ${customer?.phone ? `<div>${esc(customer.phone)}</div>` : ""}
      </div>
    </div>
  `;
}

function renderExtraBlocks(extraBlocks?: PdfExtraBlock[]) {
  if (!Array.isArray(extraBlocks) || !extraBlocks.length) return "";

  return extraBlocks
    .map(
      (b) => `
      <div style="margin-bottom:8px;">
        <div style="font-size:11px;font-weight:800;color:#0f172a;margin-bottom:3px;">
          ${esc(b.title)}
        </div>
        <div style="padding:7px 9px;background:#f8fafc;border:1px solid #dbe3ea;border-radius:8px;font-size:10px;line-height:1.38;color:#0f172a;">
          ${(b.lines || []).map((line) => `<div>${esc(line)}</div>`).join("")}
        </div>
      </div>
    `
    )
    .join("");
}

function thStyle(align: "left" | "right", width?: string) {
  return [
    "background:#eef4f8",
    "border:1px solid #cfd8e3",
    "padding:5px 6px",
    "font-weight:800",
    "font-size:10px",
    "text-align:" + align,
    width ? `width:${width}` : "",
  ].join(";");
}

function tdStyle(align: "left" | "right") {
  return [
    "border:1px solid #dbe3ea",
    "padding:5px 6px",
    "vertical-align:top",
    "font-size:10px",
    "line-height:1.3",
    "text-align:" + align,
  ].join(";");
}

function renderRows(rows?: PdfRow[], showFormulaColumn?: boolean) {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!safeRows.length) return "";

  return `
    <div style="margin-top:6px;">
      <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:10px;color:#0f172a;">
        <thead>
          <tr>
            <th style="${thStyle("left", "8%")}">Pos</th>
            <th style="${thStyle("left", showFormulaColumn ? "34%" : "40%")}">Text</th>
            <th style="${thStyle("left", "10%")}">Einheit</th>
            <th style="${thStyle("right", "12%")}">Menge</th>
            <th style="${thStyle("right", "12%")}">EP</th>
            <th style="${thStyle("right", "12%")}">GP</th>
            ${
              showFormulaColumn
                ? `<th style="${thStyle("left", "12%")}">Formel</th>`
                : ""
            }
          </tr>
        </thead>
        <tbody>
          ${safeRows
            .map((r) => {
              const qty = num(r.qty);
              const ep = num(r.ep);
              const gp = r.gp !== undefined ? num(r.gp) : qty * ep;

              return `
                <tr>
                  <td style="${tdStyle("left")}">${esc(r.pos)}</td>
                  <td style="${tdStyle("left")}">${esc(r.text)}</td>
                  <td style="${tdStyle("left")}">${esc(r.unit)}</td>
                  <td style="${tdStyle("right")}">${money(qty)}</td>
                  <td style="${tdStyle("right")}">${money(ep)} €</td>
                  <td style="${tdStyle("right")}">${money(gp)} €</td>
                  ${
                    showFormulaColumn
                      ? `<td style="${tdStyle("left")}">${esc(r.formula || "")}</td>`
                      : ""
                  }
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function sumLabelStyle() {
  return [
    "padding:5px 0",
    "border-bottom:1px solid #e2e8f0",
    "color:#334155",
    "font-size:10px",
    "font-weight:600",
  ].join(";");
}

function sumValueStyle() {
  return [
    "padding:5px 0",
    "border-bottom:1px solid #e2e8f0",
    "text-align:right",
    "color:#0f172a",
    "font-size:10px",
    "font-weight:700",
  ].join(";");
}

function sumLabelStrongStyle() {
  return [
    "padding:7px 0 5px 0",
    "border-top:2px solid #dbe3ea",
    "font-size:12px",
    "font-weight:800",
    "color:#0f172a",
  ].join(";");
}

function sumValueStrongStyle() {
  return [
    "padding:7px 0 5px 0",
    "border-top:2px solid #dbe3ea",
    "text-align:right",
    "font-size:12px",
    "font-weight:800",
    "color:#0f172a",
  ].join(";");
}

function renderTotals(type: PdfDocType, totals?: PdfTotals) {
  const t = totals || {};

  if (type === "MENGENERMITTLUNG") {
    return `
      <div style="margin-top:10px;display:flex;justify-content:flex-end;">
        <table cellspacing="0" cellpadding="0" style="min-width:260px;border-collapse:collapse;font-size:10px;">
          <tr>
            <td style="padding:6px 0;border-top:2px solid #dbe3ea;font-weight:800;font-size:11px;">Netto gesamt</td>
            <td style="padding:6px 0;border-top:2px solid #dbe3ea;font-weight:800;font-size:11px;text-align:right;">
              ${money(Number(t.netto || 0))} €
            </td>
          </tr>
        </table>
      </div>
    `;
  }

  const rows: string[] = [];

  if (t.netto !== undefined) {
    rows.push(
      `<tr><td style="${sumLabelStyle()}">Netto</td><td style="${sumValueStyle()}">${money(
        Number(t.netto || 0)
      )} €</td></tr>`
    );
  }

  if (t.rabattPct !== undefined || t.rabattValue !== undefined) {
    rows.push(
      `<tr><td style="${sumLabelStyle()}">Rabatt (${money(
        Number(t.rabattPct || 0)
      )}%)</td><td style="${sumValueStyle()}">- ${money(
        Number(t.rabattValue || 0)
      )} €</td></tr>`
    );
  }

  if (t.zuschlagPct !== undefined || t.zuschlagValue !== undefined) {
    rows.push(
      `<tr><td style="${sumLabelStyle()}">Zuschlag (${money(
        Number(t.zuschlagPct || 0)
      )}%)</td><td style="${sumValueStyle()}">+ ${money(
        Number(t.zuschlagValue || 0)
      )} €</td></tr>`
    );
  }

  if (t.mwstPct !== undefined || t.mwstValue !== undefined) {
    rows.push(
      `<tr><td style="${sumLabelStyle()}">MwSt (${money(
        Number(t.mwstPct || 0)
      )}%)</td><td style="${sumValueStyle()}">${money(
        Number(t.mwstValue || 0)
      )} €</td></tr>`
    );
  }

  if (t.bezahlt !== undefined) {
    rows.push(
      `<tr><td style="${sumLabelStyle()}">Bereits bezahlt / Abschläge</td><td style="${sumValueStyle()}">${money(
        Number(t.bezahlt || 0)
      )} €</td></tr>`
    );
  }

  if (t.rest !== undefined) {
    rows.push(
      `<tr><td style="${sumLabelStyle()}">Offener Rest</td><td style="${sumValueStyle()}">${money(
        Number(t.rest || 0)
      )} €</td></tr>`
    );
  }

  const finalLabel =
    type === "ABSCHLAGSRECHNUNG"
      ? "Abschlag fällig"
      : type === "SCHLUSSRECHNUNG"
      ? "Schlussbetrag fällig"
      : type === "ANGEBOT"
      ? "Angebot brutto"
      : "Rechnungsbetrag";

  if (t.brutto !== undefined) {
    rows.push(
      `<tr><td style="${sumLabelStrongStyle()}">${esc(
        finalLabel
      )}</td><td style="${sumValueStrongStyle()}">${money(
        Number(t.brutto || 0)
      )} €</td></tr>`
    );
  }

  if (!rows.length) return "";

  return `
    <div style="margin-top:10px;display:flex;justify-content:flex-end;">
      <table cellspacing="0" cellpadding="0" style="min-width:320px;border-collapse:collapse;font-size:10px;">
        ${rows.join("")}
      </table>
    </div>
  `;
}

function renderBank(bank?: PdfBank) {
  if (!bank) return "";

  const hasAny =
    bank.bank ||
    bank.iban ||
    bank.bic ||
    bank.owner ||
    bank.steuerNr ||
    bank.ustId ||
    bank.zahlungsziel;

  if (!hasAny) return "";

  return `
    <div style="margin-top:12px;">
      <div style="font-size:11px;font-weight:800;color:#0f172a;margin-bottom:3px;">Bank / Steuer</div>
      <div style="font-size:10px;line-height:1.35;color:#0f172a;">
        ${bank.bank ? `<div>${esc(bank.bank)}</div>` : ""}
        ${bank.iban ? `<div>IBAN: ${esc(bank.iban)}</div>` : ""}
        ${bank.bic ? `<div>BIC: ${esc(bank.bic)}</div>` : ""}
        ${bank.owner ? `<div>Kontoinhaber: ${esc(bank.owner)}</div>` : ""}
        ${bank.steuerNr ? `<div>SteuerNr: ${esc(bank.steuerNr)}</div>` : ""}
        ${bank.ustId ? `<div>USt-ID: ${esc(bank.ustId)}</div>` : ""}
        ${
          bank.zahlungsziel
            ? `<div>Zahlungsziel: ${esc(bank.zahlungsziel)}</div>`
            : ""
        }
      </div>
    </div>
  `;
}

function renderNote(note?: string) {
  if (!String(note || "").trim()) return "";
  return `
    <div style="margin-top:10px;padding:8px 10px;background:#f8fafc;border:1px solid #dbe3ea;border-radius:8px;font-size:10px;line-height:1.35;color:#0f172a;">
      ${esc(note)}
    </div>
  `;
}

function renderSignature(type: PdfDocType) {
  if (type === "ANGEBOT") return "";

  return `
    <div style="margin-top:18px;display:flex;justify-content:space-between;gap:24px;">
      <div style="width:42%;border-top:1px solid #9aa7b4;padding-top:5px;font-size:10px;color:#334155;">
        Ort / Datum
      </div>
      <div style="width:42%;border-top:1px solid #9aa7b4;padding-top:5px;font-size:10px;color:#334155;">
        Unterschrift
      </div>
    </div>
  `;
}

function renderClassicSchlussrechnung(params: {
  input: BuildDocumentPdfInput;
  company?: any;
  logoDataUri?: string;
}) {
  const { input, company, logoDataUri } = params;
  const totals = input.totals || {};

  const headerHtml = renderHeader({
    type: input.type,
    title: input.title,
    subTitle: input.subTitle,
    logoDataUri,
    company,
    docNo: input.docNo,
    date: input.date,
    period: input.period,
    projectCode: input.projectCode,
  });

  const customerHtml = renderCustomer(input.customer);
  const extraBlocksHtml = renderExtraBlocks(input.extraBlocks);
  const rowsHtml = renderRows(input.rows, input.showFormulaColumn);
  const bankHtml = renderBank(input.bank);
  const noteHtml = renderNote(input.note);
  const signatureHtml = renderSignature(input.type);

  const netto = Number(totals.netto || 0);
  const mwstValue = Number(totals.mwstValue || 0);
  const brutto = Number(totals.brutto || 0);
  const bezahlt = Number(totals.bezahlt || 0);
  const rest = Number(
    totals.rest !== undefined ? totals.rest : Math.max(0, brutto - bezahlt)
  );

  const schlussBlockHtml = `
    <div style="margin-top:10px;display:flex;justify-content:flex-end;">
      <table cellspacing="0" cellpadding="0" style="min-width:320px;border-collapse:collapse;font-size:10px;">
        <tr>
          <td style="${sumLabelStyle()}">Netto</td>
          <td style="${sumValueStyle()}">${money(netto)} €</td>
        </tr>
        <tr>
          <td style="${sumLabelStyle()}">MwSt (${money(
            Number(totals.mwstPct || 0)
          )}%)</td>
          <td style="${sumValueStyle()}">${money(mwstValue)} €</td>
        </tr>
        <tr>
          <td style="${sumLabelStyle()}">Bereits bezahlt / Abschläge</td>
          <td style="${sumValueStyle()}">${money(bezahlt)} €</td>
        </tr>
        <tr>
          <td style="${sumLabelStyle()}">Offener Rest</td>
          <td style="${sumValueStyle()}">${money(rest)} €</td>
        </tr>
        <tr>
          <td style="${sumLabelStrongStyle()}">Schlussbetrag fällig</td>
          <td style="${sumValueStrongStyle()}">${money(rest)} €</td>
        </tr>
      </table>
    </div>
  `;

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page {
            size: A4;
            margin: 14mm 12mm;
          }
          html, body {
            margin: 0;
            padding: 0;
          }
        </style>
      </head>
      <body style="font-family:Arial,Helvetica,sans-serif;padding:18px 20px;color:#0B1720;font-size:10px;background:#ffffff;">
        ${headerHtml}
        ${customerHtml}
        ${extraBlocksHtml}
        ${rowsHtml}
        ${schlussBlockHtml}
        ${bankHtml}
        ${noteHtml}
        ${signatureHtml}
      </body>
    </html>
  `;
}

function buildStandardHtml(params: {
  headerHtml: string;
  customerHtml: string;
  extraBlocksHtml: string;
  rowsHtml: string;
  totalsHtml: string;
  bankHtml: string;
  noteHtml: string;
  signatureHtml: string;
}) {
  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page {
            size: A4;
            margin: 14mm 12mm;
          }
          html, body {
            margin: 0;
            padding: 0;
          }
        </style>
      </head>
      <body style="font-family:Arial,Helvetica,sans-serif;padding:18px 20px;color:#0B1720;font-size:10px;background:#ffffff;">
        ${params.headerHtml}
        ${params.customerHtml}
        ${params.extraBlocksHtml}
        ${params.rowsHtml}
        ${params.totalsHtml}
        ${params.bankHtml}
        ${params.noteHtml}
        ${params.signatureHtml}
      </body>
    </html>
  `;
}

export async function buildDocumentPdf(input: BuildDocumentPdfInput) {
  const company = await getCompanyHeaderCached().catch(() => null);
  const logoUri = await getCompanyLogoUriCached().catch(() => "");
  const logoDataUri = await toDataUri(logoUri);

  let html = "";

  if (input.type === "SCHLUSSRECHNUNG") {
    html = renderClassicSchlussrechnung({
      input,
      company,
      logoDataUri,
    });
  } else {
    const headerHtml = renderHeader({
      type: input.type,
      title: input.title,
      subTitle: input.subTitle,
      logoDataUri,
      company,
      docNo: input.docNo,
      date: input.date,
      period: input.period,
      projectCode: input.projectCode,
    });

    const customerHtml = renderCustomer(input.customer);
    const extraBlocksHtml = renderExtraBlocks(input.extraBlocks);
    const rowsHtml = renderRows(input.rows, input.showFormulaColumn);
    const totalsHtml = renderTotals(input.type, input.totals);
    const bankHtml = renderBank(input.bank);
    const noteHtml = renderNote(input.note);
    const signatureHtml = renderSignature(input.type);

    html = buildStandardHtml({
      headerHtml,
      customerHtml,
      extraBlocksHtml,
      rowsHtml,
      totalsHtml,
      bankHtml,
      noteHtml,
      signatureHtml,
    });
  }

  const tmp = await Print.printToFileAsync({ html });
  const dir = await ensurePdfDir(input.projectCode);
  const pdfUri = `${dir}${input.fileName}`;

  const oldInfo = await FileSystem.getInfoAsync(pdfUri);
  if (oldInfo.exists) {
    await FileSystem.deleteAsync(pdfUri, { idempotent: true });
  }

  await FileSystem.copyAsync({
    from: tmp.uri,
    to: pdfUri,
  });

  if (input.shareAfterCreate) {
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(pdfUri, {
        mimeType: "application/pdf",
        dialogTitle: input.fileName,
        UTI: "com.adobe.pdf",
      });
    }
  }

  return {
    pdfUri,
    html,
  };
}


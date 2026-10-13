import * as Print from "expo-print";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import {
  getCompanyHeaderCached,
  getCompanyLogoUriCached,
} from "../companyCache";

/* ================= TYPES ================= */

type Customer = {
  name?: string;
  address?: string;
  email?: string;
  phone?: string;
};

type Bank = {
  bank?: string;
  iban?: string;
  bic?: string;
  owner?: string;
  steuerNr?: string;
  ustId?: string;
  zahlungsziel?: string;
};

type Row = {
  pos?: string;
  text?: string;
  unit?: string;
  qty?: string | number;
  ep?: string | number;
  gp?: string | number;
};

type Input = {
  projectCode: string;
  fileName: string;

  title?: string;
  subTitle?: string;

  docNo?: string;
  date?: string;
  period?: string;

  customer?: Customer;
  bank?: Bank;

  rows?: Row[];

  netto?: number;
  mwstPct?: number;
  mwstValue?: number;
  brutto?: number;

  bezahlt?: number;
  rest?: number;

  abschlagLines?: string[];

  note?: string;

  shareAfterCreate?: boolean;
};

/* ================= HELPERS ================= */

function esc(v: any) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function num(v: any) {
  return Number(String(v ?? "").replace(",", ".") || 0);
}

function money(v: number) {
  return Number(v || 0).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

async function ensureDir(projectCode: string) {
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

function hasCustomer(customer?: Customer) {
  return !!(
    customer?.name ||
    customer?.address ||
    customer?.email ||
    customer?.phone
  );
}

function hasBank(bank?: Bank) {
  return !!(
    bank?.bank ||
    bank?.iban ||
    bank?.bic ||
    bank?.owner ||
    bank?.steuerNr ||
    bank?.ustId ||
    bank?.zahlungsziel
  );
}

/* ================= HTML BLOCKS ================= */

function renderHeader(params: {
  title?: string;
  subTitle?: string;
  logoData?: string;
  company?: any;
  docNo?: string;
  date?: string;
  period?: string;
  projectCode?: string;
}) {
  const { title, subTitle, logoData, company, docNo, date, period, projectCode } =
    params;

  return `
    <div style="border-bottom:1px solid #d8e1ea;padding-bottom:10px;margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
        <div style="flex:1;">
          <div style="font-size:22px;font-weight:800;color:#0f172a;line-height:1.1;">
            ${esc(title || "SCHLUSSRECHNUNG")}
          </div>
          ${
            subTitle
              ? `<div style="margin-top:4px;font-size:10px;color:#64748b;font-weight:600;">${esc(
                  subTitle
                )}</div>`
              : ""
          }
        </div>
        ${
          logoData
            ? `<img src="${logoData}" style="max-width:110px;max-height:50px;object-fit:contain;" />`
            : ""
        }
      </div>

      <div style="display:flex;justify-content:space-between;gap:16px;margin-top:10px;">
        <div style="flex:1;font-size:10px;line-height:1.45;color:#0f172a;">
          ${
            company?.name
              ? `<div style="font-size:12px;font-weight:800;margin-bottom:3px;">${esc(
                  company.name
                )}</div>`
              : ""
          }
          ${company?.address ? `<div>${esc(company.address)}</div>` : ""}
          ${company?.phone ? `<div>Tel: ${esc(company.phone)}</div>` : ""}
          ${company?.email ? `<div>E-Mail: ${esc(company.email)}</div>` : ""}
        </div>

        <div style="min-width:220px;font-size:10px;line-height:1.45;color:#0f172a;text-align:right;">
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

function renderCustomer(customer?: Customer) {
  if (!hasCustomer(customer)) return "";

  return `
    <div style="margin-bottom:12px;">
      <div style="font-size:12px;font-weight:800;margin-bottom:4px;color:#0f172a;">Kunde</div>
      <div style="border:1px solid #dbe3ea;border-radius:8px;padding:8px 10px;font-size:10px;line-height:1.45;color:#0f172a;background:#ffffff;">
        ${customer?.name ? `<div>${esc(customer.name)}</div>` : ""}
        ${customer?.address ? `<div>${esc(customer.address)}</div>` : ""}
        ${customer?.email ? `<div>${esc(customer.email)}</div>` : ""}
        ${customer?.phone ? `<div>${esc(customer.phone)}</div>` : ""}
      </div>
    </div>
  `;
}

function renderRows(rows: Row[]) {
  if (!rows?.length) return "";

  return `
    <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:10px;font-size:10px;color:#0f172a;">
      <thead>
        <tr style="background:#eef4f8;">
          <th style="padding:6px;border:1px solid #cfd8e3;text-align:left;width:8%;">Pos</th>
          <th style="padding:6px;border:1px solid #cfd8e3;text-align:left;width:42%;">Text</th>
          <th style="padding:6px;border:1px solid #cfd8e3;text-align:left;width:10%;">Einheit</th>
          <th style="padding:6px;border:1px solid #cfd8e3;text-align:right;width:12%;">Menge</th>
          <th style="padding:6px;border:1px solid #cfd8e3;text-align:right;width:14%;">EP</th>
          <th style="padding:6px;border:1px solid #cfd8e3;text-align:right;width:14%;">GP</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((r) => {
            const qty = num(r.qty);
            const ep = num(r.ep);
            const gp = num(r.gp ?? qty * ep);

            return `
              <tr>
                <td style="padding:6px;border:1px solid #dbe3ea;vertical-align:top;">${esc(
                  r.pos
                )}</td>
                <td style="padding:6px;border:1px solid #dbe3ea;vertical-align:top;">${esc(
                  r.text
                )}</td>
                <td style="padding:6px;border:1px solid #dbe3ea;vertical-align:top;">${esc(
                  r.unit
                )}</td>
                <td style="padding:6px;border:1px solid #dbe3ea;text-align:right;vertical-align:top;">${money(
                  qty
                )}</td>
                <td style="padding:6px;border:1px solid #dbe3ea;text-align:right;vertical-align:top;">${money(
                  ep
                )} €</td>
                <td style="padding:6px;border:1px solid #dbe3ea;text-align:right;vertical-align:top;">${money(
                  gp
                )} €</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function renderTotals(i: Input) {
  const netto = Number(i.netto || 0);
  const mwstPct = Number(i.mwstPct || 0);
  const mwstValue = Number(i.mwstValue || 0);
  const brutto = Number(i.brutto || 0);
  const bezahlt = Number(i.bezahlt || 0);
  const rest =
    i.rest !== undefined ? Number(i.rest || 0) : Math.max(0, brutto - bezahlt);

  return `
    <div style="margin-top:14px;display:flex;justify-content:flex-end;">
      <table cellspacing="0" cellpadding="0" style="min-width:330px;border-collapse:collapse;font-size:10px;color:#0f172a;">
        <tr>
          <td style="padding:6px 0;border-bottom:1px solid #e2e8f0;font-weight:600;">Netto</td>
          <td style="padding:6px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;">${money(
            netto
          )} €</td>
        </tr>
        <tr>
          <td style="padding:6px 0;border-bottom:1px solid #e2e8f0;font-weight:600;">MwSt (${money(
            mwstPct
          )}%)</td>
          <td style="padding:6px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;">${money(
            mwstValue
          )} €</td>
        </tr>
        <tr>
          <td style="padding:6px 0;border-bottom:1px solid #e2e8f0;font-weight:600;">Gesamt brutto Rechnung</td>
          <td style="padding:6px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;">${money(
            brutto
          )} €</td>
        </tr>
        <tr>
          <td style="padding:6px 0;border-bottom:1px solid #e2e8f0;font-weight:600;">Bereits bezahlt / Abschläge</td>
          <td style="padding:6px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;">${money(
            bezahlt
          )} €</td>
        </tr>
        <tr>
          <td style="padding:6px 0;border-bottom:1px solid #e2e8f0;font-weight:600;">Offener Rest</td>
          <td style="padding:6px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;">${money(
            rest
          )} €</td>
        </tr>
        <tr>
          <td style="padding:8px 0 6px 0;border-top:2px solid #dbe3ea;font-size:12px;font-weight:800;">Schlussbetrag fällig</td>
          <td style="padding:8px 0 6px 0;border-top:2px solid #dbe3ea;text-align:right;font-size:12px;font-weight:800;">${money(
            rest
          )} €</td>
        </tr>
      </table>
    </div>
  `;
}

function renderAbschlaege(lines?: string[]) {
  if (!lines?.length) return "";

  return `
    <div style="margin-top:14px;">
      <div style="font-size:11px;font-weight:800;color:#0f172a;margin-bottom:4px;">
        Abschlagsrechnungen
      </div>
      <div style="padding:8px 10px;background:#f8fafc;border:1px solid #dbe3ea;border-radius:8px;font-size:10px;line-height:1.45;color:#0f172a;">
        ${lines.map((l) => `<div>${esc(l)}</div>`).join("")}
      </div>
    </div>
  `;
}

function renderBank(bank?: Bank) {
  if (!hasBank(bank)) return "";

  return `
    <div style="margin-top:14px;">
      <div style="font-size:11px;font-weight:800;color:#0f172a;margin-bottom:4px;">Bank / Steuer</div>
      <div style="font-size:10px;line-height:1.45;color:#0f172a;">
        ${bank?.bank ? `<div>${esc(bank.bank)}</div>` : ""}
        ${bank?.iban ? `<div>IBAN: ${esc(bank.iban)}</div>` : ""}
        ${bank?.bic ? `<div>BIC: ${esc(bank.bic)}</div>` : ""}
        ${bank?.owner ? `<div>Kontoinhaber: ${esc(bank.owner)}</div>` : ""}
        ${bank?.steuerNr ? `<div>SteuerNr: ${esc(bank.steuerNr)}</div>` : ""}
        ${bank?.ustId ? `<div>USt-ID: ${esc(bank.ustId)}</div>` : ""}
        ${
          bank?.zahlungsziel
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
    <div style="margin-top:14px;padding:8px 10px;background:#f8fafc;border:1px solid #dbe3ea;border-radius:8px;font-size:10px;line-height:1.45;color:#0f172a;">
      ${esc(note)}
    </div>
  `;
}

function renderSignature() {
  return `
    <div style="margin-top:24px;display:flex;justify-content:space-between;gap:24px;">
      <div style="width:42%;border-top:1px solid #9aa7b4;padding-top:5px;font-size:10px;color:#334155;">
        Ort / Datum
      </div>
      <div style="width:42%;border-top:1px solid #9aa7b4;padding-top:5px;font-size:10px;color:#334155;">
        Unterschrift
      </div>
    </div>
  `;
}

/* ================= MAIN ================= */

export async function buildSchlussrechnungPdf(input: Input) {
  const company = await getCompanyHeaderCached().catch(() => null);
  const logo = await getCompanyLogoUriCached().catch(() => null);
  const logoData = await toDataUri(logo);

  const html = `
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
        ${renderHeader({
          title: input.title || "SCHLUSSRECHNUNG",
          subTitle: input.subTitle,
          logoData,
          company,
          docNo: input.docNo,
          date: input.date,
          period: input.period,
          projectCode: input.projectCode,
        })}

        ${renderCustomer(input.customer)}
        ${renderRows(input.rows || [])}
        ${renderTotals(input)}
        ${renderAbschlaege(input.abschlagLines)}
        ${renderBank(input.bank)}
        ${renderNote(input.note)}
        ${renderSignature()}
      </body>
    </html>
  `;

  const tmp = await Print.printToFileAsync({ html });
  const dir = await ensureDir(input.projectCode);
  const finalPath = `${dir}${input.fileName}`;

  const oldInfo = await FileSystem.getInfoAsync(finalPath);
  if (oldInfo.exists) {
    await FileSystem.deleteAsync(finalPath, { idempotent: true });
  }

  await FileSystem.copyAsync({
    from: tmp.uri,
    to: finalPath,
  });

  if (input.shareAfterCreate) {
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(finalPath, {
        mimeType: "application/pdf",
        dialogTitle: input.fileName,
        UTI: "com.adobe.pdf",
      });
    }
  }

  return { pdfUri: finalPath, html };
}


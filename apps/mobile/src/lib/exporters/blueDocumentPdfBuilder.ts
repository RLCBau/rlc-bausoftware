import * as Print from "expo-print";
import * as FileSystem from "expo-file-system/legacy";
import { RLC_PDF_FONT_STACK, loadRlcPdfBranding } from "./pdfBranding";
import type { PdfRow } from "./documentPdfBuilder";
import { renderMobilePdfViaServer, type MobilePdfDocumentType } from "../mobilePdfCore";

type Input = {
  projectCode: string;
  fileName: string;
  title: string;
  /**
   * Optional because older callers already use this builder.  The inference
   * below keeps those callers compatible while still sending the exact module
   * to the central server renderer.
   */
  documentType?: MobilePdfDocumentType;
  date?: string;
  docNo?: string;
  customerName?: string;
  rows: PdfRow[];
  note?: string;
};

function resolveDocumentType(input: Input): MobilePdfDocumentType {
  if (input.documentType) return input.documentType;

  const text = `${input.title} ${input.fileName}`.toUpperCase();
  if (text.includes("ARBEITSZEIT")) return "ARBEITSZEIT";
  if (text.includes("BAUTAGEBUCH")) return "BAUTAGEBUCH";
  return "MENGENERMITTLUNG";
}

const esc = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const amount = (value: unknown) => Number(String(value ?? 0).replace(",", ".") || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function directory(projectCode: string) {
  const base = FileSystem.documentDirectory || FileSystem.cacheDirectory || "";
  const dir = `${base}rlc-pdfs/${String(projectCode || "Projekt").replace(/[^a-zA-Z0-9_-]/g, "_")}/`;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  return dir;
}

/** Exact RLC document shell used for the Mengenermittlung-style PDFs. */
export async function buildBlueDocumentPdf(input: Input) {
  const documentType = resolveDocumentType(input);

  // The same endpoint used by the other current mobile PDF modules.  This is
  // intentionally before the local template: with SERVER_SYNC a successful
  // call means the PDF was rendered by the RLC server, not by Expo.
  try {
    const serverResult = await renderMobilePdfViaServer({
      documentType,
      projectFsKey: input.projectCode,
      fileName: input.fileName,
      payload: {
        type: documentType,
        projectCode: input.projectCode,
        fileName: input.fileName,
        title: input.title,
        docNo: input.docNo,
        date: input.date,
        customer: { name: input.customerName || "" },
        rows: input.rows,
        note: input.note || "",
      },
    });

    return { pdfUri: serverResult.pdfUri, html: "", source: "server" as const };
  } catch (error: any) {
    console.log(
      `[RLC PDF CORE] ${documentType} server renderer unavailable; using local Mengenermittlung template:`,
      String(error?.message || error)
    );
  }

  const branding = await loadRlcPdfBranding();
  const date = String(input.date || new Date().toISOString().slice(0, 10));
  const total = input.rows.reduce((sum, row) => sum + Number(row.gp ?? 0), 0);
  const logo = branding.logoDataUri
    ? `<img src="${branding.logoDataUri}" style="width:50px;height:50px;object-fit:cover;border-radius:6px;background:#fff" />`
    : `<div style="width:50px;height:50px;border-radius:6px;background:#fff"></div>`;
  const tableRows = input.rows.map((row, index) => `
    <tr><td>${esc(row.pos || index + 1)}</td><td>${esc(row.text)}</td><td>${esc(row.unit)}</td><td class="n">${row.qty === "" || row.qty == null ? "" : esc(row.qty)}</td><td class="n">${row.ep == null ? "" : `${amount(row.ep)} €`}</td><td class="n">${row.gp == null ? "" : `${amount(row.gp)} €`}</td></tr>`).join("") || `<tr><td colspan="6" class="muted">Keine Einträge vorhanden</td></tr>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"/><style>
    @page{size:A4;margin:12mm 12mm 18mm} html,body{margin:0;padding:0} body{font-family:${RLC_PDF_FONT_STACK};color:#17233a;font-size:10px}
    .blue{background:#214db3;color:#fff;border-radius:13px;padding:16px 18px;display:flex;align-items:center;gap:14px}.blue .name{font-size:22px;font-weight:800}.blue .sub{font-size:10px;margin-top:6px}.blue .company{margin-left:auto;text-align:right;font-size:9px;line-height:1.5}.blue .company b{font-size:12px}
    .meta{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin:16px 0}.box{border:1px solid #d4dfef;border-radius:8px;background:#f6f8fc;padding:10px}.label{font-size:8px;font-weight:800;color:#64748b;text-transform:uppercase}.value{font-size:11px;font-weight:700;margin-top:6px}
    h2{font-size:13px;color:#123f98;border-bottom:1px solid #d8e4f3;padding-bottom:8px;margin:18px 0 10px}table{width:100%;border-collapse:collapse;font-size:9px}th{background:#e8effc;color:#174196;text-align:left;padding:9px 6px;font-weight:800}td{padding:8px 6px;border-bottom:1px solid #dbe5f1;vertical-align:top}.n{text-align:right}.muted{color:#64748b}.note{margin-top:12px;border:1px solid #d4dfef;border-radius:7px;padding:9px;color:#334155;white-space:pre-wrap}.footer{position:fixed;bottom:-12mm;left:0;right:0;border-top:1px solid #d8e1ea;padding-top:4px;color:#64748b;font-size:8px;display:flex;justify-content:space-between}.page:after{content:counter(page)}
  </style></head><body>
  <div class="blue">${logo}<div><div class="name">${esc(input.title)}</div><div class="sub">Projekt ${esc(input.projectCode)} · ${esc(date)}</div></div><div class="company"><b>${esc(branding.companyName)}</b><br/>${esc(branding.address)}<br/>${esc(branding.phone)}${branding.email ? `<br/>${esc(branding.email)}` : ""}</div></div>
  <div class="meta"><div class="box"><div class="label">Dokument Nr.</div><div class="value">${esc(input.docNo || "—")}</div></div><div class="box"><div class="label">Projekt</div><div class="value">${esc(input.projectCode)}</div></div><div class="box"><div class="label">Mitarbeiter / Kunde</div><div class="value">${esc(input.customerName || "—")}</div></div><div class="box"><div class="label">Datum</div><div class="value">${esc(date)}</div></div></div>
  <h2>${esc(input.title)}</h2><table><thead><tr><th style="width:8%">Pos.</th><th>Leistungsbeschreibung</th><th style="width:10%">ME</th><th style="width:12%;text-align:right">Menge</th><th style="width:15%;text-align:right">EP</th><th style="width:15%;text-align:right">GP</th></tr></thead><tbody>${tableRows}</tbody></table>${input.note ? `<div class="note">${esc(input.note)}</div>` : ""}
  <div class="footer"><span>${esc(branding.companyName || "RLC Bausoftware")} · ${esc(input.title)} · ${esc(input.projectCode)} · ${esc(date)}</span><span>Seite <span class="page"></span></span></div>
  </body></html>`;
  const temp = await Print.printToFileAsync({ html });
  const target = `${await directory(input.projectCode)}${input.fileName}`;
  const old = await FileSystem.getInfoAsync(target);
  if (old.exists) await FileSystem.deleteAsync(target, { idempotent: true });
  await FileSystem.copyAsync({ from: temp.uri, to: target });
  return { pdfUri: target, html, source: "local" as const };
}

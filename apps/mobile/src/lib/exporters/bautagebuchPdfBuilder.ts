import { renderMobilePdfViaServer } from "../mobilePdfCore";
// apps/mobile/src/lib/exporters/bautagebuchPdfBuilder.ts
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Linking } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import {
  RLC_PDF_FONT_STACK,
  loadRlcPdfBranding,
  renderRlcPdfCompanyHeader,
} from "./pdfBranding";

export type BautagebuchRow = {
  id: string;
  projectId: string;
  projectCode: string;
  date: string;
  weather?: string;
  temperature?: string;
  workers?: string;
  machines?: string;
  workDone?: string;
  issues?: string;
  notes?: string;
  attachments?: any[];
  createdAt?: number;
  updatedAt?: number;
};

export type BuildBautagebuchPdfInput = {
  projectFsKey: string;
  projectTitle?: string;
  monthLabel?: string;
  rows: BautagebuchRow[];
  filenameHint?: string;
};

export type BuildBautagebuchPdfResult = {
  pdfUri: string;
  fileName: string;
  date: string;
};

function ymdNow() {
  return new Date().toISOString().slice(0, 10);
}

function esc(v: any) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function nl2br(v: any) {
  return esc(v).replace(/\n/g, "<br/>");
}

function formatDateDe(v?: string) {
  const s = String(v || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || "—";
  const [y, m, d] = s.split("-");
  return `${d}.${m}.${y}`;
}

function fileNameSafe(v: string) {
  return String(v || "")
    .trim()
    .replace(/[\/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

function sortRows(rows: BautagebuchRow[]) {
  return [...rows].sort((a, b) => {
    const ad = String(a?.date || "");
    const bd = String(b?.date || "");
    if (ad < bd) return -1;
    if (ad > bd) return 1;
    return Number(a?.createdAt || 0) - Number(b?.createdAt || 0);
  });
}

async function logoUriToDataUri(uri?: string | null): Promise<string> {
  const src = String(uri || "").trim();
  if (!src) return "";

  try {
    if (src.startsWith("data:")) return src;

    const b64 = await FileSystem.readAsStringAsync(src, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const lower = src.toLowerCase();
    const mime = lower.endsWith(".png")
      ? "image/png"
      : lower.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";

    return `data:${mime};base64,${b64}`;
  } catch {
    return "";
  }
}

function buildCoverHtml(params: {
  companyHeaderHtml: string;
  projectTitle: string;
  projectFsKey: string;
  monthLabel?: string;
  rowCount: number;
}) {
  const { companyHeaderHtml, projectTitle, projectFsKey, monthLabel, rowCount } = params;

  return `
    <section class="cover page-break">
      <div class="page-company-header">${companyHeaderHtml}</div>
      <div class="cover-main">
        <div class="cover-kicker">Baustellendokumentation</div>
        <h1>Bautagebuch</h1>
        <div class="cover-project">${esc(projectTitle || "Projekt")}</div>

        <div class="cover-grid">
          <div class="cover-card">
            <div class="cover-label">Projektcode</div>
            <div class="cover-value">${esc(projectFsKey)}</div>
          </div>

          <div class="cover-card">
            <div class="cover-label">Zeitraum</div>
            <div class="cover-value">${esc(monthLabel || "Gesamter Zeitraum")}</div>
          </div>

          <div class="cover-card">
            <div class="cover-label">Einträge</div>
            <div class="cover-value">${esc(String(rowCount))}</div>
          </div>

          <div class="cover-card">
            <div class="cover-label">Erstellt am</div>
            <div class="cover-value">${esc(formatDateDe(ymdNow()))}</div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function buildDayHtml(row: BautagebuchRow, idx: number, companyHeaderHtml: string) {
  const weatherLine = [row.weather, row.temperature].filter(Boolean).join(" • ");

  return `
    <section class="day page-break">
      <div class="page-company-header">${companyHeaderHtml}</div>
      <div class="day-head">
        <div>
          <div class="day-kicker">Tagesbericht ${idx + 1}</div>
          <h2>${esc(formatDateDe(row.date))}</h2>
        </div>
        <div class="day-date-box">${esc(row.date || "—")}</div>
      </div>

      <div class="grid two">
        <div class="field">
          <div class="field-label">Wetter</div>
          <div class="field-value">${esc(weatherLine || "—")}</div>
        </div>
        <div class="field">
          <div class="field-label">Mitarbeiter</div>
          <div class="field-value">${esc(row.workers || "—")}</div>
        </div>
      </div>

      <div class="grid two">
        <div class="field">
          <div class="field-label">Maschinen / Geräte</div>
          <div class="field-value">${esc(row.machines || "—")}</div>
        </div>
        <div class="field">
          <div class="field-label">Letzte Änderung</div>
          <div class="field-value">${
            row.updatedAt
              ? esc(new Date(row.updatedAt).toLocaleDateString("de-DE"))
              : "—"
          }</div>
        </div>
      </div>

      <div class="block">
        <div class="block-title">Ausgeführte Arbeiten</div>
        <div class="block-body">${nl2br(row.workDone || "—")}</div>
      </div>

      <div class="block">
        <div class="block-title">Besondere Vorkommnisse</div>
        <div class="block-body">${nl2br(row.issues || "—")}</div>
      </div>

      <div class="block">
        <div class="block-title">Zusätzliche Notizen</div>
        <div class="block-body">${nl2br(row.notes || "—")}</div>
      </div>
    </section>
  `;
}

function buildHtml(params: {
  companyName: string;
  companyHeaderHtml: string;
  projectTitle: string;
  projectFsKey: string;
  monthLabel?: string;
  rows: BautagebuchRow[];
}) {
  const { companyName, companyHeaderHtml, projectTitle, projectFsKey, monthLabel, rows } = params;

  const cover = buildCoverHtml({
    companyHeaderHtml,
    projectTitle,
    projectFsKey,
    monthLabel,
    rowCount: rows.length,
  });

  const days = rows.map((r, i) => buildDayHtml(r, i, companyHeaderHtml)).join("");

  return `
  <!DOCTYPE html>
  <html lang="de">
    <head>
      <meta charset="utf-8" />
      <title>Bautagebuch</title>
      <style>
        @page {
          size: A4;
          margin: 14mm 16mm 18mm 16mm;
        }

        body {
          font-family: ${RLC_PDF_FONT_STACK};
          color: #0B1720;
          font-size: 12px;
          line-height: 1.45;
        }

        .page-break {
          page-break-after: always;
        }

        .page-break:last-child {
          page-break-after: auto;
        }

        .page-company-header {
          width: 100%;
          margin: 0 0 10px 0;
          page-break-inside: avoid;
        }

        .page-company-header > div {
          width: 100%;
          margin: 0 !important;
        }

        .global-footer {
          position: fixed;
          left: 0;
          right: 0;
          bottom: -12mm;
          display: flex;
          justify-content: space-between;
          border-top: 1px solid #DDE7EF;
          padding-top: 4px;
          color: #64748B;
          font-size: 8px;
        }

        .page-number::after { content: counter(page); }

        .cover-top {
          display: flex;
          align-items: center;
          gap: 16px;
          border-bottom: 1px solid #DDE7EF;
          padding-bottom: 16px;
        }

        .logo {
          width: 72px;
          height: 72px;
          object-fit: contain;
        }

        .logo-placeholder {
          width: 72px;
          height: 72px;
          border-radius: 14px;
          background: #EEF4F8;
          border: 1px solid #DDE7EF;
        }

        .company-box {
          flex: 1;
        }

        .company-name {
          font-size: 18px;
          font-weight: 800;
          color: #12324A;
        }

        .company-line {
          margin-top: 4px;
          color: #516170;
          font-size: 11px;
        }

        .cover-main {
          padding-top: 18px;
        }

        .cover-kicker {
          color: #0F766E;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        h1 {
          margin: 10px 0 0 0;
          font-size: 34px;
          line-height: 1.1;
          color: #0B1720;
        }

        .cover-project {
          margin-top: 10px;
          font-size: 18px;
          font-weight: 700;
          color: #334155;
        }

        .cover-grid {
          margin-top: 28px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .cover-card,
        .field,
        .block {
          border: 1px solid #DDE7EF;
          border-radius: 14px;
          background: #FFFFFF;
        }

        .cover-card {
          padding: 14px;
        }

        .cover-label,
        .field-label {
          color: #64748B;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .cover-value {
          margin-top: 8px;
          color: #0B1720;
          font-size: 16px;
          font-weight: 800;
        }

        .day-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          border-bottom: 1px solid #DDE7EF;
          padding-bottom: 12px;
          margin-bottom: 16px;
        }

        .day-kicker {
          color: #0F766E;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        h2 {
          margin: 6px 0 0 0;
          font-size: 24px;
          color: #0B1720;
        }

        .day-date-box {
          border: 1px solid #DDE7EF;
          border-radius: 999px;
          padding: 8px 12px;
          font-weight: 700;
          color: #334155;
          background: #F8FBFD;
        }

        .grid.two {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 12px;
        }

        .field {
          padding: 12px;
        }

        .field-value {
          margin-top: 6px;
          color: #0B1720;
          font-size: 13px;
          font-weight: 700;
          white-space: pre-wrap;
        }

        .block {
          margin-top: 12px;
          overflow: hidden;
        }

        .block-title {
          padding: 10px 12px;
          background: #F8FBFD;
          border-bottom: 1px solid #DDE7EF;
          color: #12324A;
          font-size: 12px;
          font-weight: 800;
        }

        .block-body {
          padding: 12px;
          color: #0B1720;
          min-height: 58px;
          white-space: normal;
          word-break: break-word;
        }
      </style>
    </head>
    <body>
      <div class="global-footer">
        <span>${esc(companyName || "RLC Bausoftware")} · ${esc(projectFsKey)}</span>
        <span>Seite <span class="page-number"></span></span>
      </div>
      ${cover}
      ${days}
    </body>
  </html>
  `;
}

export async function buildBautagebuchPdf(
  input: BuildBautagebuchPdfInput
): Promise<BuildBautagebuchPdfResult> {
  try {
    const serverResult = await renderMobilePdfViaServer({
      documentType: "BAUTAGEBUCH",
      projectFsKey: input.projectFsKey,
      fileName: String(input.filenameHint || `Bautagebuch_${input.projectFsKey}.pdf`),
      payload: input,
    });
    return serverResult;
  } catch (error: any) {
    console.log("[RLC PDF CORE] Bautagebuch fallback lokal:", String(error?.message || error));
  }

  const rows = sortRows(Array.isArray(input.rows) ? input.rows : []);
  if (!rows.length) {
    throw new Error("Keine Tagesberichte für den PDF-Export gefunden.");
  }

  const date = ymdNow();

  const branding = await loadRlcPdfBranding();
  const companyName = branding.companyName;
  const companyHeaderHtml = renderRlcPdfCompanyHeader(branding);

  const projectTitle = String(input.projectTitle || "Projekt").trim() || "Projekt";
  const fileName =
    fileNameSafe(
      input.filenameHint ||
        `Bautagebuch_${input.projectFsKey}_${input.monthLabel || date}`
    ) + ".pdf";

  const html = buildHtml({
    companyName,
    companyHeaderHtml,
    projectTitle,
    projectFsKey: String(input.projectFsKey || "").trim(),
    monthLabel: String(input.monthLabel || "").trim() || undefined,
    rows,
  });

  const out = await Print.printToFileAsync({
    html,
    base64: false,
  });

  return {
    pdfUri: out.uri,
    fileName,
    date,
  };
}

export async function openBautagebuchPdf(result: any) {
  const uri = String(result?.pdfUri || result?.uri || result || "").trim();

  if (!uri) {
    throw new Error("PDF konnte nicht geöffnet werden: URI fehlt.");
  }

  await Linking.openURL(uri);
}



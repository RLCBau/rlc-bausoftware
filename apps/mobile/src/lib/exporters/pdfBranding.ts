import * as FileSystem from "expo-file-system/legacy";
import {
  getCompanyHeaderCached,
  getCompanyLogoUriCached,
  syncCompanyHeaderAndLogo,
} from "../companyCache";

export const RLC_PDF_FONT_STACK = "Arial, Helvetica, sans-serif";

export type RlcPdfBranding = {
  company: any;
  logoDataUri: string;
  companyName: string;
  address: string;
  phone: string;
  email: string;
};

function esc(v: any) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function toDataUri(uri?: string | null): Promise<string> {
  const src = String(uri || "").trim();
  if (!src) return "";
  if (src.startsWith("data:image/")) return src;

  try {
    const base64 = await FileSystem.readAsStringAsync(src, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const lower = src.toLowerCase();
    const mime = lower.endsWith(".png")
      ? "image/png"
      : lower.endsWith(".webp")
      ? "image/webp"
      : lower.endsWith(".svg")
      ? "image/svg+xml"
      : "image/jpeg";

    return `data:${mime};base64,${base64}`;
  } catch {
    return "";
  }
}

function normalizeCompany(header: any) {
  const companyName = String(
    header?.name ||
      header?.companyName ||
      header?.title ||
      header?.firma ||
      header?.company ||
      "RLC Bausoftware"
  ).trim() || "RLC Bausoftware";

  const zipCity = [
    header?.zip || header?.postalCode || header?.plz || "",
    header?.city || header?.ort || "",
  ]
    .filter(Boolean)
    .join(" ");

  const address = String(
    header?.address ||
      header?.fullAddress ||
      header?.anschrift ||
      [header?.street || header?.strasse || "", header?.zipCity || zipCity]
        .filter(Boolean)
        .join(", ") ||
      ""
  ).trim();

  const phone = String(
    header?.phone || header?.telefon || header?.tel || ""
  ).trim();

  const email = String(
    header?.email || header?.mail || header?.eMail || ""
  ).trim();

  return { companyName, address, phone, email };
}

export async function loadRlcPdfBranding(): Promise<RlcPdfBranding> {
  let company = await getCompanyHeaderCached().catch(() => null);
  let logoUri = await getCompanyLogoUriCached().catch(() => null);

  if (!company || !logoUri) {
    try {
      const synced = await syncCompanyHeaderAndLogo();
      company = synced?.header || company || null;
      logoUri = synced?.logoUri || logoUri || null;
    } catch {
      // Cache fallback below.
    }
  }

  const logoDataUri = await toDataUri(logoUri);
  const normalized = normalizeCompany(company);

  return {
    company: company || { name: normalized.companyName },
    logoDataUri,
    ...normalized,
  };
}

/**
 * Einheitliche Firmenzeile für alle mobilen PDF-Generatoren.
 * Inline styles vermeiden Abweichungen zwischen expo-print und WebView.
 */
export function renderRlcPdfCompanyHeader(
  branding: Pick<
    RlcPdfBranding,
    "logoDataUri" | "companyName" | "address" | "phone" | "email"
  >
) {
  const info = [
    branding.address,
    branding.phone ? `Tel: ${branding.phone}` : "",
    branding.email ? `E-Mail: ${branding.email}` : "",
  ].filter(Boolean);

  return `
    <div style="display:flex;align-items:flex-start;gap:12px;border-bottom:1px solid #d8e1ea;padding:0 0 8px 0;margin:0 0 10px 0;box-sizing:border-box;min-height:24mm;">
      <div style="width:34mm;min-width:34mm;display:flex;align-items:flex-start;justify-content:flex-start;">
        ${
          branding.logoDataUri
            ? `<img src="${branding.logoDataUri}" style="display:block;max-width:31mm;max-height:18mm;object-fit:contain;" />`
            : `<div style="width:31mm;height:18mm;border:1px solid #d8e1ea;border-radius:6px;background:#f8fafc;"></div>`
        }
      </div>
      <div style="flex:1;min-width:0;color:#0f172a;font-family:${RLC_PDF_FONT_STACK};font-size:9px;line-height:1.35;">
        <div style="font-size:12px;font-weight:800;margin-bottom:2px;">${esc(
          branding.companyName || "RLC Bausoftware"
        )}</div>
        ${info.map((line) => `<div>${esc(line)}</div>`).join("")}
      </div>
    </div>
  `;
}

export function renderRlcPdfFooter(projectCode: string, companyName?: string) {
  return `
    <div class="rlc-pdf-footer">
      <span>${esc(companyName || "RLC Bausoftware")} · ${esc(
        projectCode || "Projekt"
      )}</span>
      <span>Seite <span class="rlc-pdf-page-number"></span></span>
    </div>
  `;
}

export const RLC_PDF_FOOTER_CSS = `
  .rlc-pdf-footer {
    position: fixed;
    bottom: -12mm;
    left: 0;
    right: 0;
    display: flex;
    justify-content: space-between;
    border-top: 1px solid #d8e1ea;
    padding-top: 4px;
    color: #64748b;
    font-family: ${RLC_PDF_FONT_STACK};
    font-size: 8px;
  }
  .rlc-pdf-page-number::after { content: counter(page); }
`;

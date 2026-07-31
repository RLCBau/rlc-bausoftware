import type { Request } from "express";
import type { RlcPdfCompany } from "./rlcPdfCore";

function text(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  return "";
}

function first(...values: unknown[]): string {
  for (const value of values) {
    const result = text(value);
    if (result) return result;
  }
  return "";
}

function unwrap(payload: any): any {
  let current = payload;
  for (let index = 0; index < 5; index++) {
    if (!current || typeof current !== "object") break;
    const next =
      current.company ||
      current.header ||
      current.data ||
      current.profile ||
      current.settings;
    if (!next || next === current) break;
    current = next;
  }
  return current && typeof current === "object" ? current : {};
}

function forwardedHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  for (const name of [
    "authorization",
    "cookie",
    "x-company-id",
    "x-rlc-company-id",
    "x-tenant-id",
    "x-request-id",
  ]) {
    const raw = req.headers[name];
    if (Array.isArray(raw)) headers[name] = raw.join(",");
    else if (raw) headers[name] = String(raw);
  }
  return headers;
}

async function fetchInternal(req: Request, endpoints: string[]): Promise<Response | null> {
  const base = `http://127.0.0.1:${process.env.PORT || 4000}`;
  const headers = forwardedHeaders(req);

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${base}${endpoint}`, { headers });
      if (response.ok) return response;
    } catch (error) {
      console.warn(`[RLC PDF] Company endpoint ${endpoint} nicht erreichbar`, error);
    }
  }

  return null;
}

export async function loadRlcPdfCompanyFromRequest(
  req: Request
): Promise<RlcPdfCompany | undefined> {
  const headerResponse = await fetchInternal(req, [
    "/api/company/header",
    "/api/company/admin/header",
    "/api/company/admin/dashboard",
  ]);

  let rawHeader: any = {};
  if (headerResponse) {
    try {
      rawHeader = await headerResponse.json();
    } catch {
      rawHeader = {};
    }
  }

  const source = unwrap(rawHeader);
  const address =
    source?.address && typeof source.address === "object" ? source.address : {};

  let logoDataUrl = first(
    source?.logoDataUrl,
    source?.logo?.dataUrl,
    source?.branding?.logoDataUrl
  );

  if (!logoDataUrl) {
    const logoResponse = await fetchInternal(req, [
      "/api/company/logo",
      "/api/company/admin/logo",
    ]);

    if (logoResponse) {
      try {
        const contentType = logoResponse.headers.get("content-type") || "image/png";
        const logoBuffer = Buffer.from(await logoResponse.arrayBuffer());
        if (logoBuffer.length > 0) {
          logoDataUrl = `data:${contentType};base64,${logoBuffer.toString("base64")}`;
        }
      } catch (error) {
        console.warn("[RLC PDF] Firmenlogo konnte nicht gelesen werden", error);
      }
    }
  }

  const company: RlcPdfCompany = {
    name: first(
      source?.name,
      source?.companyName,
      source?.firmenname,
      source?.firma,
      source?.legalName
    ),
    legalName: first(source?.legalName, source?.companyLegalName),
    street: first(
      source?.street,
      source?.strasse,
      source?.adresse,
      typeof source?.address === "string" ? source.address : "",
      address?.street,
      address?.addressLine1
    ),
    postalCode: first(
      source?.postalCode,
      source?.zip,
      source?.plz,
      address?.postalCode,
      address?.zip
    ),
    city: first(source?.city, source?.ort, address?.city),
    country: first(source?.country, source?.land, address?.country),
    phone: first(source?.phone, source?.telefon, source?.contact?.phone),
    mobile: first(source?.mobile, source?.mobil, source?.contact?.mobile),
    email: first(source?.email, source?.mail, source?.contact?.email),
    website: first(source?.website, source?.web, source?.url),
    taxNumber: first(source?.taxNumber, source?.steuernummer),
    vatId: first(source?.vatId, source?.ustId, source?.ustIdNr),
    iban: first(source?.iban, source?.bank?.iban),
    bic: first(source?.bic, source?.bank?.bic),
    bankName: first(source?.bankName, source?.bank?.name),
    managingDirector: first(
      source?.managingDirector,
      source?.geschaeftsfuehrer,
      source?.owner
    ),
    logoDataUrl,
  };

  const useful = Boolean(
    company.name || company.street || company.phone || company.email || company.logoDataUrl
  );

  console.log("[RLC PDF] Firmendaten", {
    loaded: useful,
    name: company.name || null,
    hasAddress: Boolean(company.street || company.city),
    hasPhone: Boolean(company.phone || company.mobile),
    hasEmail: Boolean(company.email),
    hasLogo: Boolean(company.logoDataUrl),
  });

  return useful ? company : undefined;
}

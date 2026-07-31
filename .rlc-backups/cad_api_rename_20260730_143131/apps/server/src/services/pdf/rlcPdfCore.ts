import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";

export type RlcPdfCompany = {
  name?: string;
  legalName?: string;
  street?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  website?: string;
  taxNumber?: string;
  vatId?: string;
  iban?: string;
  bic?: string;
  bankName?: string;
  managingDirector?: string;
  logoPath?: string;
  logoDataUrl?: string;
  [key: string]: any;
};

export type RlcPdfAsset = {
  id?: string;
  name?: string;
  dataUrl?: string;
  url?: string;
  uri?: string;
  filePath?: string;
  localPath?: string;
  path?: string;
  publicUrl?: string;
  storagePath?: string;
  storageKey?: string;
  type?: string;
  mime?: string;
  [key: string]: any;
};

export type RlcPdfDocumentOptions = {
  pdfPath: string;
  title: string;
  documentType: string;
  projectId?: string;
  projectName?: string;
  date?: string;
  company?: RlcPdfCompany;
  subject?: string;
};

export const RLC_PDF_THEME = {
  blue: "#1546B8",
  blueDark: "#0B2F7F",
  blueSoft: "#EAF1FF",
  text: "#14213D",
  muted: "#5E6B85",
  line: "#D8E1F0",
  background: "#F6F8FC",
  white: "#FFFFFF",
  marginX: 34,
  headerTop: 28,
  headerHeight: 76,
  contentBottomPadding: 82,
} as const;

export function rlcText(value: any): string {
  return String(value ?? "").trim();
}

export function rlcFirstText(...values: any[]): string {
  for (const value of values) {
    const result = rlcText(value);
    if (result) return result;
  }
  return "";
}

export function rlcNumber(value: any): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function rlcGermanNumber(value: any): string {
  const parsed = rlcNumber(value);
  return parsed.toLocaleString("de-DE", {
    minimumFractionDigits: Number.isInteger(parsed) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function rlcGermanDate(value: any): string {
  const raw = rlcText(value).slice(0, 10);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : raw;
}

function readJson(filePath: string): any | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function nested(source: any, keys: string[]): any {
  for (const key of keys) {
    let current = source;
    for (const part of key.split(".")) current = current?.[part];
    if (current !== undefined && current !== null && rlcText(current)) return current;
  }
  return undefined;
}

export type RlcPdfPathContext = {
  pdfPath: string;
  dataRoot: string;
  projectsRoot: string;
  projectRoot: string;
  projectKey: string;
};

export function resolveRlcPdfPathContext(pdfPath: string): RlcPdfPathContext {
  const absolute = path.resolve(pdfPath);
  const parts = absolute.split(path.sep);
  let projectsIndex = -1;

  for (let index = parts.length - 1; index >= 0; index--) {
    if (parts[index] === "projects") {
      projectsIndex = index;
      break;
    }
  }

  if (projectsIndex >= 0 && parts[projectsIndex + 1]) {
    const prefix = parts.slice(0, projectsIndex + 1).join(path.sep) || path.sep;
    const projectsRoot = path.resolve(prefix);
    const projectKey = parts[projectsIndex + 1];
    return {
      pdfPath: absolute,
      dataRoot: path.dirname(projectsRoot),
      projectsRoot,
      projectRoot: path.join(projectsRoot, projectKey),
      projectKey,
    };
  }

  const projectRoot = path.dirname(path.dirname(absolute));
  const projectsRoot = path.dirname(projectRoot);
  return {
    pdfPath: absolute,
    dataRoot: path.dirname(projectsRoot),
    projectsRoot,
    projectRoot,
    projectKey: path.basename(projectRoot),
  };
}

function dataUrlBuffer(value?: string): Buffer | null {
  const raw = rlcText(value);
  const match = raw.match(/^data:[^;]+;base64,(.+)$/i);
  if (!match) return null;
  try {
    return Buffer.from(match[1], "base64");
  } catch {
    return null;
  }
}

function resolveStoredLogo(dataRoot: string): string | undefined {
  const direct = [
    path.join(dataRoot, "company", "logo.png"),
    path.join(dataRoot, "company", "logo.jpg"),
    path.join(dataRoot, "company", "logo.jpeg"),
    path.join(dataRoot, "company", "logo.webp"),
    path.join(dataRoot, "company", "admin", "logo.png"),
    path.join(dataRoot, "company", "admin", "logo.jpg"),
    path.join(dataRoot, "company", "admin", "logo.jpeg"),
    path.join(dataRoot, "company", "admin", "logo.webp"),
    "/app/data/company/logo.png",
    "/app/data/company/logo.jpg",
    "/app/data/company/logo.jpeg",
    "/app/data/company/logo.webp",
    "/app/data/company/admin/logo.png",
    "/app/data/company/admin/logo.jpg",
  ];

  const found = direct.find((candidate) => fs.existsSync(candidate));
  if (found) return found;

  const companyDir = path.join(dataRoot, "company");
  if (!fs.existsSync(companyDir)) return undefined;

  const queue = [{ dir: companyDir, depth: 0 }];
  while (queue.length) {
    const current = queue.shift()!;
    if (current.depth > 3) continue;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current.dir, entry.name);
      if (entry.isDirectory()) {
        queue.push({ dir: full, depth: current.depth + 1 });
        continue;
      }
      if (/logo/i.test(entry.name) && /\.(png|jpe?g|webp)$/i.test(entry.name)) return full;
    }
  }

  return undefined;
}

export function resolveRlcCompany(
  pdfPath: string,
  override?: RlcPdfCompany
): RlcPdfCompany {
  const context = resolveRlcPdfPathContext(pdfPath);
  const dataRoot = context.dataRoot;
  const candidates = [
    path.join(dataRoot, "company", "admin", "header.json"),
    path.join(dataRoot, "company", "header.json"),
    path.join(dataRoot, "company", "admin.json"),
    path.join(dataRoot, "company", "profile.json"),
    path.join(dataRoot, "settings", "company.json"),
    path.join(dataRoot, "company.json"),
    "/app/data/company/admin/header.json",
    "/app/data/company/header.json",
    "/app/data/company/admin.json",
    "/app/data/company/profile.json",
    "/app/data/company.json",
  ];

  const stored = candidates.map(readJson).find(Boolean) || {};
  const source = stored?.company || stored?.header || stored?.data || stored;

  const company: RlcPdfCompany = {
    name: rlcFirstText(
      override?.name,
      override?.legalName,
      process.env.COMPANY_NAME,
      nested(source, ["name", "companyName", "firma", "legalName"]),
      "LoCurto"
    ),
    legalName: rlcFirstText(override?.legalName, nested(source, ["legalName", "companyLegalName"])),
    street: rlcFirstText(
      override?.street,
      process.env.COMPANY_STREET,
      nested(source, ["street", "strasse", "address.street", "addressLine1"])
    ),
    postalCode: rlcFirstText(
      override?.postalCode,
      process.env.COMPANY_POSTAL_CODE,
      nested(source, ["postalCode", "zip", "plz", "address.postalCode"])
    ),
    city: rlcFirstText(
      override?.city,
      process.env.COMPANY_CITY,
      nested(source, ["city", "ort", "address.city"])
    ),
    country: rlcFirstText(override?.country, nested(source, ["country", "land", "address.country"])),
    phone: rlcFirstText(
      override?.phone,
      process.env.COMPANY_PHONE,
      nested(source, ["phone", "telefon", "contact.phone"])
    ),
    mobile: rlcFirstText(override?.mobile, nested(source, ["mobile", "mobil", "contact.mobile"])),
    email: rlcFirstText(
      override?.email,
      process.env.COMPANY_EMAIL,
      nested(source, ["email", "mail", "contact.email"])
    ),
    website: rlcFirstText(
      override?.website,
      process.env.COMPANY_WEBSITE,
      nested(source, ["website", "web", "url"])
    ),
    taxNumber: rlcFirstText(
      override?.taxNumber,
      nested(source, ["taxNumber", "steuernummer", "tax.number"])
    ),
    vatId: rlcFirstText(
      override?.vatId,
      nested(source, ["vatId", "ustId", "ustIdNr", "umsatzsteuerId"])
    ),
    iban: rlcFirstText(override?.iban, nested(source, ["iban", "bank.iban"])),
    bic: rlcFirstText(override?.bic, nested(source, ["bic", "bank.bic"])),
    bankName: rlcFirstText(override?.bankName, nested(source, ["bankName", "bank.name"])),
    managingDirector: rlcFirstText(
      override?.managingDirector,
      nested(source, ["managingDirector", "geschaeftsfuehrer", "owner"])
    ),
    logoPath: rlcFirstText(
      override?.logoPath,
      process.env.COMPANY_LOGO_PATH,
      nested(source, ["logoPath", "logo.path", "branding.logoPath"])
    ),
    logoDataUrl: rlcFirstText(
      override?.logoDataUrl,
      nested(source, ["logoDataUrl", "logo.dataUrl", "branding.logoDataUrl"])
    ),
  };

  if (company.logoPath && !path.isAbsolute(company.logoPath)) {
    const candidates = [
      path.join(dataRoot, company.logoPath),
      path.join(dataRoot, "company", company.logoPath),
      path.join(context.projectRoot, company.logoPath),
    ];
    company.logoPath = candidates.find((candidate) => fs.existsSync(candidate));
  }

  if (!company.logoPath) company.logoPath = resolveStoredLogo(dataRoot);
  return company;
}

const assetIndexCache = new Map<string, { createdAt: number; files: Map<string, string[]> }>();

function indexProjectAssets(projectRoot: string): Map<string, string[]> {
  const cached = assetIndexCache.get(projectRoot);
  if (cached && Date.now() - cached.createdAt < 60_000) return cached.files;

  const files = new Map<string, string[]>();
  const queue = [{ dir: projectRoot, depth: 0 }];
  let visited = 0;

  while (queue.length && visited < 20_000) {
    const current = queue.shift()!;
    if (current.depth > 8) continue;

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      visited++;
      const full = path.join(current.dir, entry.name);
      if (entry.isDirectory()) {
        if (!/^node_modules$|^\.git$|^preview$/i.test(entry.name)) {
          queue.push({ dir: full, depth: current.depth + 1 });
        }
        continue;
      }

      const key = entry.name.toLowerCase();
      const values = files.get(key) || [];
      values.push(full);
      files.set(key, values);
    }
  }

  assetIndexCache.set(projectRoot, { createdAt: Date.now(), files });
  return files;
}

function pathFromPublicUrl(value: string, context: RlcPdfPathContext): string | null {
  const raw = decodeURIComponent(value.split("?")[0].split("#")[0]);
  const normalized = raw.replace(/^https?:\/\/[^/]+/i, "");
  const match = normalized.match(/^\/(?:projects|files)\/([^/]+)\/(.+)$/i);
  if (!match) return null;

  const candidate = path.resolve(context.projectsRoot, match[1], match[2]);
  const root = path.resolve(context.projectsRoot) + path.sep;
  if (!candidate.startsWith(root)) return null;
  return fs.existsSync(candidate) ? candidate : null;
}

function safeExistingPath(candidate: string, roots: string[]): string | null {
  if (!candidate) return null;
  const decoded = decodeURIComponent(candidate.replace(/^file:\/\//i, "").split("?")[0]);

  if (path.isAbsolute(decoded) && fs.existsSync(decoded)) return decoded;

  for (const root of roots) {
    const resolved = path.resolve(root, decoded);
    const safeRoot = path.resolve(root) + path.sep;
    if (resolved.startsWith(safeRoot) && fs.existsSync(resolved)) return resolved;
  }

  return null;
}

export function resolveRlcAssetPath(pdfPath: string, asset: RlcPdfAsset | string): string | null {
  const context = resolveRlcPdfPathContext(pdfPath);
  const source: RlcPdfAsset = typeof asset === "string" ? { url: asset, name: path.basename(asset) } : asset || {};

  const rawCandidates = [
    source.filePath,
    source.localPath,
    source.path,
    source.url,
    source.publicUrl,
    source.storagePath,
    source.storageKey,
    source.uri,
  ]
    .map(rlcText)
    .filter(Boolean);

  for (const raw of rawCandidates) {
    const fromPublic = pathFromPublicUrl(raw, context);
    if (fromPublic) return fromPublic;

    const existing = safeExistingPath(raw, [
      context.projectRoot,
      context.projectsRoot,
      context.dataRoot,
      path.join(context.projectRoot, "raw"),
      path.join(context.projectRoot, "uploads"),
      path.join(context.projectRoot, "mobile"),
      path.join(context.projectRoot, "fotos"),
      path.join(context.projectRoot, "photos"),
      path.join(context.projectRoot, "eingangspruefung"),
    ]);
    if (existing) return existing;
  }

  const basenames = [
    source.name,
    ...rawCandidates.map((candidate) => {
      const clean = decodeURIComponent(candidate.split("?")[0].replace(/^file:\/\//i, ""));
      return path.basename(clean);
    }),
  ]
    .map(rlcText)
    .filter(Boolean);

  if (!basenames.length || !fs.existsSync(context.projectRoot)) return null;
  const index = indexProjectAssets(context.projectRoot);

  for (const basename of basenames) {
    const matches = index.get(basename.toLowerCase()) || [];
    const preferred = matches.find((candidate) => /\.(png|jpe?g|webp)$/i.test(candidate)) || matches[0];
    if (preferred && fs.existsSync(preferred)) return preferred;
  }

  return null;
}

export function resolveRlcAssetBuffer(pdfPath: string, asset: RlcPdfAsset | string): Buffer | null {
  const source: RlcPdfAsset = typeof asset === "string" ? { url: asset } : asset || {};
  const fromData = dataUrlBuffer(rlcFirstText(source.dataUrl, source.url));
  if (fromData) return fromData;

  const localPath = resolveRlcAssetPath(pdfPath, source);
  if (!localPath) return null;

  try {
    return fs.readFileSync(localPath);
  } catch {
    return null;
  }
}

export function drawRlcRoundedBox(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string = RLC_PDF_THEME.white,
  stroke: string = RLC_PDF_THEME.line,
  radius = 7
) {
  doc.roundedRect(x, y, width, height, radius).fillAndStroke(fill, stroke);
}

function companyLogoSource(company: RlcPdfCompany): Buffer | string | null {
  const fromData = dataUrlBuffer(company.logoDataUrl);
  if (fromData) return fromData;
  if (company.logoPath && fs.existsSync(company.logoPath)) return company.logoPath;
  return null;
}

export function drawRlcHeader(
  doc: PDFKit.PDFDocument,
  company: RlcPdfCompany,
  title: string,
  projectId: string,
  date: string
): number {
  const pageWidth = doc.page.width;
  const margin = RLC_PDF_THEME.marginX;
  const headerHeight = RLC_PDF_THEME.headerHeight;

  doc.save();
  doc.roundedRect(margin, RLC_PDF_THEME.headerTop, pageWidth - margin * 2, headerHeight, 10).fill(RLC_PDF_THEME.blue);

  const logoSource = companyLogoSource(company);
  if (logoSource) {
    try {
      doc.roundedRect(margin + 12, 39, 58, 52, 6).fill(RLC_PDF_THEME.white);
      doc.image(logoSource as any, margin + 16, 43, {
        fit: [50, 44],
        align: "center",
        valign: "center",
      });
    } catch {
      // Un logo non valido non deve bloccare il PDF.
    }
  }

  const titleX = logoSource ? margin + 82 : margin + 18;
  doc.fillColor(RLC_PDF_THEME.white).font("Helvetica-Bold").fontSize(19).text(title, titleX, 45, {
    width: 260,
    lineBreak: false,
  });
  doc.font("Helvetica").fontSize(9).text(`Projekt ${projectId || "-"}  ·  ${rlcGermanDate(date)}`, titleX, 74, {
    width: 290,
    lineBreak: false,
  });

  const companyLines = [
    rlcFirstText(company.legalName, company.name),
    [company.street, [company.postalCode, company.city].filter(Boolean).join(" ")].filter(Boolean).join(" · "),
    [company.phone, company.mobile, company.email, company.website].filter(Boolean).join(" · "),
    [
      company.vatId && `USt-Id: ${company.vatId}`,
      company.taxNumber && `St.-Nr.: ${company.taxNumber}`,
    ]
      .filter(Boolean)
      .join(" · "),
  ].filter(Boolean);

  let companyY = 41;
  for (let index = 0; index < companyLines.length; index++) {
    doc
      .fillColor(RLC_PDF_THEME.white)
      .font(index === 0 ? "Helvetica-Bold" : "Helvetica")
      .fontSize(index === 0 ? 10 : 8.2)
      .text(companyLines[index], pageWidth - margin - 260, companyY, {
        width: 245,
        align: "right",
        lineBreak: false,
        ellipsis: true,
      });
    companyY += index === 0 ? 17 : 13;
  }

  doc.restore();
  return 118;
}

export function drawRlcFooter(
  doc: PDFKit.PDFDocument,
  documentType: string,
  projectId: string,
  date: string,
  pageNumber: number,
  pageCount: number
) {
  // Importante: il footer resta dentro l'area scrivibile e usa lineBreak:false.
  // In questo modo PDFKit non crea pagine aggiuntive durante il passaggio finale.
  const lineY = doc.page.height - 48;
  const textY = doc.page.height - 39;
  const left = RLC_PDF_THEME.marginX;
  const right = doc.page.width - RLC_PDF_THEME.marginX;

  doc.save();
  doc.moveTo(left, lineY).lineTo(right, lineY).lineWidth(0.6).strokeColor(RLC_PDF_THEME.line).stroke();
  doc.fillColor(RLC_PDF_THEME.muted).font("Helvetica").fontSize(7.5);
  doc.text(`RLC Bausoftware · ${documentType} · ${projectId || "-"} · ${rlcGermanDate(date)}`, left, textY, {
    width: 390,
    lineBreak: false,
    ellipsis: true,
  });
  doc.text(`Seite ${pageNumber} / ${pageCount}`, right - 100, textY, {
    width: 100,
    align: "right",
    lineBreak: false,
  });
  doc.restore();
}

export function drawRlcInfoField(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
  height = 48
) {
  drawRlcRoundedBox(doc, x, y, width, height, RLC_PDF_THEME.background, RLC_PDF_THEME.line, 6);
  doc.fillColor(RLC_PDF_THEME.muted).font("Helvetica-Bold").fontSize(7.5).text(label.toUpperCase(), x + 9, y + 8, {
    width: width - 18,
    lineBreak: false,
    ellipsis: true,
  });
  doc.fillColor(RLC_PDF_THEME.text).font("Helvetica").fontSize(10).text(value || "-", x + 9, y + 23, {
    width: width - 18,
    height: height - 27,
    ellipsis: true,
  });
}

export function drawRlcSectionTitle(doc: PDFKit.PDFDocument, title: string, y: number): number {
  doc.fillColor(RLC_PDF_THEME.blueDark).font("Helvetica-Bold").fontSize(11).text(title, RLC_PDF_THEME.marginX, y, {
    lineBreak: false,
  });
  doc
    .moveTo(RLC_PDF_THEME.marginX, y + 17)
    .lineTo(doc.page.width - RLC_PDF_THEME.marginX, y + 17)
    .lineWidth(1)
    .strokeColor(RLC_PDF_THEME.line)
    .stroke();
  return y + 27;
}

export function rlcContentBottom(doc: PDFKit.PDFDocument): number {
  return doc.page.height - RLC_PDF_THEME.contentBottomPadding;
}

export function createRlcPdfDocument(options: RlcPdfDocumentOptions) {
  fs.mkdirSync(path.dirname(options.pdfPath), { recursive: true });
  const company = resolveRlcCompany(options.pdfPath, options.company);
  const safeDate = rlcFirstText(options.date, new Date().toISOString().slice(0, 10)).slice(0, 10);
  const projectId = rlcFirstText(options.projectId);
  const documentType = rlcFirstText(options.documentType, options.title);

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 28, right: 34, bottom: 24, left: 34 },
    bufferPages: true,
    info: {
      Title: options.title,
      Subject: options.subject || `Projekt ${projectId}`,
      Creator: "RLC Bausoftware",
      Producer: "RLC PDF Core",
    },
  });

  const stream = fs.createWriteStream(options.pdfPath);
  doc.pipe(stream);

  const startCurrentPage = () => drawRlcHeader(doc, company, options.title, projectId, safeDate);
  const addPage = () => {
    doc.addPage();
    return startCurrentPage();
  };

  const finish = async () => {
    const range = doc.bufferedPageRange();
    const pageCount = range.count;
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
      doc.switchToPage(range.start + pageIndex);
      drawRlcFooter(doc, documentType, projectId, safeDate, pageIndex + 1, pageCount);
    }

    doc.end();
    await new Promise<void>((resolve, reject) => {
      stream.on("finish", resolve);
      stream.on("error", reject);
    });
  };

  return {
    doc,
    company,
    safeDate,
    projectId,
    startCurrentPage,
    addPage,
    finish,
    contentBottom: () => rlcContentBottom(doc),
  };
}

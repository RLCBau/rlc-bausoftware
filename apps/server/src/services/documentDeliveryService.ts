import fs from "fs";
import path from "path";
import crypto from "crypto";
import ExcelJS from "exceljs";
import AdmZip from "adm-zip";
import { Builder as XmlBuilder } from "xml2js";
import {
  createRlcPdfDocument,
  drawRlcInfoField,
  drawRlcSectionTitle,
  RLC_PDF_THEME,
  rlcGermanDate,
  rlcText,
} from "./pdf/rlcPdfCore";
import { PROJECTS_ROOT } from "../lib/projectsRoot";

export type DeliveryFormat = "pdf" | "xlsx" | "csv" | "json" | "xml" | "zip";

export type DeliveryAttachment = {
  name?: string;
  fileName?: string;
  url?: string;
  path?: string;
  mime?: string;
  type?: string;
  contentBase64?: string;
};

export type BuildDeliveryInput = {
  projectId: string;
  projectName?: string;
  moduleKey: string;
  documentId?: string;
  title?: string;
  date?: string;
  data?: any;
  formats?: DeliveryFormat[];
  pdfUrl?: string;
  pdfBase64?: string;
  pdfFileName?: string;
  attachments?: DeliveryAttachment[];
  confidential?: boolean;
  encryptionPassword?: string;
  createdBy?: string;
};

export type DeliveryFile = {
  name: string;
  filePath: string;
  url: string;
  mime: string;
  size: number;
  sha256: string;
};

export type BuildDeliveryResult = {
  exportId: string;
  projectId: string;
  moduleKey: string;
  outputDir: string;
  files: DeliveryFile[];
  packageFile: DeliveryFile;
  encryptedPackageFile?: DeliveryFile;
  manifestFile: DeliveryFile;
};

const MODULE_LABELS: Record<string, string> = {
  regie: "Regiebericht",
  regieberichte: "Regieberichte",
  lieferschein: "Lieferschein",
  lieferscheine: "Lieferscheine",
  fotos: "Projektakte / Fotos",
  tagesbericht: "Tagesbericht",
  tagesberichte: "Tagesberichte",
  bautagebuch: "Bautagebuch",
  arbeitszeit: "Arbeitszeitnachweis",
  aufmass: "Aufmaß",
  mengenermittlung: "Mengenermittlung",
  kalkulation: "Kalkulation",
  "ki-kalkulation": "KI-Kalkulation",
  urkalkulation: "Urkalkulation",
  angebot: "Angebot",
  angebote: "Angebote",
  nachtrag: "Nachtrag",
  nachtraege: "Nachträge",
  abschlagsrechnung: "Abschlagsrechnung",
  abschlagsrechnungen: "Abschlagsrechnungen",
  rechnung: "Rechnung",
  rechnungen: "Rechnungen",
  gaeb: "GAEB",
  cad: "CAD / Vermessung",
  projektakte: "Projektakte",
  dokumente: "Dokumentenverwaltung",
};

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".zip": "application/zip",
  ".rlcenc": "application/octet-stream",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};


function readJsonSafe(filePath: string): any | null {
  try {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function hydrateProjectModuleData(projectId: string, moduleKey: string): any | null {
  const root = path.join(PROJECTS_ROOT, projectId);
  const candidatesByModule: Record<string, string[]> = {
    kalkulation: [
      "kalkulation/ki-kalkulation.json",
      "kalkulation/ki/data.json",
      "kalkulation/kalkulation-mit-ki/data.json",
    ],
    "ki-kalkulation": [
      "kalkulation/ki-kalkulation.json",
      "kalkulation/ki/data.json",
    ],
    urkalkulation: ["kalkulation/urkalkulation/data.json"],
    angebot: ["kalkulation/angebot/data.json", "angebot.json"],
    aufmass: ["aufmass.json"],
    regieberichte: [
      "regieberichte/freigegeben/index.json",
      "regieberichte/inbox/index.json",
      "regie.json",
    ],
    lieferscheine: [
      "lieferscheine/freigegeben/index.json",
      "lieferscheine/inbox/index.json",
      "lieferscheine.json",
    ],
    fotos: ["fotos/notes.json", "photos/notes.json"],
    tagesberichte: [
      "tagesberichte/index.json",
      "tagesbericht/index.json",
    ],
    bautagebuch: ["bautagebuch.json", "tagesberichte/index.json"],
  };

  const candidates = candidatesByModule[moduleKey] || [];
  const found: Array<{ file: string; data: any }> = [];
  for (const relative of candidates) {
    const absolute = path.join(root, relative);
    const data = readJsonSafe(absolute);
    if (data !== null) found.push({ file: relative, data });
  }
  if (!found.length) return null;
  if (found.length === 1) return found[0].data;
  return { sources: found };
}

function nowIso(): string {
  return new Date().toISOString();
}

function safeKey(value: any, fallback = "document"): string {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[äÄ]/g, "ae")
    .replace(/[öÖ]/g, "oe")
    .replace(/[üÜ]/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^A-Za-z0-9_.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  return normalized || fallback;
}

function moduleLabel(moduleKey: string): string {
  const key = String(moduleKey || "").trim().toLowerCase();
  return MODULE_LABELS[key] || key || "Dokument";
}

function fileUrl(projectId: string, absolutePath: string): string {
  const projectRoot = path.resolve(PROJECTS_ROOT, projectId);
  const absolute = path.resolve(absolutePath);
  if (!absolute.startsWith(projectRoot + path.sep) && absolute !== projectRoot) {
    throw new Error("Export path is outside project root");
  }
  const relative = path.relative(projectRoot, absolute).split(path.sep).map(encodeURIComponent).join("/");
  return `/projects/${encodeURIComponent(projectId)}/${relative}`;
}

function sha256File(filePath: string): string {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function mimeFor(filePath: string): string {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function describeFile(projectId: string, filePath: string): DeliveryFile {
  const stat = fs.statSync(filePath);
  return {
    name: path.basename(filePath),
    filePath,
    url: fileUrl(projectId, filePath),
    mime: mimeFor(filePath),
    size: stat.size,
    sha256: sha256File(filePath),
  };
}

function normalizeScalar(value: any): string | number | boolean {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}

function flattenObject(value: any, prefix = "", out: Record<string, any> = {}): Record<string, any> {
  if (value === null || value === undefined) {
    if (prefix) out[prefix] = "";
    return out;
  }

  if (Array.isArray(value)) {
    if (!value.length && prefix) out[prefix] = "[]";
    value.forEach((entry, index) => flattenObject(entry, prefix ? `${prefix}.${index + 1}` : String(index + 1), out));
    return out;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (!entries.length && prefix) out[prefix] = "{}";
    for (const [key, entry] of entries) {
      const next = prefix ? `${prefix}.${key}` : key;
      flattenObject(entry, next, out);
    }
    return out;
  }

  if (prefix) out[prefix] = value;
  return out;
}

function mainRows(data: any): any[] {
  const candidates = [
    data?.rows,
    data?.items,
    data?.positions,
    data?.lines,
    data?.reports,
    data?.entries,
    data?.data?.rows,
    data?.data?.items,
    data?.data?.positions,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length) return candidate;
  }
  if (Array.isArray(data)) return data;
  return [];
}

function nestedRows(data: any, keys: string[]): Array<{ name: string; rows: any[] }> {
  const result: Array<{ name: string; rows: any[] }> = [];
  const visited = new Set<any>();

  function add(name: string, rows: any) {
    if (!Array.isArray(rows) || !rows.length || visited.has(rows)) return;
    visited.add(rows);
    result.push({ name, rows });
  }

  add("Positionen", mainRows(data));
  for (const key of keys) add(key, data?.[key]);

  const primary = mainRows(data);
  if (primary.length) {
    for (const key of ["recipeLines", "breakdown", "costBreakdown", "attachments", "photos"]) {
      const combined = primary.flatMap((row) => (Array.isArray(row?.[key]) ? row[key] : []));
      add(key, combined);
    }
  }

  return result;
}

function csvEscape(value: any): string {
  const text = String(normalizeScalar(value) ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function tableColumns(rows: any[]): string[] {
  const set = new Set<string>();
  for (const row of rows.slice(0, 5000)) {
    if (row && typeof row === "object" && !Array.isArray(row)) {
      Object.keys(row).forEach((key) => set.add(key));
    }
  }
  return Array.from(set).slice(0, 120);
}

function buildCsv(data: any): string {
  const rows = mainRows(data);
  if (rows.length) {
    const columns = tableColumns(rows);
    const lines = [columns.map(csvEscape).join(";")];
    for (const row of rows) {
      lines.push(columns.map((column) => csvEscape(row?.[column])).join(";"));
    }
    return `\uFEFF${lines.join("\r\n")}`;
  }

  const flat = flattenObject(data || {});
  const lines = ["Schlüssel;Wert"];
  Object.entries(flat).forEach(([key, value]) => lines.push(`${csvEscape(key)};${csvEscape(value)}`));
  return `\uFEFF${lines.join("\r\n")}`;
}

function xmlElementName(value: string): string {
  const cleaned = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  const candidate = cleaned || "field";

  if (/^[A-Za-z_]/.test(candidate) && !/^xml/i.test(candidate)) {
    return candidate;
  }

  return `field_${candidate}`;
}

function xmlSafeObject(value: any): any {
  if (value === null || value === undefined) return "";

  if (Array.isArray(value)) {
    return { item: value.map(xmlSafeObject) };
  }

  if (typeof value === "object") {
    const out: Record<string, any> = {};

    for (const [key, entry] of Object.entries(value)) {
      let safe = xmlElementName(key);
      let index = 2;

      while (Object.prototype.hasOwnProperty.call(out, safe)) {
        safe = `${xmlElementName(key)}_${index}`;
        index += 1;
      }

      out[safe] = xmlSafeObject(entry);
    }

    return out;
  }

  return value;
}

async function writeWorkbook(filePath: string, input: BuildDeliveryInput): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "RLC Bausoftware";
  workbook.created = new Date();

  const metadata = workbook.addWorksheet("Metadaten");
  metadata.columns = [
    { header: "Feld", key: "field", width: 34 },
    { header: "Wert", key: "value", width: 90 },
  ];
  metadata.addRows([
    { field: "Projekt", value: input.projectId },
    { field: "Projektname", value: input.projectName || "" },
    { field: "Modul", value: moduleLabel(input.moduleKey) },
    { field: "Dokument-ID", value: input.documentId || "" },
    { field: "Titel", value: input.title || moduleLabel(input.moduleKey) },
    { field: "Datum", value: input.date || "" },
    { field: "Erstellt", value: nowIso() },
    { field: "Vertraulich", value: input.confidential ? "Ja" : "Nein" },
  ]);
  metadata.getRow(1).font = { bold: true };
  metadata.views = [{ state: "frozen", ySplit: 1 }];

  const sections = nestedRows(input.data, [
    "recipeLines",
    "breakdown",
    "costBreakdown",
    "resources",
    "attachments",
    "photos",
  ]);

  if (sections.length) {
    for (const section of sections) {
      const sheetName = safeKey(section.name, "Daten").slice(0, 31);
      const sheet = workbook.addWorksheet(sheetName || "Daten");
      const columns = tableColumns(section.rows);
      if (!columns.length) {
        sheet.addRow([JSON.stringify(section.rows)]);
        continue;
      }
      sheet.columns = columns.map((column) => ({
        header: column,
        key: column,
        width: Math.max(12, Math.min(42, column.length + 4)),
      }));
      for (const row of section.rows) {
        const normalized: Record<string, any> = {};
        for (const column of columns) normalized[column] = normalizeScalar(row?.[column]);
        sheet.addRow(normalized);
      }
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1546B8" } };
      sheet.views = [{ state: "frozen", ySplit: 1 }];
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
    }
  } else {
    const sheet = workbook.addWorksheet("Daten");
    sheet.columns = [
      { header: "Schlüssel", key: "key", width: 54 },
      { header: "Wert", key: "value", width: 90 },
    ];
    const flat = flattenObject(input.data || {});
    sheet.addRows(Object.entries(flat).map(([key, value]) => ({ key, value: normalizeScalar(value) })));
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1546B8" } };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
  }

  await workbook.xlsx.writeFile(filePath);
}

function addPdfPageIfNeeded(core: ReturnType<typeof createRlcPdfDocument>, y: number, needed = 38): number {
  if (y + needed <= core.contentBottom()) return y;
  return core.addPage();
}

async function writeGenericPdf(filePath: string, input: BuildDeliveryInput): Promise<void> {
  const title = input.title || moduleLabel(input.moduleKey);
  const core = createRlcPdfDocument({
    pdfPath: filePath,
    title,
    documentType: moduleLabel(input.moduleKey),
    projectId: input.projectId,
    projectName: input.projectName,
    date: input.date || new Date().toISOString().slice(0, 10),
    subject: input.confidential ? "Vertraulicher Dokumentexport" : "Dokumentexport",
  });

  let y = core.startCurrentPage();

  if (input.confidential) {
    core.doc
      .roundedRect(RLC_PDF_THEME.marginX, y, core.doc.page.width - RLC_PDF_THEME.marginX * 2, 28, 7)
      .fillAndStroke("#FEE2E2", "#FCA5A5");
    core.doc.fillColor("#991B1B").font("Helvetica-Bold").fontSize(11).text("VERTRAULICH – URKALKULATION / INTERNE KOSTENDATEN", RLC_PDF_THEME.marginX + 10, y + 8);
    y += 38;
  }

  const width = core.doc.page.width - RLC_PDF_THEME.marginX * 2;
  const half = (width - 10) / 2;
  drawRlcInfoField(core.doc, RLC_PDF_THEME.marginX, y, half, "PROJEKT", input.projectName || input.projectId, 48);
  drawRlcInfoField(core.doc, RLC_PDF_THEME.marginX + half + 10, y, half, "DOKUMENT-ID", input.documentId || "—", 48);
  y += 58;
  drawRlcInfoField(core.doc, RLC_PDF_THEME.marginX, y, half, "MODUL", moduleLabel(input.moduleKey), 48);
  drawRlcInfoField(core.doc, RLC_PDF_THEME.marginX + half + 10, y, half, "DATUM", rlcGermanDate(input.date || new Date().toISOString().slice(0, 10)), 48);
  y += 64;

  const rows = mainRows(input.data);
  if (rows.length) {
    y = drawRlcSectionTitle(core.doc, "Strukturierte Daten", y);
    const columns = tableColumns(rows).slice(0, 6);
    const colWidth = width / Math.max(columns.length, 1);

    core.doc.roundedRect(RLC_PDF_THEME.marginX, y, width, 24, 5).fill(RLC_PDF_THEME.blueDark);
    columns.forEach((column, index) => {
      core.doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(7).text(column, RLC_PDF_THEME.marginX + index * colWidth + 4, y + 8, { width: colWidth - 8, ellipsis: true, lineBreak: false });
    });
    y += 28;

    for (const row of rows.slice(0, 1000)) {
      y = addPdfPageIfNeeded(core, y, 26);
      const rowHeight = 24;
      core.doc.roundedRect(RLC_PDF_THEME.marginX, y, width, rowHeight, 4).fillAndStroke("#FFFFFF", RLC_PDF_THEME.line);
      columns.forEach((column, index) => {
        core.doc.fillColor(RLC_PDF_THEME.text).font("Helvetica").fontSize(7).text(rlcText(normalizeScalar(row?.[column])) || "—", RLC_PDF_THEME.marginX + index * colWidth + 4, y + 6, { width: colWidth - 8, height: 13, ellipsis: true });
      });
      y += rowHeight + 3;
    }
  } else {
    y = drawRlcSectionTitle(core.doc, "Dokumentdaten", y);
    const flat = Object.entries(flattenObject(input.data || {})).slice(0, 500);
    for (const [key, value] of flat) {
      y = addPdfPageIfNeeded(core, y, 34);
      core.doc.fillColor(RLC_PDF_THEME.muted).font("Helvetica-Bold").fontSize(7).text(key, RLC_PDF_THEME.marginX, y, { width: 170, ellipsis: true, lineBreak: false });
      core.doc.fillColor(RLC_PDF_THEME.text).font("Helvetica").fontSize(8).text(rlcText(normalizeScalar(value)) || "—", RLC_PDF_THEME.marginX + 180, y, { width: width - 180, height: 26, ellipsis: true });
      y += 30;
    }
  }

  await core.finish();
}

function resolveProjectAttachment(projectId: string, attachment: DeliveryAttachment): { sourcePath?: string; buffer?: Buffer; name: string } | null {
  const name = safeKey(attachment.fileName || attachment.name || "Anhang", "Anhang");
  const base64 = String(attachment.contentBase64 || "").trim();
  if (base64) {
    try {
      return { buffer: Buffer.from(base64, "base64"), name };
    } catch {
      return null;
    }
  }

  let raw = String(attachment.url || attachment.path || "").trim();
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (parsed.pathname.startsWith("/projects/")) raw = parsed.pathname;
    } catch {
      return null;
    }
  }

  let absolute = "";
  if (raw.startsWith("/projects/")) {
    const relative = decodeURIComponent(raw.replace(/^\/projects\//, ""));
    absolute = path.resolve(PROJECTS_ROOT, relative);
  } else if (path.isAbsolute(raw)) {
    absolute = path.resolve(raw);
  }

  const projectRoot = path.resolve(PROJECTS_ROOT, projectId);
  if (!absolute || (!absolute.startsWith(projectRoot + path.sep) && absolute !== projectRoot)) return null;
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return null;
  return { sourcePath: absolute, name: path.basename(absolute) || name };
}

function copyExistingPdf(projectId: string, pdfUrl: string, destination: string): boolean {
  let raw = String(pdfUrl || "").trim();
  if (/^https?:\/\//i.test(raw)) {
    try {
      raw = new URL(raw).pathname;
    } catch {
      return false;
    }
  }
  if (!raw.startsWith("/projects/")) return false;
  const relative = decodeURIComponent(raw.replace(/^\/projects\//, ""));
  const source = path.resolve(PROJECTS_ROOT, relative);
  const projectRoot = path.resolve(PROJECTS_ROOT, projectId);
  if (!source.startsWith(projectRoot + path.sep) || !fs.existsSync(source)) return false;
  fs.copyFileSync(source, destination);
  return true;
}

function encryptPackage(sourcePath: string, destinationPath: string, password: string): void {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(password, salt, 180_000, 32, "sha256");
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(fs.readFileSync(sourcePath)), cipher.final()]);
  const tag = cipher.getAuthTag();
  const header = Buffer.from("RLCENC1", "ascii");
  fs.writeFileSync(destinationPath, Buffer.concat([header, salt, iv, tag, encrypted]));
}

function appendAudit(projectId: string, entry: Record<string, any>): void {
  const auditDir = path.join(PROJECTS_ROOT, projectId, "exports", "audit");
  fs.mkdirSync(auditDir, { recursive: true });
  fs.appendFileSync(path.join(auditDir, "document-delivery.jsonl"), `${JSON.stringify({ ...entry, at: nowIso() })}\n`, "utf8");
}


/**
 * Usa il renderer PDF specifico del modulo.
 *
 * Il PDF Core rimane responsabile esclusivamente di:
 * - header e footer
 * - logo e dati aziendali
 * - colori e font comuni
 *
 * Il contenuto e il layout restano sotto il controllo del renderer specialistico.
 */
async function writeSpecializedModulePdf(
  filePath: string,
  input: BuildDeliveryInput
): Promise<boolean> {
  const rendererPathByModule: Record<string, string> = {
    regie: "./pdf/regieberichtPdf",
    lieferschein: "./pdf/lieferscheinPdf",
    fotos: "./pdf/fotoDokumentationPdf",
    tagesbericht: "./pdf/tagesberichtPdf",
    bautagebuch: "./pdf/bautagebuchPdf",
    arbeitszeit: "./pdf/kaufmaennischesDokumentPdf",
    angebot: "./pdf/kaufmaennischesDokumentPdf",
    mengenermittlung: "./pdf/kaufmaennischesDokumentPdf",
    rechnung: "./pdf/kaufmaennischesDokumentPdf",
    abschlagsrechnung: "./pdf/kaufmaennischesDokumentPdf",
    aufmass: "./pdf/aufmassPdf",
  };

  const rendererPath = rendererPathByModule[input.moduleKey];
  if (!rendererPath) {
    return false;
  }

  // require() ? intenzionale: permette di mantenere disaccoppiato
  // Document Delivery dai tipi interni dei singoli moduli.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const rendererModule: Record<string, unknown> = require(rendererPath);

  const rendererEntry = Object.entries(rendererModule).find(
    ([name, value]) =>
      typeof value === "function" &&
      !/^resolve/i.test(name) &&
      !/^load/i.test(name) &&
      !/^draw/i.test(name) &&
      !/^format/i.test(name) &&
      /(pdf|regie|liefer|foto|tagesbericht|bautagebuch)/i.test(name)
  );

  if (!rendererEntry) {
    throw new Error(
      `Kein PDF-Renderer in ${rendererPath} gefunden.`
    );
  }

  const [, renderer] = rendererEntry as [
    string,
    (value: Record<string, unknown>) => Promise<unknown> | unknown
  ];

  const data =
    input.data && typeof input.data === "object"
      ? (input.data as Record<string, unknown>)
      : {};

  /*
   * Wir ?bergeben sowohl die Originalfelder als auch die gebr?uchlichen
   * Modul-Container. Dadurch bleibt die bestehende Datenstruktur erhalten,
   * ohne sie in "Dokumentdaten" umzuwandeln.
   */
  await renderer({
    ...data,
    pdfPath: filePath,
    outputPath: filePath,
    filePath,
    projectId: input.projectId,
    projectFsKey: input.projectId,
    projectName: input.projectName,
    documentId: input.documentId,
    title: input.title,
    date: input.date,
    moduleKey: input.moduleKey,
    company: data.company,
    data,
    payload: data,
    document: data,
    report: data,
    regiebericht: data,
    lieferschein: data,
    fotoDokumentation: data,
    tagesbericht: data,
    bautagebuch: data,
  });

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Der Fachrenderer f?r ${input.moduleKey} hat keine PDF-Datei erzeugt.`
    );
  }

  return true;
}

export async function buildDeliveryPackage(input: BuildDeliveryInput): Promise<BuildDeliveryResult> {
  const projectId = safeKey(input.projectId, "project");
  const moduleKey = safeKey(input.moduleKey, "document").toLowerCase();
  const suppliedData = input.data;
  const hasMeaningfulData = suppliedData !== undefined && suppliedData !== null &&
    (typeof suppliedData !== "object" || Object.keys(suppliedData).length > 0);
  const effectiveData = hasMeaningfulData
    ? suppliedData
    : hydrateProjectModuleData(projectId, moduleKey) ?? {};
  input = { ...input, projectId, moduleKey, data: effectiveData };
  const exportId = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const outputDir = path.join(PROJECTS_ROOT, projectId, "exports", moduleKey, exportId);
  fs.mkdirSync(outputDir, { recursive: true });

  const baseName = safeKey(`${moduleLabel(moduleKey)}_${input.documentId || input.date || exportId}`, moduleKey);
  const requested = new Set<DeliveryFormat>(((input.formats?.length ? input.formats : ["pdf", "xlsx", "csv", "json", "xml", "zip"]).filter(Boolean)) as DeliveryFormat[]);
  const generatedPaths: string[] = [];

  if (requested.has("json")) {
    const jsonPath = path.join(outputDir, `${baseName}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify({
      meta: {
        projectId,
        projectName: input.projectName || "",
        moduleKey,
        moduleLabel: moduleLabel(moduleKey),
        documentId: input.documentId || "",
        title: input.title || moduleLabel(moduleKey),
        date: input.date || "",
        confidential: Boolean(input.confidential),
        exportedAt: nowIso(),
      },
      data: input.data ?? {},
    }, null, 2), "utf8");
    generatedPaths.push(jsonPath);
  }

  if (requested.has("xml")) {
    const xmlPath = path.join(outputDir, `${baseName}.xml`);
    const builder = new XmlBuilder({ headless: false, renderOpts: { pretty: true, indent: "  ", newline: "\n" } });
    fs.writeFileSync(xmlPath, builder.buildObject({
      RlcDocumentExport: {
        Meta: {
          ProjectId: projectId,
          ProjectName: input.projectName || "",
          Module: moduleLabel(moduleKey),
          ModuleKey: moduleKey,
          DocumentId: input.documentId || "",
          Title: input.title || moduleLabel(moduleKey),
          Date: input.date || "",
          Confidential: Boolean(input.confidential),
          ExportedAt: nowIso(),
        },
        Data: xmlSafeObject(input.data ?? {}),
      },
    }), "utf8");
    generatedPaths.push(xmlPath);
  }

  if (requested.has("csv")) {
    const csvPath = path.join(outputDir, `${baseName}.csv`);
    fs.writeFileSync(csvPath, buildCsv(input.data ?? {}), "utf8");
    generatedPaths.push(csvPath);
  }

  if (requested.has("xlsx")) {
    const xlsxPath = path.join(outputDir, `${baseName}.xlsx`);
    await writeWorkbook(xlsxPath, { ...input, projectId, moduleKey });
    generatedPaths.push(xlsxPath);
  }

  if (requested.has("pdf")) {
    const requestedPdfName = String(
      input.pdfFileName || `${baseName}.pdf`
    ).replace(/[\\/:*?"<>|]+/g, "_");

    const pdfFileName = requestedPdfName.toLowerCase().endsWith(".pdf")
      ? requestedPdfName
      : `${requestedPdfName}.pdf`;

    const pdfPath = path.join(outputDir, pdfFileName);

    const inlinePdfBase64 = String(input.pdfBase64 || "")
      .replace(/^data:application\/pdf[^,]*,/, "")
      .replace(/\s+/g, "");

    let written = false;

    /*
     * Priorità assoluta al renderer specialistico del server.
     * Il PDF locale/mobile rimane soltanto fallback.
     */
    written = await writeSpecializedModulePdf(pdfPath, {
      ...input,
      projectId,
      moduleKey,
    });


    if (inlinePdfBase64) {
      const pdfBuffer = Buffer.from(inlinePdfBase64, "base64");

      if (
        pdfBuffer.length < 5 ||
        pdfBuffer.subarray(0, 5).toString("ascii") !== "%PDF-"
      ) {
        throw new Error("Ung?ltige PDF-Daten vom Fachmodul.");
      }

      fs.writeFileSync(pdfPath, pdfBuffer);
      written = true;
    }

    if (!written && input.pdfUrl) {
      written = copyExistingPdf(projectId, input.pdfUrl, pdfPath);
    }

    if (!written && moduleKey === "aufmass") {
      throw new Error(
        "Aufma?-PDF fehlt: Das Fachmodul hat keine PDF-Daten geliefert."
      );
    }

    /*
     * Nur echter Fallback:
     * Der generische Renderer darf niemals ein vorhandenes Fachlayout ersetzen.
     */
    if (!written) {
      await writeGenericPdf(pdfPath, {
        ...input,
        projectId,
        moduleKey,
      });
      written = true;
    }

    generatedPaths.push(pdfPath);
  }

  const attachmentDir = path.join(outputDir, "Anlagen");
  const copiedAttachments: string[] = [];
  for (const attachment of input.attachments || []) {
    const resolved = resolveProjectAttachment(projectId, attachment);
    if (!resolved) continue;
    fs.mkdirSync(attachmentDir, { recursive: true });
    let target = path.join(attachmentDir, safeKey(resolved.name, "Anhang"));
    const ext = resolved.sourcePath ? path.extname(resolved.sourcePath) : "";
    if (ext && !path.extname(target)) target += ext;
    let suffix = 1;
    const base = target;
    while (fs.existsSync(target)) {
      const parsed = path.parse(base);
      target = path.join(parsed.dir, `${parsed.name}_${suffix++}${parsed.ext}`);
    }
    if (resolved.sourcePath) fs.copyFileSync(resolved.sourcePath, target);
    else if (resolved.buffer) fs.writeFileSync(target, resolved.buffer);
    copiedAttachments.push(target);
  }

  const preliminaryFiles = [...generatedPaths, ...copiedAttachments].map((filePath) => describeFile(projectId, filePath));
  const manifest = {
    schema: "RLC-DOCUMENT-DELIVERY-1.0",
    exportId,
    projectId,
    projectName: input.projectName || "",
    moduleKey,
    moduleLabel: moduleLabel(moduleKey),
    documentId: input.documentId || "",
    title: input.title || moduleLabel(moduleKey),
    date: input.date || "",
    confidential: Boolean(input.confidential),
    exportedAt: nowIso(),
    createdBy: input.createdBy || "",
    files: preliminaryFiles.map(({ name, url, mime, size, sha256 }) => ({ name, url, mime, size, sha256 })),
    specialistFormats: moduleKey.includes("kalkulation") || moduleKey === "angebot" || moduleKey === "gaeb"
      ? ["GAEB X83/X84/X86/X89 via Fachmodul"]
      : moduleKey === "aufmass"
        ? ["REB X31", "DA11 via Fachmodul"]
        : moduleKey === "cad"
          ? ["DWG", "DXF", "IFC", "BCF", "LandXML via Fachmodul"]
          : [],
  };

  const manifestPath = path.join(outputDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  const manifestFile = describeFile(projectId, manifestPath);

  const zip = new AdmZip();
  for (const filePath of generatedPaths) zip.addLocalFile(filePath);
  if (fs.existsSync(attachmentDir)) zip.addLocalFolder(attachmentDir, "Anlagen");
  zip.addLocalFile(manifestPath);
  const packagePath = path.join(outputDir, `${baseName}_Exportpaket.zip`);
  zip.writeZip(packagePath);
  const packageFile = describeFile(projectId, packagePath);

  let encryptedPackageFile: DeliveryFile | undefined;
  const password = String(input.encryptionPassword || "");
  if (input.confidential && password.length < 8) {
    throw new Error("Vertrauliche Exporte benötigen ein Passwort mit mindestens 8 Zeichen.");
  }
  if (input.confidential) {
    const encryptedPath = `${packagePath}.rlcenc`;
    encryptPackage(packagePath, encryptedPath, password);
    encryptedPackageFile = describeFile(projectId, encryptedPath);
  }

  const files = [...preliminaryFiles, manifestFile];

  appendAudit(projectId, {
    action: "EXPORT_PACKAGE",
    exportId,
    moduleKey,
    documentId: input.documentId || "",
    confidential: Boolean(input.confidential),
    encrypted: Boolean(encryptedPackageFile),
    createdBy: input.createdBy || "",
    files: files.map((file) => ({ name: file.name, sha256: file.sha256 })),
  });

  return {
    exportId,
    projectId,
    moduleKey,
    outputDir,
    files,
    packageFile,
    encryptedPackageFile,
    manifestFile,
  };
}

export function auditDeliveryAction(projectId: string, entry: Record<string, any>): void {
  appendAudit(safeKey(projectId, "project"), entry);
}

// @ts-nocheck
// apps/server/src/routes/regie.ts
import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import mime from "mime-types";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { PROJECTS_ROOT } from "../lib/projectsRoot";
import { recognizeFromFiles } from "../services/photoRecognition";
import { parseLieferschein } from "../services/lieferscheinParser";
import { matchLVPositions } from "../services/lvMatching";
import { createRegieberichtPdf } from "../services/pdf/regieberichtPdf";

// ✅ AUTH (collegato)
import {
  requireAuth,
  requireMode,
  requireEmailVerified,
} from "../middleware/requireAuth";

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";


const router = Router();
console.log("[regie] router loaded");

/* =========================================================
 * RLC PDF - Firmendaten aus der zentralen Company-Verwaltung
 * =======================================================*/
function pdfHeaderValue(value: any): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  return "";
}

function pdfFirstValue(...values: any[]): string {
  for (const value of values) {
    const result = pdfHeaderValue(value);
    if (result) return result;
  }
  return "";
}

function unwrapCompanyHeader(payload: any): any {
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

function forwardedCompanyHeaders(req: any): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  for (const name of [
    "authorization",
    "cookie",
    "x-company-id",
    "x-rlc-company-id",
    "x-tenant-id",
    "x-request-id",
  ]) {
    const raw = req?.headers?.[name];
    if (Array.isArray(raw)) headers[name] = raw.join(",");
    else if (raw) headers[name] = String(raw);
  }
  return headers;
}

async function fetchInternalCompanyResource(req: any, endpoints: string[]) {
  const base = `http://127.0.0.1:${process.env.PORT || 4000}`;
  const headers = forwardedCompanyHeaders(req);

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${base}${endpoint}`, { headers });
      if (!response.ok) continue;
      return response;
    } catch (error) {
      console.warn(`[RLC PDF] Company endpoint ${endpoint} nicht erreichbar`, error);
    }
  }

  return null;
}

async function loadPdfCompanyFromAdministration(req: any): Promise<any | undefined> {
  const headerResponse = await fetchInternalCompanyResource(req, [
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

  const source = unwrapCompanyHeader(rawHeader);
  const addressObject =
    source?.address && typeof source.address === "object" ? source.address : {};

  let logoDataUrl = pdfFirstValue(
    source?.logoDataUrl,
    source?.logo?.dataUrl,
    source?.branding?.logoDataUrl
  );

  if (!logoDataUrl) {
    const logoResponse = await fetchInternalCompanyResource(req, [
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

  const company = {
    name: pdfFirstValue(
      source?.name,
      source?.companyName,
      source?.firmenname,
      source?.firma,
      source?.legalName
    ),
    legalName: pdfFirstValue(source?.legalName, source?.companyLegalName),
    street: pdfFirstValue(
      source?.street,
      source?.strasse,
      source?.adresse,
      typeof source?.address === "string" ? source.address : "",
      addressObject?.street,
      addressObject?.addressLine1
    ),
    postalCode: pdfFirstValue(
      source?.postalCode,
      source?.zip,
      source?.plz,
      addressObject?.postalCode,
      addressObject?.zip
    ),
    city: pdfFirstValue(source?.city, source?.ort, addressObject?.city),
    country: pdfFirstValue(source?.country, source?.land, addressObject?.country),
    phone: pdfFirstValue(
      source?.phone,
      source?.telefon,
      source?.contact?.phone
    ),
    mobile: pdfFirstValue(source?.mobile, source?.mobil, source?.contact?.mobile),
    email: pdfFirstValue(source?.email, source?.mail, source?.contact?.email),
    website: pdfFirstValue(source?.website, source?.web, source?.url),
    taxNumber: pdfFirstValue(source?.taxNumber, source?.steuernummer),
    vatId: pdfFirstValue(source?.vatId, source?.ustId, source?.ustIdNr),
    iban: pdfFirstValue(source?.iban, source?.bank?.iban),
    bic: pdfFirstValue(source?.bic, source?.bank?.bic),
    bankName: pdfFirstValue(source?.bankName, source?.bank?.name),
    managingDirector: pdfFirstValue(
      source?.managingDirector,
      source?.geschaeftsfuehrer,
      source?.owner
    ),
    logoDataUrl,
  };

  const useful = Boolean(
    company.name ||
      company.street ||
      company.phone ||
      company.email ||
      company.logoDataUrl
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

/* =========================================================
 * Helpers
 * =======================================================*/
function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeFsKey(input: string) {
  return String(input || "")
    .trim()
    .replace(/[^A-Za-z0-9_\-]/g, "_")
    .slice(0, 120);
}

function readJson<T>(p: string, fallback: T): T {
  try {
    if (!fs.existsSync(p)) return fallback;
    const raw = fs.readFileSync(p, "utf8");
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(p: string, obj: any) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}

async function resolveProjectDbId(input: string): Promise<string | null> {
  if (!input) return null;
  try {
    const proj = await prisma.project.findFirst({
      where: { OR: [{ id: input }, { code: input }] },
      select: { id: true },
    });
    return proj?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * ✅ FS-Key policy (DEFINITIVO):
 * folder sotto PROJECTS_ROOT deve essere SEMPRE basato su project.code (sanificato)
 */
async function resolveProjectFsKey(input: string): Promise<string> {
  const trimmed = String(input || "").trim();
  if (!trimmed) return "UNKNOWN";

  // già un code BA-...
  if (/^BA-\d{4}[-_]/i.test(trimmed)) return safeFsKey(trimmed);

  try {
    const proj = await prisma.project.findFirst({
      where: { OR: [{ id: trimmed }, { code: trimmed }] },
      select: { code: true },
    });
    const code = String((proj as any)?.code || "").trim();
    if (code) return safeFsKey(code);
  } catch {}

  return "UNKNOWN";
}

/**
 * per payload: prendi SEMPRE UUID + code (fsKey)
 * - projectId: UUID (se input è code, risolve UUID)
 * - projectCode: fsKey (sempre)
 */
async function resolveProjectIds(inputProjectIdOrCode: string) {
  const projectIdOrCode = String(inputProjectIdOrCode || "").trim();
  const fsKey = await resolveProjectFsKey(projectIdOrCode);
  const dbId = await resolveProjectDbId(projectIdOrCode);
  return { fsKey, dbId };
}

function rid() {
  return `doc_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/* =========================================================
 * Directory Policy (COERENTE)
 * =======================================================*/
/**
 * Inbox workflow:
 *  - inbox:     data/projects/<fsKey>/inbox/regie/<docId>.json
 *  - freigabe:  data/projects/<fsKey>/regie/<docId>.json              <-- APPROVATI (Freigegeben)
 *
 * Regieberichte "ufficiali" (Final/History):
 *  - json/pdf:  data/projects/<fsKey>/regieberichte/Regiebericht_YYYY-MM-DD_001.json/pdf
 *
 * Raw upload:
 *  - files:     data/projects/<fsKey>/raw/<file>
 */
function projectRoot(fsKey: string) {
  return path.join(PROJECTS_ROOT, fsKey);
}
function regieInboxDir(fsKey: string) {
  // SERVER: Inbox = Eingangsprüfung
  return path.join(projectRoot(fsKey), "eingangspruefung", "regie");
}

function regieFreigabeDir(fsKey: string) {
  return path.join(projectRoot(fsKey), "regie");
}
function regieberichteDir(fsKey: string) {
  return path.join(projectRoot(fsKey), "regieberichte");
}
function rawDir(fsKey: string) {
  return path.join(projectRoot(fsKey), "raw");
}

async function ensureInboxDir(projectIdOrCode: string) {
  const fsKey = await resolveProjectFsKey(projectIdOrCode);
  const dir = regieInboxDir(fsKey);
  ensureDir(dir);
  return { fsKey, dir };
}

async function ensureRegieberichteDir(projectIdOrCode: string) {
  const fsKey = await resolveProjectFsKey(projectIdOrCode);
  const dir = regieberichteDir(fsKey);
  ensureDir(dir);
  return { fsKey, dir };
}

async function ensureRawDir(projectIdOrCode: string) {
  const fsKey = await resolveProjectFsKey(projectIdOrCode);
  const dir = rawDir(fsKey);
  ensureDir(dir);
  return { fsKey, dir };
}

/** prossimo file per data: Regiebericht_YYYY-MM-DD_001.json */
function nextRegieFile(dir: string, date: string) {
  const safeDate = String(date || "").slice(0, 10) || today();
  const prefix = `Regiebericht_${safeDate}`;
  const all = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.toLowerCase().endsWith(".json"));

  if (!all.length) {
    return {
      jsonName: `${prefix}_001.json`,
      pdfName: `${prefix}_001.pdf`,
      reportId: "001",
    };
  }

  const re = new RegExp(`^Regiebericht_${safeDate}_(\\d+)\\.json$`, "i");
  const nums = all
    .map((f) => {
      const m = f.match(re);
      return m?.[1] ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => Number.isFinite(n) && n > 0);

  const next = (nums.length ? Math.max(...nums) : 1) + 1;
  const reportId = String(next).padStart(3, "0");
  return {
    jsonName: `${prefix}_${reportId}.json`,
    pdfName: `${prefix}_${reportId}.pdf`,
    reportId,
  };
}

function latestJsonForDate(dir: string, date: string): string | null {
  const safeDate = String(date || "").slice(0, 10);
  const prefix = `Regiebericht_${safeDate}`;
  const all = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.toLowerCase().endsWith(".json"))
    .sort();
  if (!all.length) return null;
  return path.join(dir, all[all.length - 1]);
}

/* =================== S3 / MinIO =================== */
const S3_ENABLED = (process.env.FEATURE_MINIO === "on") || !!process.env.S3_ENDPOINT;

const S3_ENDPOINT = process.env.S3_ENDPOINT || "http://minio:9000";
const S3_BUCKET = process.env.S3_BUCKET || "rlc-storage";
const S3_REGION = process.env.S3_REGION || process.env.AWS_REGION || "us-east-1";

const S3_ACCESS_KEY =
  process.env.S3_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID || "";
const S3_SECRET_KEY =
  process.env.S3_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY || "";

const s3 = S3_ENABLED
  ? new S3Client({
      region: S3_REGION,
      endpoint: S3_ENDPOINT,
      forcePathStyle: true, // CRITICO per MinIO
      credentials: {
        accessKeyId: S3_ACCESS_KEY,
        secretAccessKey: S3_SECRET_KEY,
      },
    })
  : null;

async function putToS3(localPath: string, key: string) {
  if (!s3) return null;
  const contentType = mime.lookup(localPath) || "application/octet-stream";
  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: fs.createReadStream(localPath),
      ContentType: String(contentType),
    })
  );
  return { bucket: S3_BUCKET, key, mime: String(contentType) };
}

/* ================== Document/FileVersion/Storage ================== */
async function createDocumentVersion(opts: {
  projectId: string;
  fsKey: string;
  filename: string;
  kind: "IMAGE" | "PDF" | "DOC";
  localPath: string;
  s3Key?: string;
  uploadedBy?: string | null;
  meta?: any;
}) {
  const { projectId, fsKey, filename, kind, localPath, s3Key, uploadedBy, meta } =
    opts;

  const realProjectId = await resolveProjectDbId(projectId);
  if (!realProjectId) {
    console.warn("[regie] createDocumentVersion: project not found/DB off:", projectId);
    return { documentId: null as string | null, versionId: null as string | null };
  }

  const stat = fs.statSync(localPath);

  const storageKey = s3Key
    ? s3Key
    : `projects/${fsKey}/${path.basename(path.dirname(localPath))}/${path.basename(
        localPath
      )}`;
  const storageId = `${S3_BUCKET}/${storageKey}`;

  await prisma.storageObject.upsert({
    where: { id: storageId },
    update: {
      size: BigInt(stat.size),
      sha256: "sha256-dev",
      mime: (mime.lookup(filename) || "application/octet-stream") as string,
    },
    create: {
      id: storageId,
      bucket: S3_BUCKET,
      key: storageKey,
      size: BigInt(stat.size),
      sha256: "sha256-dev",
      mime: (mime.lookup(filename) || "application/octet-stream") as string,
    },
  });

  const doc = await prisma.document.create({
    data: {
      projectId: realProjectId,
      kind: kind as any,
      name: filename,
      meta: meta ?? null,
    },
  });

  const fv = await prisma.fileVersion.create({
    data: {
      documentId: doc.id,
      storageId,
      version: 1,
      uploadedBy: uploadedBy ?? null,
    },
  });

  await prisma.document.update({
    where: { id: doc.id },
    data: { currentVid: fv.id },
  });

  return { documentId: doc.id, versionId: fv.id };
}

function workflowRows(source: any): any[] {
  const rawRows = Array.isArray(source?.rows)
    ? source.rows
    : Array.isArray(source?.items?.aufmass)
    ? source.items.aufmass
    : [];

  const rows = rawRows.length ? rawRows : [source || {}];
  const header = source || {};

  return rows.map((row: any, index: number) => ({
    ...(row || {}),
    id: String(row?.id || (index === 0 ? header?.id || header?.docId || "" : "") || rid()),
    date: String(row?.date || row?.datum || header?.date || header?.datum || today()).slice(0, 10),
    reportType: row?.reportType || header?.reportType || "REGIE",
    regieNummer: String(row?.regieNummer || row?.regieNr || header?.regieNummer || header?.regieNr || header?.nummer || ""),
    auftraggeber: String(row?.auftraggeber || row?.client || row?.customer || header?.auftraggeber || header?.client || header?.customer || ""),
    worker: String(row?.worker || row?.mitarbeiter || (index === 0 ? header?.worker || header?.mitarbeiter || "" : "")),
    hours: Number(row?.hours ?? row?.stunden ?? (index === 0 ? header?.hours ?? header?.stunden ?? 0 : 0)),
    machine: String(row?.machine || row?.maschine || (index === 0 ? header?.machine || header?.maschine || "" : "")),
    material: String(row?.material || row?.materialien || (index === 0 ? header?.material || header?.materialien || "" : "")),
    quantity: Number(row?.quantity ?? row?.menge ?? (index === 0 ? header?.quantity ?? header?.menge ?? 0 : 0)),
    unit: String(row?.unit || row?.einheit || header?.unit || header?.einheit || "Std"),
    comment: String(row?.comment || row?.text || row?.taetigkeit || (index === 0 ? header?.comment || header?.text || "" : "")),
    bemerkungen: String(row?.bemerkungen || row?.notes || (index === 0 ? header?.bemerkungen || header?.notes || "" : "")),
    arbeitsbeginn: String(row?.arbeitsbeginn || row?.von || row?.timeFrom || header?.arbeitsbeginn || ""),
    arbeitsende: String(row?.arbeitsende || row?.bis || row?.timeTo || header?.arbeitsende || ""),
    pause1: String(row?.pause1 || header?.pause1 || ""),
    pause2: String(row?.pause2 || header?.pause2 || ""),
    blattNr: String(row?.blattNr || row?.blatt || header?.blattNr || header?.blatt || ""),
    wetter: String(row?.wetter || row?.weather || header?.wetter || header?.weather || ""),
    kostenstelle: String(row?.kostenstelle || row?.costCenter || header?.kostenstelle || header?.costCenter || ""),
    lvItemId: String(row?.lvItemId || row?.positionId || header?.lvItemId || ""),
    lvItemPos: String(row?.lvItemPos || row?.pos || row?.position || header?.lvItemPos || ""),
    photos: normalizeMobileAttachments({
      photos: row?.photos || (index === 0 ? header?.photos : []),
      attachments: row?.attachments || (index === 0 ? header?.attachments : []),
    }),
  }));
}

function workflowPhotos(source: any, rows: any[]) {
  const photos = [
    ...(Array.isArray(source?.photos) ? source.photos : []),
    ...(Array.isArray(source?.attachments) ? source.attachments : []),
    ...rows.flatMap((row: any) => [
      ...(Array.isArray(row?.photos) ? row.photos : []),
      ...(Array.isArray(row?.attachments) ? row.attachments : []),
    ]),
  ];

  const seen = new Set<string>();
  return photos
    .map((raw: any, index: number) => {
      const photo = typeof raw === "string" ? { url: raw } : raw || {};
      const rawUrl = String(
        photo?.url ||
          photo?.publicUrl ||
          photo?.downloadUrl ||
          photo?.storagePath ||
          photo?.storageKey ||
          photo?.uri ||
          ""
      );
      const inferredName = rawUrl
        ? decodeURIComponent(rawUrl.split("?")[0]).split(/[\/]/).pop()
        : "";

      return {
        id: photo?.id,
        name: String(photo?.name || inferredName || `Foto ${index + 1}`),
        dataUrl:
          typeof raw === "string" && raw.startsWith("data:image")
            ? raw
            : String(photo?.dataUrl || ""),
        url:
          typeof raw === "string" && !raw.startsWith("data:image")
            ? raw
            : rawUrl,
        uri: String(photo?.uri || ""),
        filePath: String(photo?.filePath || photo?.localPath || photo?.path || ""),
        localPath: String(photo?.localPath || ""),
        storagePath: String(photo?.storagePath || ""),
        storageKey: String(photo?.storageKey || ""),
        publicUrl: String(photo?.publicUrl || ""),
        type: String(photo?.type || photo?.mime || ""),
      };
    })
    .filter((photo: any) => {
      const key =
        photo.dataUrl ||
        photo.filePath ||
        photo.localPath ||
        photo.storagePath ||
        photo.storageKey ||
        photo.url ||
        photo.uri ||
        photo.name;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function pdfInputFromSource(opts: {
  pdfPath: string;
  fsKey: string;
  source: any;
  rows?: any[];
}) {
  const rows = opts.rows || workflowRows(opts.source);
  const head = rows[0] || opts.source || {};
  const source = opts.source || {};

  return {
    pdfPath: opts.pdfPath,
    projectId: opts.fsKey,
    projectName: String(source.projectName || source.baustelle || source.projectTitle || opts.fsKey),
    date: String(source.date || head.date || today()).slice(0, 10),
    regieNummer: String(source.regieNummer || source.regieNr || head.regieNummer || ""),
    auftraggeber: String(source.auftraggeber || head.auftraggeber || ""),
    arbeitsbeginn: String(source.arbeitsbeginn || head.arbeitsbeginn || ""),
    arbeitsende: String(source.arbeitsende || head.arbeitsende || ""),
    pause1: String(source.pause1 || head.pause1 || ""),
    pause2: String(source.pause2 || head.pause2 || ""),
    blattNr: String(source.blattNr || source.blatt || head.blattNr || ""),
    wetter: String(source.wetter || source.weather || head.wetter || ""),
    kostenstelle: String(source.kostenstelle || source.costCenter || head.kostenstelle || ""),
    bemerkungen: String(source.bemerkungen || source.notes || head.bemerkungen || source.note || ""),
    photos: workflowPhotos(source, rows),
    aufmass: rows,
    lieferscheine: source?.items?.lieferscheine || source?.lieferscheine || [],
    participants: source.participants || {},
    company: source.company || source.meta?.company || undefined,
  };
}

async function persistOfficialRegiebericht(opts: {
  projectId: string;
  source: any;
  approvedBy?: string | null;
  sourceDocId?: string;
  sourceLabel: string;
  company?: any;
}) {
  const { fsKey, dbId } = await resolveProjectIds(opts.projectId);
  const { dir } = await ensureRegieberichteDir(opts.projectId);
  const rows = workflowRows(opts.source);
  const date = String(opts.source?.date || rows[0]?.date || today()).slice(0, 10);
  const { jsonName, pdfName, reportId } = nextRegieFile(dir, date);
  const jsonPath = path.join(dir, jsonName);
  const pdfPath = path.join(dir, pdfName);
  const now = Date.now();

  const payload = {
    ...opts.source,
    id: opts.sourceDocId || opts.source?.id || opts.source?.docId || undefined,
    sourceDocId: opts.sourceDocId || opts.source?.sourceDocId || opts.source?.id || undefined,
    projectId: dbId ?? opts.source?.projectId ?? opts.projectId,
    projectCode: opts.source?.projectCode || fsKey,
    projectFsKey: fsKey,
    date,
    reportType: opts.source?.reportType || rows[0]?.reportType || "REGIE",
    rows,
    items: { ...(opts.source?.items || {}), aufmass: rows },
    workflowStatus: "FREIGEGEBEN",
    approvedAt: now,
    approvedBy: opts.approvedBy || null,
    savedAt: new Date(now).toISOString(),
    reportId,
  };

  writeJson(jsonPath, payload);

  let jsonS3Key: string | undefined;
  if (S3_ENABLED && s3) {
    jsonS3Key = `projects/${fsKey}/regieberichte/${jsonName}`;
    await putToS3(jsonPath, jsonS3Key);
  }

  await createDocumentVersion({
    projectId: opts.projectId,
    fsKey,
    filename: jsonName,
    kind: "DOC",
    localPath: jsonPath,
    s3Key: jsonS3Key,
    uploadedBy: opts.approvedBy || null,
    meta: { source: opts.sourceLabel, reportId, sourceDocId: opts.sourceDocId || null },
  });

  await createRegieberichtPdf(
    pdfInputFromSource({
      pdfPath,
      fsKey,
      source: { ...payload, company: opts.company || payload.company },
      rows,
    })
  );

  let pdfS3Key: string | undefined;
  if (S3_ENABLED && s3) {
    pdfS3Key = `projects/${fsKey}/regieberichte/${pdfName}`;
    await putToS3(pdfPath, pdfS3Key);
  }

  await createDocumentVersion({
    projectId: opts.projectId,
    fsKey,
    filename: pdfName,
    kind: "PDF",
    localPath: pdfPath,
    s3Key: pdfS3Key,
    uploadedBy: opts.approvedBy || null,
    meta: { source: `${opts.sourceLabel}.pdf`, reportId, sourceDocId: opts.sourceDocId || null },
  });

  const pdfUrl = `/projects/${encodeURIComponent(fsKey)}/regieberichte/${encodeURIComponent(pdfName)}`;
  return { fsKey, reportId, jsonName, pdfName, jsonPath, pdfPath, pdfUrl, payload };
}

/* ================== Multer Upload (STAGING) ================== */
const STAGING_RAW = path.join(PROJECTS_ROOT, "_staging", "regie", "raw");
ensureDir(STAGING_RAW);

    const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, STAGING_RAW),
    filename: (_req, file, cb) => {
      const ts = Date.now();
      const safe = (file.originalname || "file").replace(/[^\w.\-]+/g, "_");
      cb(null, `${ts}__${safe}`);
    },
  }),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB pro Datei
  },
});

/* =========================================================
 * ✅ INBOX WORKFLOW
 * =======================================================*/
const DateiSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  uri: z.string().optional(),
  type: z.string().optional(),
  url: z.string().optional(),
  publicUrl: z.string().optional(),
  storagePath: z.string().optional(),
  dataUrl: z.string().optional(),
  filePath: z.string().optional(),
});

const RegieMobileSchema = z.object({
  id: z.string().optional(),
  projectId: z.string().min(1),
  projectCode: z.string().optional(),
  date: z.string().min(1),
  reportType: z.enum(["REGIE", "TAGESBERICHT", "BAUTAGEBUCH"]).optional(),
  comment: z.string().optional(),
  text: z.string().optional(),

  hours: z.number().optional(),
  unit: z.string().optional(),

  mitarbeiter: z.string().optional(),
  maschinen: z.string().optional(),
  materialien: z.string().optional(),

  worker: z.string().optional(),
  machine: z.string().optional(),
  material: z.string().optional(),
  quantity: z.number().optional(),

  lvItemPos: z.string().nullable().optional(),

  regieNummer: z.string().optional(),
  auftraggeber: z.string().optional(),
  arbeitsbeginn: z.string().optional(),
  arbeitsende: z.string().optional(),
  pause1: z.string().optional(),
  pause2: z.string().optional(),
  blattNr: z.string().optional(),
  wetter: z.string().optional(),
  kostenstelle: z.string().optional(),
  bemerkungen: z.string().optional(),

  photos: z.array(DateiSchema).optional(),
  attachments: z.array(DateiSchema).optional(),

  workflowStatus: z.enum(["DRAFT", "EINGEREICHT", "FREIGEGEBEN", "ABGELEHNT"]).optional(),
  submittedAt: z.number().nullable().optional(),
  rejectionReason: z.string().nullable().optional(),
  createdAt: z.number().optional(),
}).passthrough();

function looksLocalUri(u?: string) {
  const s = String(u || "");
  return s.startsWith("file:") || s.startsWith("content:") || s.startsWith("ph:");
}

function normalizeMobileAttachments(input: { photos?: any[]; attachments?: any[] }) {
  const photos = Array.isArray(input.photos) ? input.photos : [];
  const attachments = Array.isArray(input.attachments) ? input.attachments : [];
  const all = [...attachments, ...photos].filter(Boolean);

  const out: any[] = [];
  const seen = new Set<string>();

  for (const raw of all) {
    const p = typeof raw === "string" ? { url: raw } : raw || {};
    const originalUri = String(p?.uri || "").trim();
    const inferredName = originalUri
      ? decodeURIComponent(originalUri.split("?")[0]).split(/[\/]/).pop()
      : "";
    const name = String(p?.name || inferredName || "").trim() || undefined;
    const type = String(p?.type || p?.mime || "").trim() || undefined;
    const dataUrl = String(p?.dataUrl || "").trim();
    const filePath = String(p?.filePath || p?.localPath || p?.path || "").trim();

    if (dataUrl.startsWith("data:")) {
      const dedup = `${dataUrl.length}:${dataUrl.slice(-160)}::${name || ""}`;
      if (seen.has(dedup)) continue;
      seen.add(dedup);
      out.push({ id: p?.id, name, type, dataUrl });
      continue;
    }

    const url =
      String(p?.url || "").trim() ||
      String(p?.publicUrl || "").trim() ||
      String(p?.downloadUrl || "").trim() ||
      String(p?.storagePath || "").trim() ||
      String(p?.storageKey || "").trim() ||
      "";

    if (filePath) {
      const dedup = `${filePath}::${name || ""}`;
      if (seen.has(dedup)) continue;
      seen.add(dedup);
      out.push({
        id: p?.id,
        name,
        type,
        filePath,
        localPath: p?.localPath,
        storagePath: p?.storagePath,
        storageKey: p?.storageKey,
      });
      continue;
    }

    if (url) {
      const dedup = `${url}::${name || ""}`;
      if (seen.has(dedup)) continue;
      seen.add(dedup);
      out.push({
        id: p?.id,
        name,
        type,
        url,
        publicUrl: p?.publicUrl,
        storagePath: p?.storagePath,
        storageKey: p?.storageKey,
      });
      continue;
    }

    if (originalUri) {
      // file:/content:/ph: non sono leggibili dal server. Conserviamo però
      // nome e URI per poter ritrovare il file già sincronizzato nel progetto.
      const dedup = `${originalUri}::${name || ""}`;
      if (seen.has(dedup)) continue;
      seen.add(dedup);
      out.push({ id: p?.id, name, type, uri: originalUri, mobileLocal: looksLocalUri(originalUri) });
      continue;
    }

    if (name) {
      const dedup = `name::${name}`;
      if (seen.has(dedup)) continue;
      seen.add(dedup);
      out.push({ id: p?.id, name, type });
    }
  }

  return out;
}

/**
 * POST /api/regie
 * -> Submit reale: scrive in INBOX (EINGEREICHT)
 */
router.post(
  "/",
  requireAuth,
  requireMode("SERVER_SYNC"),
  requireEmailVerified,
  async (req, res) => {
    try {
      const body = RegieMobileSchema.parse(req.body);

      const { fsKey, dbId } = await resolveProjectIds(body.projectId);
      const { dir } = await ensureInboxDir(body.projectId);

      const docId = String(body.id || "").trim() || rid();

      const normalizedAttachments = normalizeMobileAttachments({
        photos: body.photos,
        attachments: body.attachments,
      });

      const payload = {
        kind: "regie",
        ...body,
        id: docId,

        projectId: dbId ?? body.projectId,
        projectCode: body.projectCode?.trim() || fsKey,
        projectFsKey: fsKey,

        date: String(body.date || today()).slice(0, 10),
        reportType: body.reportType || "REGIE",
        comment: (body.comment ?? body.text ?? "").toString(),
        workflowStatus: "EINGEREICHT",
        submittedAt: Date.now(),
        createdAt: Number(body.createdAt ?? Date.now()),

        photos: normalizedAttachments,
        attachments: normalizedAttachments,
      };

      const out = path.join(dir, `${docId}.json`);
      writeJson(out, payload);
      console.log("[regie submit] out =", out, "exists =", fs.existsSync(out));

      return res.json({ ok: true, fsKey, docId, inboxPath: out });
    } catch (e: any) {
      console.error("POST /api/regie failed:", e);
      return res.status(500).json({ ok: false, error: e?.message || "Regie submit failed" });
    }
  }
);

/**
 * GET /api/regie/inbox/list?projectId=...
 */
router.get(
  "/inbox/list",
  requireAuth,
  requireMode("SERVER_SYNC"),
  requireEmailVerified,
  async (req, res) => {
    try {
      const projectId = String(req.query.projectId || "").trim();
      if (!projectId) return res.json({ ok: true, items: [] });

      const fsKey = await resolveProjectFsKey(projectId);
      const dir = regieInboxDir(fsKey);
      ensureDir(dir);

      const items = fs
        .readdirSync(dir)
        .filter((f) => f.toLowerCase().endsWith(".json"))
        .map((f) => readJson<any>(path.join(dir, f), null))
        .filter(Boolean)
        .sort((a, b) => Number(b?.submittedAt || 0) - Number(a?.submittedAt || 0));

      return res.json({ ok: true, fsKey, items });
    } catch (e: any) {
      console.error("GET /api/regie/inbox/list failed:", e);
      return res.status(500).json({ ok: false, error: e?.message || "Inbox list failed" });
    }
  }
);

function findInboxDocumentPath(fsKey: string, docId: string): string | null {
  const dir = regieInboxDir(fsKey);
  ensureDir(dir);

  const direct = path.join(dir, `${docId}.json`);
  if (fs.existsSync(direct)) return direct;

  const wanted = String(docId || "").trim();
  for (const file of fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".json"))) {
    const candidate = path.join(dir, file);
    const json = readJson<any>(candidate, null);
    const currentId = String(json?.id || json?.docId || "").trim();
    if (currentId && currentId === wanted) return candidate;
  }

  return null;
}

/**
 * POST /api/regie/inbox/update
 * -> salva le correzioni Web nello stesso documento Mobile prima della Freigabe.
 */
router.post(
  "/inbox/update",
  requireAuth,
  requireMode("SERVER_SYNC"),
  requireEmailVerified,
  async (req, res) => {
    try {
      const schema = z
        .object({
          projectId: z.string().min(1),
          docId: z.string().min(1),
          date: z.string().optional(),
          rows: z.array(z.any()).default([]),
          items: z.any().optional(),
          photos: z.array(z.any()).optional(),
          attachments: z.array(z.any()).optional(),
        })
        .passthrough();

      const body = schema.parse(req.body);
      const { fsKey, dbId } = await resolveProjectIds(body.projectId);
      const filePath = findInboxDocumentPath(fsKey, body.docId);
      if (!filePath) {
        return res.status(404).json({ ok: false, error: "doc not found in inbox" });
      }

      const current = readJson<any>(filePath, null);
      if (!current) return res.status(500).json({ ok: false, error: "invalid json" });

      const rawRows = Array.isArray(body.rows)
        ? body.rows
        : Array.isArray(body.items?.aufmass)
        ? body.items.aufmass
        : [];
      const rows = workflowRows({ ...current, ...body, rows: rawRows });
      const head = rows[0] || {};
      const normalizedAttachments = normalizeMobileAttachments({
        photos: body.photos || head.photos || current.photos,
        attachments: body.attachments || current.attachments,
      });

      const updated = {
        ...current,
        ...body,
        id: current.id || body.docId,
        docId: current.docId || body.docId,
        projectId: dbId ?? current.projectId ?? body.projectId,
        projectCode: current.projectCode || fsKey,
        projectFsKey: fsKey,
        date: String(body.date || head.date || current.date || today()).slice(0, 10),
        reportType: body.reportType || head.reportType || current.reportType || "REGIE",
        rows,
        items: { ...(current.items || {}), ...(body.items || {}), aufmass: rows },
        photos: normalizedAttachments,
        attachments: normalizedAttachments,
        workflowStatus: "EINGEREICHT",
        updatedAt: Date.now(),
        rejectionReason: null,
      };

      writeJson(filePath, updated);
      return res.json({ ok: true, fsKey, docId: body.docId, snapshot: updated });
    } catch (e: any) {
      console.error("POST /api/regie/inbox/update failed:", e);
      return res.status(500).json({ ok: false, error: e?.message || "Inbox update failed" });
    }
  }
);

/**
 * POST /api/regie/inbox/approve
 * -> crea direttamente il Regiebericht ufficiale in Verwaltung (/regieberichte)
 */
router.post(
  "/inbox/approve",
  requireAuth,
  requireMode("SERVER_SYNC"),
  requireEmailVerified,
  async (req, res) => {
    try {
      const schema = z.object({
        projectId: z.string().min(1),
        docId: z.string().min(1),
        approvedBy: z.string().optional(),
      });
      const body = schema.parse(req.body);

      const { fsKey } = await resolveProjectIds(body.projectId);

      const src = findInboxDocumentPath(fsKey, body.docId);
      if (!src) return res.status(404).json({ ok: false, error: "doc not found in inbox" });

      const obj = readJson<any>(src, null);
      if (!obj) return res.status(500).json({ ok: false, error: "invalid json" });

      const company = await loadPdfCompanyFromAdministration(req);
      const official = await persistOfficialRegiebericht({
        projectId: body.projectId,
        source: {
          ...obj,
          rejectionReason: null,
        },
        approvedBy: String(body.approvedBy || "").trim() || null,
        sourceDocId: body.docId,
        sourceLabel: "regie.inbox.approve",
        company,
      });

      try {
        fs.unlinkSync(src);
      } catch (unlinkError) {
        console.warn("[regie] inbox source cleanup failed:", src, unlinkError);
      }

      return res.json({
        ok: true,
        fsKey: official.fsKey,
        docId: body.docId,
        reportId: official.reportId,
        filename: official.jsonName,
        pdfUrl: official.pdfUrl,
        stored: official.jsonPath,
      });
    } catch (e: any) {
      console.error("POST /api/regie/inbox/approve failed:", e);
      return res.status(500).json({ ok: false, error: e?.message || "Approve failed" });
    }
  }
);

/**
 * POST /api/regie/inbox/reject
 */
router.post(
  "/inbox/reject",
  requireAuth,
  requireMode("SERVER_SYNC"),
  requireEmailVerified,
  async (req, res) => {
    try {
      const schema = z.object({
        projectId: z.string().min(1),
        docId: z.string().min(1),
        reason: z.string().optional(),
      });
      const body = schema.parse(req.body);

      const fsKey = await resolveProjectFsKey(body.projectId);
      const p = findInboxDocumentPath(fsKey, body.docId);
      if (!p) return res.status(404).json({ ok: false, error: "doc not found in inbox" });

      const obj = readJson<any>(p, null);
      if (!obj) return res.status(500).json({ ok: false, error: "invalid json" });

      const updated = {
        ...obj,
        workflowStatus: "ABGELEHNT",
        rejectedAt: Date.now(),
        rejectionReason: String(body.reason || "").trim() || "Keine Angabe",
      };

      writeJson(p, updated);
      return res.json({ ok: true, fsKey, docId: body.docId });
    } catch (e: any) {
      console.error("POST /api/regie/inbox/reject failed:", e);
      return res.status(500).json({ ok: false, error: e?.message || "Reject failed" });
    }
  }
);

/* =========================================================
 * FREIGABE LIST (approvati): SOLO cartella /regie
 * =======================================================*/
async function freigegebenListHandler(req: any, res: any) {
  try {
    const projectId = String(req.query.projectId || "").trim();
    if (!projectId) return res.json({ ok: true, items: [] });

    const fsKey = await resolveProjectFsKey(projectId);
    const dir = regieFreigabeDir(fsKey);
    ensureDir(dir);

    const items = fs
      .readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(".json"))
      .map((f) => readJson<any>(path.join(dir, f), null))
      .filter(Boolean)
      .sort((a, b) => Number(b?.approvedAt || 0) - Number(a?.approvedAt || 0));

    return res.json({ ok: true, fsKey, items });
  } catch (e: any) {
    console.error("GET freigegeben list failed:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Freigegeben list failed" });
  }
}

/**
 * GET /api/regie/final/list?projectId=...
 * (nome storico in UI) = FREIGEGEBEN
 */
router.get(
  "/final/list",
  requireAuth,
  requireMode("SERVER_SYNC"),
  requireEmailVerified,
  freigegebenListHandler
);

/**
 * GET /api/regie/freigegeben/list?projectId=...
 * alias leggibile (stesso handler)
 */
router.get(
  "/freigegeben/list",
  requireAuth,
  requireMode("SERVER_SYNC"),
  requireEmailVerified,
  freigegebenListHandler
);

/* =========================================================
 * ✅ READ ROUTES (per UI Web compat)
 * =======================================================*/
function readDocOr404(p: string) {
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, "utf8");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

router.get(
  "/inbox/read",
  requireAuth,
  requireMode("SERVER_SYNC"),
  requireEmailVerified,
  async (req, res) => {
    try {
      const projectId = String(req.query.projectId || "").trim();
      const docId = String(req.query.docId || "").trim();
      if (!projectId || !docId) {
        return res.status(400).json({ ok: false, error: "projectId/docId required" });
      }

      const fsKey = await resolveProjectFsKey(projectId);
      const p = findInboxDocumentPath(fsKey, docId);
      const json = p ? readDocOr404(p) : null;
      if (!json) return res.status(404).json({ ok: false, error: "Not Found" });

      return res.json({ ok: true, fsKey, snapshot: json });
    } catch (e: any) {
      console.error("GET /api/regie/inbox/read failed:", e);
      return res.status(500).json({ ok: false, error: e?.message || "Inbox read failed" });
    }
  }
);

router.get(
  "/freigegeben/read",
  requireAuth,
  requireMode("SERVER_SYNC"),
  requireEmailVerified,
  async (req, res) => {
    try {
      const projectId = String(req.query.projectId || "").trim();
      const docId = String(req.query.docId || "").trim();
      if (!projectId || !docId) {
        return res.status(400).json({ ok: false, error: "projectId/docId required" });
      }

      const fsKey = await resolveProjectFsKey(projectId);
      const p = path.join(regieFreigabeDir(fsKey), `${docId}.json`);
      const json = readDocOr404(p);
      if (!json) return res.status(404).json({ ok: false, error: "Not Found" });

      return res.json({ ok: true, fsKey, snapshot: json });
    } catch (e: any) {
      console.error("GET /api/regie/freigegeben/read failed:", e);
      return res
        .status(500)
        .json({ ok: false, error: e?.message || "Freigegeben read failed" });
    }
  }
);

router.get("/final/read", requireAuth, requireMode("SERVER_SYNC"), requireEmailVerified, async (req, res) => {
  (req as any).url = "/freigegeben/read";
  return (router as any).handle(req, res);
});

router.get("/approved/read", requireAuth, requireMode("SERVER_SYNC"), requireEmailVerified, async (req, res) => {
  (req as any).url = "/freigegeben/read";
  return (router as any).handle(req, res);
});

router.get(
  "/read",
  requireAuth,
  requireMode("SERVER_SYNC"),
  requireEmailVerified,
  async (req, res) => {
    try {
      const stageRaw = String(req.query.stage || "").trim().toLowerCase();
      const stage = stageRaw || "freigegeben";

      if (stage === "inbox") {
        (req as any).url = "/inbox/read";
        return (router as any).handle(req, res);
      }

      (req as any).url = "/freigegeben/read";
      return (router as any).handle(req, res);
    } catch (e: any) {
      console.error("GET /api/regie/read failed:", e);
      return res.status(500).json({ ok: false, error: e?.message || "Read failed" });
    }
  }
);

/* =========================================================
 * FINAL/HISTORY (ufficiali): SOLO cartella /regieberichte
 * =======================================================*/
router.get(
  "/",
  requireAuth,
  requireMode("SERVER_SYNC"),
  requireEmailVerified,
  async (req, res) => {
    try {
      const projectId = String(req.query.projectId || "").trim();
      const dateRaw = (req.query.date as string | undefined) || "";
      const date = dateRaw.slice(0, 10);
      const filenameParam = (req.query.filename as string | undefined)?.trim();

      if (!projectId || (!date && !filenameParam)) {
        return res.json({ ok: true, rows: [] });
      }

      const { dir } = await ensureRegieberichteDir(projectId);
      let jsonPath: string | null = null;

      if (filenameParam) {
        const safeName = path.basename(filenameParam);
        const candidate = path.join(dir, safeName);
        if (fs.existsSync(candidate)) jsonPath = candidate;
      } else {
        jsonPath = latestJsonForDate(dir, date);
      }

      if (!jsonPath || !fs.existsSync(jsonPath)) return res.json({ ok: true, rows: [] });

      const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

      const rows = Array.isArray(data.rows)
        ? data.rows
        : Array.isArray(data.items?.aufmass)
        ? data.items.aufmass
        : [];

      return res.json({ ok: true, ...data, rows });
    } catch (e: any) {
      console.error("GET /api/regie failed:", e);
      return res.status(500).json({ error: e?.message || "Regie load failed" });
    }
  }
);

router.get(
  "/list",
  requireAuth,
  requireMode("SERVER_SYNC"),
  requireEmailVerified,
  async (req, res) => {
    try {
      const projectId = String(req.query.projectId || "").trim();
      if (!projectId) return res.json({ ok: true, items: [] });

      const { dir, fsKey } = await ensureRegieberichteDir(projectId);
      if (!fs.existsSync(dir)) return res.json({ ok: true, items: [] });

      const items = fs
        .readdirSync(dir)
        .filter((f) => f.toLowerCase().endsWith(".json"))
        .map((f) => {
          const full = path.join(dir, f);
          let meta: any = {};
          try {
            meta = JSON.parse(fs.readFileSync(full, "utf8"));
          } catch {}

          const stats = fs.statSync(full);

          const m = f.match(/^Regiebericht_(\d{4}-\d{2}-\d{2})_(\d+)\.json$/i);
          const date = (meta.date as string | undefined)?.slice(0, 10) || m?.[1] || "";
          const reportId = (meta.reportId as string | undefined) || m?.[2] || "";

          const rowsCount = Array.isArray(meta.rows)
            ? meta.rows.length
            : Array.isArray(meta.items?.aufmass)
            ? meta.items.aufmass.length
            : 0;

          const base = date;
          const pdfName = reportId
            ? `Regiebericht_${base}_${reportId}.pdf`
            : `Regiebericht_${base}.pdf`;

          const pdfPath = path.join(dir, pdfName);
          const pdfUrl = fs.existsSync(pdfPath)
            ? `/projects/${encodeURIComponent(fsKey)}/regieberichte/${encodeURIComponent(pdfName)}`
            : null;

          return {
            date,
            filename: f,
            rows: rowsCount,
            savedAt: stats.mtime.toISOString(),
            pdfUrl,
            reportId,
            reportType: meta.reportType || "REGIE",
            fsKey,
          };
        })
        .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));

      return res.json({ ok: true, items });
    } catch (e: any) {
      console.error("GET /api/regie/list failed:", e);
      return res.status(500).json({ error: e?.message || "Regie list failed" });
    }
  }
);

/* =========================================================
 * ✅ COMMIT (Speichern) + Workflow-Cleanup ROBUSTO
 * =======================================================*/
function tryUnlink(p: string) {
  try {
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      return true;
    }
  } catch (e) {
    console.warn("[regie] unlink failed:", p, e);
  }
  return false;
}

function listJsonFiles(dir: string): string[] {
  try {
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(".json"))
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

/**
 * Tenta di eliminare un documento da /regie (freigegeben) in modo robusto:
 * 1) prova filename: <id>.json
 * 2) se fallisce: scan cartella e match su json.id === id
 * 3) fallback: match su regieNummer + date (se disponibili)
 */
function cleanupFreigegeben(opts: {
  fsKey: string;
  preferId?: string;
  regieNummer?: string;
  date?: string;
}) {
  const dir = regieFreigabeDir(opts.fsKey);
  ensureDir(dir);

  const deleted: string[] = [];
  const tried: string[] = [];

  const preferId = String(opts.preferId || "").trim();
  const date = String(opts.date || "").slice(0, 10);
  const regieNummer = String(opts.regieNummer || "").trim();

  // 1) filename direct
  if (preferId) {
    const p = path.join(dir, `${preferId}.json`);
    tried.push(p);
    if (tryUnlink(p)) deleted.push(p);
  }

  // 2) scan by json.id
  if (preferId && deleted.length === 0) {
    const files = listJsonFiles(dir);
    for (const f of files) {
      const j = readJson<any>(f, null);
      if (!j) continue;
      const jid = String(j?.id || j?.docId || "").trim();
      if (jid && jid === preferId) {
        tried.push(f);
        if (tryUnlink(f)) deleted.push(f);
      }
    }
  }

  // 3) fallback by regieNummer + date
  if (deleted.length === 0 && (regieNummer || date)) {
    const files = listJsonFiles(dir);
    for (const f of files) {
      const j = readJson<any>(f, null);
      if (!j) continue;

      const jNum = String(j?.regieNummer || "").trim();
      const jDate = String(j?.date || "").slice(0, 10);

      const okNum = regieNummer ? jNum === regieNummer : true;
      const okDate = date ? jDate === date : true;

      if (okNum && okDate) {
        tried.push(f);
        if (tryUnlink(f)) deleted.push(f);
      }
    }
  }

  return { dir, tried, deleted };
}

/**
 * POST /api/regie/commit/regiebericht
 * -> salva regiebericht ufficiale (json+pdf) in /regieberichte
 * -> ✅ rimuove SEMPRE il doc workflow da /regie se riesce (anche senza workflowDocId)
 */
router.post(
  "/commit/regiebericht",
  requireAuth,
  requireMode("SERVER_SYNC"),
  requireEmailVerified,
  async (req, res) => {
    try {
      const schema = z.object({
        projectId: z.string().min(1),
        date: z.string().min(1),

        // alias possibili dal frontend:
        workflowDocId: z.string().optional(),
        docId: z.string().optional(),
        sourceDocId: z.string().optional(),

        regieNummer: z.string().optional(),

        photos: z.array(z.any()).optional(),
        participants: z.any().optional(),

        note: z.any().optional(),
        rows: z.array(z.any()).default([]),
        items: z
          .object({
            aufmass: z.array(z.any()).optional(),
            lieferscheine: z.array(z.any()).optional(),
          })
          .optional(),
      });

      const body = schema.parse(req.body);

      const { fsKey, dbId } = await resolveProjectIds(body.projectId);
      const { dir } = await ensureRegieberichteDir(body.projectId);

      const { jsonName, pdfName, reportId } = nextRegieFile(dir, body.date);
      const jsonPath = path.join(dir, jsonName);

      const payload = {
        ...body,
        projectId: dbId ?? body.projectId,
        projectCode: fsKey,
        projectFsKey: fsKey,
        reportId,
      };

      fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf8");

      let jsonS3Key: string | undefined;
      if (S3_ENABLED && s3) {
        jsonS3Key = `projects/${fsKey}/regieberichte/${jsonName}`;
        await putToS3(jsonPath, jsonS3Key);
      }

      await createDocumentVersion({
        projectId: body.projectId,
        fsKey,
        filename: jsonName,
        kind: "DOC",
        localPath: jsonPath,
        s3Key: jsonS3Key,
        uploadedBy: null,
        meta: { source: "regie.commit", reportId },
      });

      const pdfPath = path.join(dir, pdfName);

      const photoObjs: { name: string; dataUrl: string }[] = (body.photos ?? [])
        .map((p: any, idx: number) => {
          const d = typeof p === "string" ? p : p?.dataUrl || p?.url;
          if (typeof d === "string" && d.startsWith("data:image")) {
            return { name: p?.name || `Foto ${idx + 1}`, dataUrl: d };
          }
          return null;
        })
        .filter(Boolean) as any;

      const company = await loadPdfCompanyFromAdministration(req);
      await createRegieberichtPdf(
        pdfInputFromSource({
          pdfPath,
          fsKey,
          source: {
            ...payload,
            company,
            photos: [...photoObjs, ...(Array.isArray((payload as any).photos) ? (payload as any).photos : [])],
          },
          rows: body.items?.aufmass || body.rows || [],
        })
      );

      let pdfS3Key: string | undefined;
      if (S3_ENABLED && s3) {
        pdfS3Key = `projects/${fsKey}/regieberichte/${pdfName}`;
        await putToS3(pdfPath, pdfS3Key);
      }

      await createDocumentVersion({
        projectId: body.projectId,
        fsKey,
        filename: pdfName,
        kind: "PDF",
        localPath: pdfPath,
        s3Key: pdfS3Key,
        uploadedBy: null,
        meta: { source: "regie.commit.pdf", reportId },
      });

      // ✅ CLEANUP ROBUSTO in /regie
      const preferId =
        String(body.workflowDocId || "").trim() ||
        String(body.sourceDocId || "").trim() ||
        String(body.docId || "").trim();

      const cleanup = cleanupFreigegeben({
        fsKey,
        preferId,
        regieNummer: body.regieNummer,
        date: body.date,
      });

      const pdfUrl = `/projects/${encodeURIComponent(fsKey)}/regieberichte/${encodeURIComponent(
        pdfName
      )}`;

      return res.json({
        ok: true,
        pdfUrl,
        reportId,
        fsKey,
        filename: jsonName,
        cleanup,
      });
    } catch (e: any) {
      console.error("POST /api/regie/commit/regiebericht failed:", e);
      return res.status(500).send(e?.message || "Regie commit failed");
    }
  }
);

/**
 * POST /api/regie/upload
 * -> carica in staging e poi sposta in /raw
 */
router.post(
  "/upload",
  requireAuth,
  requireMode("SERVER_SYNC"),
  requireEmailVerified,
  upload.array("files", 20),
  async (req, res) => {
    try {
      const projectId = String((req.body as any)?.projectId || "").trim();
      if (!projectId) return res.status(400).json({ error: "projectId required" });

      const { dir: rawOut, fsKey } = await ensureRawDir(projectId);
      const incoming = (req.files as Express.Multer.File[]) || [];

      const moved: Express.Multer.File[] = [];
      for (const f of incoming) {
        const target = path.join(rawOut, path.basename(f.path));
        if (path.dirname(f.path) !== rawOut) {
          try {
            fs.renameSync(f.path, target);
          } catch {
            fs.copyFileSync(f.path, target);
            fs.unlinkSync(f.path);
          }
          moved.push({ ...f, path: target } as any);
        } else {
          moved.push(f);
        }
      }

      const files = moved.map((f) => ({
        fileId: path.basename(f.filename),
        path: f.path,
        url: `/projects/${encodeURIComponent(fsKey)}/raw/${encodeURIComponent(
          path.basename(f.path)
        )}`,
        originalname: f.originalname,
      }));

      const ocr = await recognizeFromFiles(files.map((f) => f.path));

      const aufmass = matchLVPositions(ocr).map((a, i) => ({
        id: `A${Date.now()}_${i}`,
        ...a,
      }));

      const lieferscheine = parseLieferschein(ocr).map((s, i) => ({
        id: `L${Date.now()}_${i}`,
        ...s,
        belegUrl: files[i]?.url,
      }));

      const persisted: Array<{ local: string; s3Key?: string; documentId?: string | null }> =
        [];
      for (const f of files) {
        let s3Key: string | undefined;
        if (S3_ENABLED && s3) {
          s3Key = `projects/${fsKey}/raw/${path.basename(f.path)}`;
          await putToS3(f.path, s3Key);
        }
        const isPdf = (f.originalname || "").toLowerCase().endsWith(".pdf");
        const kind = isPdf ? "PDF" : "IMAGE";

        const doc = await createDocumentVersion({
          projectId,
          fsKey,
          filename: f.originalname || path.basename(f.path),
          kind,
          localPath: f.path,
          s3Key,
          uploadedBy: null,
          meta: { source: "regie.upload" },
        });

        persisted.push({ local: f.path, s3Key, documentId: doc.documentId });
      }

      return res.json({
        ok: true,
        fsKey,
        files,
        recognized: { aufmass, lieferscheine },
        persisted,
      });
    } catch (e: any) {
      console.error("POST /api/regie/upload failed:", e);
      return res.status(500).send(e?.message || "Upload failed");
    }
  }
);

/**
 * POST /api/regie/preview
 * -> genera una preview server con lo stesso template usato da Mobile e Verwaltung.
 * Non crea una voce nella cronologia ufficiale.
 */
router.post(
  "/preview",
  requireAuth,
  requireMode("SERVER_SYNC"),
  requireEmailVerified,
  async (req, res) => {
    try {
      const schema = z
        .object({
          projectId: z.string().min(1),
          date: z.string().min(1),
          rows: z.array(z.any()).default([]),
          items: z.any().optional(),
          photos: z.array(z.any()).optional(),
          participants: z.any().optional(),
          company: z.any().optional(),
          projectName: z.string().optional(),
          regieNummer: z.string().optional(),
          auftraggeber: z.string().optional(),
          arbeitsbeginn: z.string().optional(),
          arbeitsende: z.string().optional(),
          pause1: z.string().optional(),
          pause2: z.string().optional(),
          blattNr: z.string().optional(),
          wetter: z.string().optional(),
          kostenstelle: z.string().optional(),
          bemerkungen: z.string().optional(),
          note: z.any().optional(),
        })
        .passthrough();

      const body = schema.parse(req.body);
      const { fsKey } = await resolveProjectIds(body.projectId);
      const previewDir = path.join(regieberichteDir(fsKey), "preview");
      ensureDir(previewDir);

      for (const file of fs.readdirSync(previewDir)) {
        const full = path.join(previewDir, file);
        try {
          const ageMs = Date.now() - fs.statSync(full).mtimeMs;
          if (ageMs > 24 * 60 * 60 * 1000) fs.unlinkSync(full);
        } catch {}
      }

      const safeDate = String(body.date || today()).slice(0, 10);
      const previewName = `Regiebericht_Vorschau_${safeDate}_${Date.now()}.pdf`;
      const pdfPath = path.join(previewDir, previewName);
      const rows = workflowRows({ ...body, rows: body.rows || body.items?.aufmass || [] });

      const company = await loadPdfCompanyFromAdministration(req);
      await createRegieberichtPdf(
        pdfInputFromSource({
          pdfPath,
          fsKey,
          source: { ...body, company, rows },
          rows,
        })
      );

      const pdfUrl = `/projects/${encodeURIComponent(fsKey)}/regieberichte/preview/${encodeURIComponent(previewName)}`;
      return res.json({ ok: true, pdfUrl, fsKey });
    } catch (e: any) {
      console.error("POST /api/regie/preview failed:", e);
      return res.status(500).json({ ok: false, error: e?.message || "Preview failed" });
    }
  }
);

/**
 * POST /api/regie/generate
 * -> genera PDF ufficiale in /regieberichte
 */
router.post(
  "/generate",
  requireAuth,
  requireMode("SERVER_SYNC"),
  requireEmailVerified,
  async (req, res) => {
    try {
      const schema = z.object({
        projectId: z.string().min(1),
        date: z.string().min(1),
        photos: z.array(z.any()).optional(),
        items: z
          .object({
            aufmass: z.array(z.any()).optional(),
            lieferscheine: z.array(z.any()).optional(),
          })
          .optional(),
        participants: z.any().optional(),
        meta: z.any().optional(),
      });

      const { projectId, date, photos, items, participants } = schema.parse(req.body);

      const { fsKey } = await resolveProjectIds(projectId);
      const { dir } = await ensureRegieberichteDir(projectId);

      const { pdfName, reportId } = nextRegieFile(dir, date);
      const pdfPath = path.join(dir, pdfName);

      const photoObjs: { name: string; dataUrl: string }[] = (photos ?? [])
        .map((p: any, idx: number) => {
          const d = typeof p === "string" ? p : p?.dataUrl || p?.url;
          if (typeof d === "string" && d.startsWith("data:image")) {
            return { name: p?.name || `Foto ${idx + 1}`, dataUrl: d };
          }
          return null;
        })
        .filter(Boolean) as any;

      const company = await loadPdfCompanyFromAdministration(req);
      await createRegieberichtPdf(
        pdfInputFromSource({
          pdfPath,
          fsKey,
          source: {
            projectId,
            date,
            company,
            photos: photoObjs,
            items: items || {},
            participants: participants || {},
          },
          rows: items?.aufmass || [],
        })
      );

      let s3Key: string | undefined;
      if (S3_ENABLED && s3) {
        s3Key = `projects/${fsKey}/regieberichte/${pdfName}`;
        await putToS3(pdfPath, s3Key);
      }

      await createDocumentVersion({
        projectId,
        fsKey,
        filename: pdfName,
        kind: "PDF",
        localPath: pdfPath,
        s3Key,
        uploadedBy: null,
        meta: { source: "regie.generate", reportId },
      });

      const pdfUrl = `/projects/${encodeURIComponent(fsKey)}/regieberichte/${encodeURIComponent(
        pdfName
      )}`;
      return res.json({ ok: true, pdfUrl, reportId, fsKey });
    } catch (e: any) {
      console.error("POST /api/regie/generate failed:", e);
      return res.status(500).send(e?.message || "Generate failed");
    }
  }
);

export default router;

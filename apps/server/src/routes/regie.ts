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

/* ================== S3 / MinIO ================== */
const S3_ENABLED = !!process.env.S3_ENDPOINT;
const S3_BUCKET = process.env.S3_BUCKET || "rlc-storage";
const s3 = S3_ENABLED
  ? new S3Client({
      region: process.env.S3_REGION || "eu-central-1",
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || "minioadmin",
        secretAccessKey: process.env.S3_SECRET_KEY || "minioadmin",
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
});

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

  for (const p of all) {
    const name = String(p?.name || "").trim() || undefined;
    const type = String(p?.type || "").trim() || undefined;

    const url =
      String(p?.url || "").trim() ||
      String(p?.publicUrl || "").trim() ||
      String(p?.storagePath || "").trim() ||
      "";

    if (!url) {
      const uri = String(p?.uri || "").trim();
      if (!uri || looksLocalUri(uri)) continue;

      const key2 = uri;
      const dedup2 = `${key2}::${name || ""}`;
      if (seen.has(dedup2)) continue;
      seen.add(dedup2);
      out.push({ id: p?.id, name, type, url: uri });
      continue;
    }

    const key = url || name || JSON.stringify(p);
    const dedup = `${key}::${name || ""}`;
    if (seen.has(dedup)) continue;
    seen.add(dedup);

    out.push({ id: p?.id, name, type, url });
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

/**
 * POST /api/regie/inbox/approve
 * -> sposta in FREIGABE: data/projects/<fsKey>/regie/<docId>.json
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

      const { fsKey, dbId } = await resolveProjectIds(body.projectId);

      let src = path.join(regieInboxDir(fsKey), `${body.docId}.json`);

      if (!fs.existsSync(src)) {
        // fallback: scan inbox e match su json.id/docId
        const dir = regieInboxDir(fsKey);
        const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".json"));
        let found: string | null = null;

        for (const f of files) {
          const p = path.join(dir, f);
          const j = readJson<any>(p, null);
          if (!j) continue;
          const jid = String(j?.id || j?.docId || "").trim();
          if (jid && jid === String(body.docId).trim()) {
            found = p;
            break;
          }
        }

        if (found) src = found;
        else return res.status(404).json({ ok: false, error: "doc not found in inbox" });
      }

      const obj = readJson<any>(src, null);
      if (!obj) return res.status(500).json({ ok: false, error: "invalid json" });

      const now = Date.now();
      const freigabeObj = {
        ...obj,

        projectId: dbId ?? obj.projectId ?? body.projectId,
        projectCode: obj.projectCode ?? fsKey,
        projectFsKey: fsKey,

        workflowStatus: "FREIGEGEBEN",
        approvedAt: now,
        approvedBy: String(body.approvedBy || "").trim() || null,
        rejectionReason: null,
        savedAt: new Date().toISOString(),
      };

      const dstDir = regieFreigabeDir(fsKey);
      ensureDir(dstDir);
      const dst = path.join(dstDir, `${body.docId}.json`);
      writeJson(dst, freigabeObj);

      try {
        fs.unlinkSync(src);
      } catch {}

      return res.json({ ok: true, fsKey, docId: body.docId, finalPath: dst });
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
        reason: z.string().min(1),
      });
      const body = schema.parse(req.body);

      const fsKey = await resolveProjectFsKey(body.projectId);
      const p = path.join(regieInboxDir(fsKey), `${body.docId}.json`);
      if (!fs.existsSync(p)) {
        return res.status(404).json({ ok: false, error: "doc not found in inbox" });
      }

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
      const p = path.join(regieInboxDir(fsKey), `${docId}.json`);
      const json = readDocOr404(p);
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

      await createRegieberichtPdf({
        pdfPath,
        projectId: fsKey,
        date: body.date,
        photos: photoObjs,
        aufmass: body.items?.aufmass || body.rows || [],
        lieferscheine: body.items?.lieferscheine || [],
        participants: body.participants || {},
      });

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

      await createRegieberichtPdf({
        pdfPath,
        projectId: fsKey,
        date,
        photos: photoObjs,
        aufmass: items?.aufmass || [],
        lieferscheine: items?.lieferscheine || [],
        participants: participants || {},
      });

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

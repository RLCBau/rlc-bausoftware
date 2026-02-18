// apps/server/src/routes/ls.ts
import express from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { PROJECTS_ROOT } from "../lib/projectsRoot";

const router = express.Router();
console.log("[ls] router loaded");

/* =========================================================
 * Helpers
 * =======================================================*/
function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeDate(d?: string): string {
  const s = String(d || "").slice(0, 10);
  return s || new Date().toISOString().slice(0, 10);
}

function safeName(name: string) {
  return String(name || "").replace(/[^\w.\-() ]+/g, "_").slice(0, 180);
}

function escFsRel(p: string) {
  return String(p || "").replace(/\\/g, "/");
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

function rid() {
  return `ls_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function mimeFromExt(fileName: string) {
  const ext = String(fileName || "").toLowerCase().split(".").pop() || "";
  if (ext === "pdf") return "application/pdf";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "application/octet-stream";
}

/* =========================================================
 * FS-Key policy (DEFINITIVO, identico a regie.ts)
 * =======================================================*/
function safeFsKey(input: string) {
  return String(input || "")
    .trim()
    .replace(/[^A-Za-z0-9_\-]/g, "_")
    .slice(0, 120);
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
 * ✅ Robust FS-Key resolver:
 * - BA-... => fsKey diretto
 * - DB lookup (id o code) => code
 * - FS fallback: cerca in PROJECTS_ROOT un project.json con id==input
 */
async function resolveProjectFsKey(input: string): Promise<string> {
  const trimmed = String(input || "").trim();
  if (!trimmed) return "UNKNOWN";

  // 1) se è già fsKey BA-..., ok
  if (/^BA-\d{4}[-_]/i.test(trimmed)) return safeFsKey(trimmed);

  // 2) prova DB (id o code)
  try {
    const proj = await prisma.project.findFirst({
      where: { OR: [{ id: trimmed }, { code: trimmed }] },
      select: { code: true },
    });
    const code = String((proj as any)?.code || "").trim();
    if (code) return safeFsKey(code);
  } catch {
    // ignore -> fallback FS sotto
  }

  // 3) fallback filesystem: scan project.json per match su id
  try {
    if (fs.existsSync(PROJECTS_ROOT)) {
      const entries = fs.readdirSync(PROJECTS_ROOT, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        const fsKeyCandidate = e.name;
        if (!/^BA-\d{4}[-_]/i.test(fsKeyCandidate)) continue; // riduce scan inutile

        const pj = path.join(PROJECTS_ROOT, fsKeyCandidate, "project.json");
        if (!fs.existsSync(pj)) continue;

        const data = readJson<any>(pj, null);
        const id = String(data?.id || "").trim();
        if (id && id === trimmed) return safeFsKey(fsKeyCandidate);

        // (opzionale) se qualcuno salva projectCode dentro project.json
        const code = String(data?.code || "").trim();
        if (code && code === trimmed) return safeFsKey(fsKeyCandidate);
      }
    }
  } catch {
    // ignore
  }

  return "UNKNOWN";
}

async function resolveProjectIds(inputProjectIdOrCode: string) {
  const projectIdOrCode = String(inputProjectIdOrCode || "").trim();
  const fsKey = await resolveProjectFsKey(projectIdOrCode);
  const dbId = await resolveProjectDbId(projectIdOrCode);
  return { fsKey, dbId };
}

/* =========================================================
 * Directory Policy (COERENTE con regie.ts)
 *
 * Inbox workflow:
 *  - inbox json:   data/projects/<fsKey>/eingangspruefung/ls/<docId>.json
 *  - inbox files:  data/projects/<fsKey>/eingangspruefung/ls/<docId>/files/<file>
 *
 * Freigabe (approvati):
 *  - json:         data/projects/<fsKey>/ls/<docId>.json
 *
 * Final/History (ufficiali):
 *  - json:         data/projects/<fsKey>/lieferscheine/Lieferschein_YYYY-MM-DD_001.json
 *  - files:        data/projects/<fsKey>/lieferscheine/files/<file>
 * =======================================================*/
function projectRoot(fsKey: string) {
  return path.join(PROJECTS_ROOT, fsKey);
}

function lsInboxDir(fsKey: string) {
  // SERVER: Inbox = Eingangsprüfung
  return path.join(projectRoot(fsKey), "eingangspruefung", "ls");
}

function lsInboxDocDir(fsKey: string, docId: string) {
  return path.join(lsInboxDir(fsKey), docId);
}
function lsInboxDocFilesDir(fsKey: string, docId: string) {
  return path.join(lsInboxDocDir(fsKey, docId), "files");
}

function lsFreigabeDir(fsKey: string) {
  return path.join(projectRoot(fsKey), "ls");
}

function lieferscheineDir(fsKey: string) {
  return path.join(projectRoot(fsKey), "lieferscheine");
}
function lieferscheineFilesDir(fsKey: string) {
  return path.join(lieferscheineDir(fsKey), "files");
}

async function ensureInboxDir(projectIdOrCode: string) {
  const fsKey = await resolveProjectFsKey(projectIdOrCode);
  const dir = lsInboxDir(fsKey);
  ensureDir(dir);
  return { fsKey, dir };
}

async function ensureInboxDocDirs(projectIdOrCode: string, docId: string) {
  const fsKey = await resolveProjectFsKey(projectIdOrCode);
  const docBase = lsInboxDocDir(fsKey, docId);
  const filesDir = lsInboxDocFilesDir(fsKey, docId);
  ensureDir(docBase);
  ensureDir(filesDir);
  return { fsKey, docBase, filesDir };
}

async function ensureFreigabeDir(projectIdOrCode: string) {
  const fsKey = await resolveProjectFsKey(projectIdOrCode);
  const dir = lsFreigabeDir(fsKey);
  ensureDir(dir);
  return { fsKey, dir };
}

async function ensureHistoryDirs(projectIdOrCode: string) {
  const fsKey = await resolveProjectFsKey(projectIdOrCode);
  const dir = lieferscheineDir(fsKey);
  const filesDir = lieferscheineFilesDir(fsKey);
  ensureDir(dir);
  ensureDir(filesDir);
  return { fsKey, dir, filesDir };
}

/** prossimo file per data: Lieferschein_YYYY-MM-DD_001.json */
function nextLsFile(dir: string, date: string) {
  const d = safeDate(date);
  const prefix = `Lieferschein_${d}`;
  const all = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.toLowerCase().endsWith(".json"));

  if (!all.length) {
    return { jsonName: `${prefix}_001.json`, reportId: "001" };
  }

  const re = new RegExp(`^Lieferschein_${d}_(\\d+)\\.json$`, "i");
  const nums = all
    .map((f) => {
      const m = f.match(re);
      return m?.[1] ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => Number.isFinite(n) && n > 0);

  const next = (nums.length ? Math.max(...nums) : 1) + 1;
  const reportId = String(next).padStart(3, "0");
  return { jsonName: `${prefix}_${reportId}.json`, reportId };
}

function latestJsonForDate(dir: string, date: string): string | null {
  const d = safeDate(date);
  const prefix = `Lieferschein_${d}`;
  const all = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.toLowerCase().endsWith(".json"))
    .sort();
  if (!all.length) return null;
  return path.join(dir, all[all.length - 1]);
}

/* =========================================================
 * Multer: STAGING (destination non può essere async)
 * =======================================================*/
const STAGING_FILES = path.join(PROJECTS_ROOT, "_staging", "ls", "files");
ensureDir(STAGING_FILES);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, STAGING_FILES),
  filename: (_req, file, cb) => {
    const base = safeName(file.originalname || `file_${Date.now()}`);
    cb(null, `${Date.now()}__${base}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
});

/* =========================================================
 * Schemas
 * =======================================================*/
const AttachmentSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  type: z.string().optional(),
  uri: z.string().optional(),
  url: z.string().optional(),
  publicUrl: z.string().optional(),
  storagePath: z.string().optional(),
});

const LieferscheinDocSchema = z.object({
  id: z.string().optional(),
  projectId: z.string().min(1),
  projectCode: z.string().optional(),
  date: z.string().min(1),

  lieferscheinNummer: z.string().optional(),
  supplier: z.string().optional(),
  driver: z.string().optional(),
  material: z.string().optional(),
  kostenstelle: z.string().optional(),
  lvItemPos: z.string().nullable().optional(),

  note: z.any().optional(),
  rows: z.array(z.any()).optional(),
  items: z.any().optional(),

  attachments: z.array(AttachmentSchema).optional(),

  workflowStatus: z.enum(["DRAFT", "EINGEREICHT", "FREIGEGEBEN", "ABGELEHNT"]).optional(),
  submittedAt: z.number().nullable().optional(),
  rejectionReason: z.string().nullable().optional(),
  createdAt: z.number().optional(),
});

function looksLocalUri(u?: string) {
  const s = String(u || "");
  return s.startsWith("file:") || s.startsWith("content:") || s.startsWith("ph:");
}

function normalizeAttachments(input: { attachments?: any[] }) {
  const att = Array.isArray(input.attachments) ? input.attachments : [];
  const out: any[] = [];
  const seen = new Set<string>();

  for (const a of att) {
    if (!a) continue;
    const name = String(a?.name || "").trim() || undefined;
    const type = String(a?.type || "").trim() || undefined;

    const url =
      String(a?.url || "").trim() ||
      String(a?.publicUrl || "").trim() ||
      String(a?.storagePath || "").trim() ||
      "";

    if (!url) {
      const uri = String(a?.uri || "").trim();
      if (!uri || looksLocalUri(uri)) continue;

      const k = `${uri}::${name || ""}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ id: a?.id, name, type, url: uri });
      continue;
    }

    const k = `${url}::${name || ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ id: a?.id, name, type, url });
  }

  return out;
}

/* =========================================================
 * ✅ INBOX WORKFLOW
 * =======================================================*/

/**
 * POST /api/ls
 * -> Submit reale: scrive JSON in INBOX (EINGEREICHT)
 */
router.post("/", async (req, res) => {
  try {
    const body = LieferscheinDocSchema.parse(req.body);

    const { fsKey, dbId } = await resolveProjectIds(body.projectId);
    const { dir } = await ensureInboxDir(body.projectId);

    const docId = String(body.id || "").trim() || rid();
    const normalizedAttachments = normalizeAttachments({
      attachments: body.attachments,
    });

    const payload = {
      kind: "lieferschein",
      ...body,
      id: docId,

      projectId: dbId ?? body.projectId, // ✅ UUID se possibile
      projectCode: body.projectCode?.trim() || fsKey,
      projectFsKey: fsKey,

      date: safeDate(body.date),
      workflowStatus: "EINGEREICHT",
      submittedAt: Date.now(),
      createdAt: Number(body.createdAt ?? Date.now()),
      rejectionReason: null,

      attachments: normalizedAttachments,
    };

    const out = path.join(dir, `${docId}.json`);
    writeJson(out, payload);

    return res.json({ ok: true, fsKey, docId, inboxPath: out });
  } catch (e: any) {
    console.error("POST /api/ls failed:", e);
    return res.status(500).json({ ok: false, error: e?.message || "LS submit failed" });
  }
});

/**
 * POST /api/ls/inbox/upload
 * multipart/form-data:
 *  - projectId
 *  - docId (optional; se manca lo genero)
 *  - meta (optional JSON string)
 *  - files[]
 *
 * Salva in: data/projects/<fsKey>/eingangspruefung/ls/<docId>/files/<filename>
 * e mantiene/aggiorna: data/projects/<fsKey>/eingangspruefung/ls/<docId>.json
 */
router.post("/inbox/upload", upload.array("files", 20), async (req, res) => {
  try {
    const projectId = String((req.body as any)?.projectId || "").trim();
    if (!projectId) return res.status(400).json({ ok: false, error: "projectId required" });

    const docId = String((req.body as any)?.docId || "").trim() || rid();
    const { fsKey, filesDir } = await ensureInboxDocDirs(projectId, docId);

    const incoming = (req.files as Express.Multer.File[]) || [];
    const items = incoming.map((f) => {
      const target = path.join(filesDir, path.basename(f.filename));
      if (path.dirname(f.path) !== filesDir) {
        try {
          fs.renameSync(f.path, target);
        } catch {
          fs.copyFileSync(f.path, target);
          try {
            fs.unlinkSync(f.path);
          } catch {}
        }
      }

      const rel = escFsRel(
        path.join(fsKey, "eingangspruefung", "ls", docId, "files", path.basename(target))
      );

      return {
        name: f.originalname || f.filename,
        type: f.mimetype || mimeFromExt(f.filename),
        storagePath: target,
        url: `/projects/${rel}`,
      };
    });

    // merge meta -> inbox json
    const inboxJsonPath = path.join(lsInboxDir(fsKey), `${docId}.json`);
    const prev = readJson<any>(inboxJsonPath, null);

    let meta: any = null;
    const metaRaw = (req.body as any)?.meta;
    if (metaRaw) {
      try {
        meta = typeof metaRaw === "string" ? JSON.parse(metaRaw) : metaRaw;
      } catch {
        meta = null;
      }
    }

    const normalizedPrevAtt = normalizeAttachments({ attachments: prev?.attachments });
    const normalizedMetaAtt = normalizeAttachments({ attachments: meta?.attachments });

    const merged = [...normalizedPrevAtt, ...normalizedMetaAtt, ...items].filter(Boolean);
    const seen = new Set<string>();
    const attachments = merged.filter((a) => {
      const k = String(a?.url || a?.name || "").trim();
      if (!k) return true;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    const { dbId } = await resolveProjectIds(projectId);

    const payload = {
      kind: "lieferschein",
      ...(prev || {}),
      ...(meta || {}),
      id: docId,

      projectId: dbId ?? prev?.projectId ?? meta?.projectId ?? projectId,
      projectCode: (meta?.projectCode || prev?.projectCode || fsKey).trim?.() || fsKey,
      projectFsKey: fsKey,

      date: safeDate(meta?.date || prev?.date),
      workflowStatus: "EINGEREICHT",
      submittedAt: Number(prev?.submittedAt || meta?.submittedAt || Date.now()),
      createdAt: Number(prev?.createdAt || meta?.createdAt || Date.now()),
      rejectionReason: prev?.rejectionReason ?? meta?.rejectionReason ?? null,

      attachments,
    };

    writeJson(inboxJsonPath, payload);

    return res.json({ ok: true, fsKey, docId, items, inboxJsonPath });
  } catch (e: any) {
    console.error("POST /api/ls/inbox/upload failed:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Inbox upload failed" });
  }
});

/**
 * GET /api/ls/inbox/list?projectId=...
 *
 * ✅ FIX: restituisce sia INBOX che FREIGEGEBEN
 * così il web che chiama solo /inbox/list vede anche i docs in /ls
 */
router.get("/inbox/list", async (req, res) => {
  try {
    const projectId = String((req.query as any)?.projectId || "").trim();
    if (!projectId) return res.json({ ok: true, items: [] });

    const fsKey = await resolveProjectFsKey(projectId);

    // inbox
    const inboxDir = lsInboxDir(fsKey);
    ensureDir(inboxDir);

    const inboxItems = fs
      .readdirSync(inboxDir)
      .filter((f) => f.toLowerCase().endsWith(".json"))
      .map((f) => readJson<any>(path.join(inboxDir, f), null))
      .filter(Boolean);

    // freigegeben (/ls)
    const freigDir = lsFreigabeDir(fsKey);
    ensureDir(freigDir);

    const freigItems = fs
      .readdirSync(freigDir)
      .filter((f) => f.toLowerCase().endsWith(".json"))
      .map((f) => readJson<any>(path.join(freigDir, f), null))
      .filter(Boolean);

    const items = [...inboxItems, ...freigItems].sort(
      (a, b) =>
        Number(b?.approvedAt || b?.submittedAt || 0) -
        Number(a?.approvedAt || a?.submittedAt || 0)
    );

    return res.json({ ok: true, fsKey, items });
  } catch (e: any) {
    console.error("GET /api/ls/inbox/list failed:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Inbox list failed" });
  }
});

/**
 * GET /api/ls/inbox/read?projectId=...&docId=...
 */
router.get("/inbox/read", async (req, res) => {
  try {
    const projectId = String((req.query as any)?.projectId || "").trim();
    const docId = String((req.query as any)?.docId || "").trim();
    if (!projectId || !docId) {
      return res.status(400).json({ ok: false, error: "projectId/docId required" });
    }
    const fsKey = await resolveProjectFsKey(projectId);
    const p = path.join(lsInboxDir(fsKey), `${docId}.json`);
    const json = readJson<any>(p, null);
    if (!json) return res.status(404).json({ ok: false, error: "Not Found" });
    return res.json({ ok: true, fsKey, snapshot: json });
  } catch (e: any) {
    console.error("GET /api/ls/inbox/read failed:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Inbox read failed" });
  }
});

/**
 * POST /api/ls/inbox/reject
 */
router.post("/inbox/reject", async (req, res) => {
  try {
    const schema = z.object({
      projectId: z.string().min(1),
      docId: z.string().min(1),
      reason: z.string().min(1),
    });
    const body = schema.parse(req.body);

    const fsKey = await resolveProjectFsKey(body.projectId);
    const p = path.join(lsInboxDir(fsKey), `${body.docId}.json`);
    if (!fs.existsSync(p))
      return res.status(404).json({ ok: false, error: "doc not found in inbox" });

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
    console.error("POST /api/ls/inbox/reject failed:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Reject failed" });
  }
});

/**
 * POST /api/ls/inbox/approve
 * -> sposta JSON in FREIGABE: data/projects/<fsKey>/ls/<docId>.json
 * -> sposta files (se presenti) da eingangspruefung/ls/<docId>/files -> lieferscheine/files
 *    e riscrive gli URL degli allegati verso /lieferscheine/files
 */
router.post("/inbox/approve", async (req, res) => {
  try {
    const schema = z.object({
      projectId: z.string().min(1),
      docId: z.string().min(1),
      approvedBy: z.string().optional(),
    });
    const body = schema.parse(req.body);

    const { fsKey, dbId } = await resolveProjectIds(body.projectId);

    const src = path.join(lsInboxDir(fsKey), `${body.docId}.json`);
    if (!fs.existsSync(src))
      return res.status(404).json({ ok: false, error: "doc not found in inbox" });

    const obj = readJson<any>(src, null);
    if (!obj) return res.status(500).json({ ok: false, error: "invalid json" });

    // move files -> history files folder (stabile)
    const inboxFiles = lsInboxDocFilesDir(fsKey, body.docId);
    const { filesDir: histFilesDir } = await ensureHistoryDirs(fsKey);

    const moved: { from: string; to: string; url: string }[] = [];
    if (fs.existsSync(inboxFiles)) {
      const names = fs.readdirSync(inboxFiles).filter((f) => !!f && !f.startsWith("."));
      for (const fn of names) {
        const from = path.join(inboxFiles, fn);
        const to = path.join(histFilesDir, fn);

        try {
          fs.renameSync(from, to);
        } catch {
          fs.copyFileSync(from, to);
          try {
            fs.unlinkSync(from);
          } catch {}
        }

        const rel = escFsRel(path.join(fsKey, "lieferscheine", "files", fn));
        moved.push({ from, to, url: `/projects/${rel}` });
      }

      // cleanup eingangspruefung/ls/<docId>
      try {
        fs.rmSync(lsInboxDocDir(fsKey, body.docId), { recursive: true, force: true });
      } catch {}
    }

    // rewrite attachments: inbox -> history files url (by filename)
    const prevAtt: any[] = Array.isArray(obj.attachments) ? obj.attachments : [];
    const rewritten = prevAtt.map((a) => {
      const url = String(a?.url || a?.publicUrl || "");
      if (url.includes(`/projects/${fsKey}/lieferscheine/files/`)) return a;

      const m = url.match(
        /\/(inbox|eingangspruefung)\/ls\/[^/]+\/files\/([^/?#]+)$/i
      );
      if (m && m[2]) {
        const fn = m[2];
        const rel = escFsRel(path.join(fsKey, "lieferscheine", "files", fn));
        return { ...a, url: `/projects/${rel}` };
      }

      return a;
    });

    const movedAsAtt = moved.map((m) => ({
      name: path.basename(m.to),
      type: mimeFromExt(m.to),
      storagePath: m.to,
      url: m.url,
    }));

    const all = [...rewritten, ...movedAsAtt].filter(Boolean);
    const seen = new Set<string>();
    const finalAttachments = all.filter((a) => {
      const k = String(a?.url || a?.name || "").trim();
      if (!k) return true;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

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

      attachments: finalAttachments,
    };

    const { dir: freigabeDir } = await ensureFreigabeDir(fsKey);
    const dst = path.join(freigabeDir, `${body.docId}.json`);
    writeJson(dst, freigabeObj);

    try {
      fs.unlinkSync(src);
    } catch {}

    return res.json({
      ok: true,
      fsKey,
      docId: body.docId,
      finalPath: dst,
      movedFiles: moved.length,
    });
  } catch (e: any) {
    console.error("POST /api/ls/inbox/approve failed:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Approve failed" });
  }
});

/* =========================================================
 * FREIGABE LIST/READ (approvati): SOLO cartella /ls
 * =======================================================*/
async function freigegebenListHandler(req: any, res: any) {
  try {
    const projectId = String(req.query.projectId || "").trim();
    if (!projectId) return res.json({ ok: true, items: [] });

    const fsKey = await resolveProjectFsKey(projectId);
    const dir = lsFreigabeDir(fsKey);
    ensureDir(dir);

    const items = fs
      .readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(".json"))
      .map((f) => readJson<any>(path.join(dir, f), null))
      .filter(Boolean)
      .sort((a, b) => Number(b?.approvedAt || 0) - Number(a?.approvedAt || 0));

    return res.json({ ok: true, fsKey, items });
  } catch (e: any) {
    console.error("GET /api/ls/freigegeben/list failed:", e);
    return res
      .status(500)
      .json({ ok: false, error: e?.message || "Freigegeben list failed" });
  }
}

router.get("/freigegeben/list", freigegebenListHandler);
router.get("/final/list", freigegebenListHandler); // compat “nome storico”

router.get("/freigegeben/read", async (req, res) => {
  try {
    const projectId = String((req.query as any)?.projectId || "").trim();
    const docId = String((req.query as any)?.docId || "").trim();
    if (!projectId || !docId)
      return res.status(400).json({ ok: false, error: "projectId/docId required" });

    const fsKey = await resolveProjectFsKey(projectId);
    const p = path.join(lsFreigabeDir(fsKey), `${docId}.json`);
    const json = readJson<any>(p, null);
    if (!json) return res.status(404).json({ ok: false, error: "Not Found" });

    return res.json({ ok: true, fsKey, snapshot: json });
  } catch (e: any) {
    console.error("GET /api/ls/freigegeben/read failed:", e);
    return res
      .status(500)
      .json({ ok: false, error: e?.message || "Freigegeben read failed" });
  }
});

router.get("/final/read", async (req, res) => {
  (req as any).url = "/freigegeben/read";
  return (router as any).handle(req, res);
});

router.get("/read", async (req, res) => {
  try {
    const stageRaw = String((req.query as any)?.stage || "").trim().toLowerCase();
    const stage = stageRaw || "freigegeben";

    if (stage === "inbox") {
      (req as any).url = "/inbox/read";
      return (router as any).handle(req, res);
    }

    (req as any).url = "/freigegeben/read";
    return (router as any).handle(req, res);
  } catch (e: any) {
    console.error("GET /api/ls/read failed:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Read failed" });
  }
});

/* =========================================================
 * ✅ FREIGEGEBEN UPDATE (Web)
 * POST /api/ls/freigegeben/upload
 * - aggiorna il doc in /ls/<docId>.json
 * - eventuali nuovi file vanno in /lieferscheine/files (stabile)
 * =======================================================*/
router.post("/freigegeben/upload", upload.array("files", 20), async (req, res) => {
  try {
    const projectId = String((req.body as any)?.projectId || "").trim();
    const docId = String((req.body as any)?.docId || "").trim();
    if (!projectId || !docId) {
      return res.status(400).json({ ok: false, error: "projectId/docId required" });
    }

    const fsKey = await resolveProjectFsKey(projectId);
    const freigPath = path.join(lsFreigabeDir(fsKey), `${docId}.json`);
    if (!fs.existsSync(freigPath)) {
      return res.status(404).json({ ok: false, error: "doc not found in freigegeben" });
    }

    const prev = readJson<any>(freigPath, null);
    if (!prev) return res.status(500).json({ ok: false, error: "invalid json" });

    // meta
    let meta: any = null;
    const metaRaw = (req.body as any)?.meta;
    if (metaRaw) {
      try {
        meta = typeof metaRaw === "string" ? JSON.parse(metaRaw) : metaRaw;
      } catch {
        meta = null;
      }
    }

    // files -> /lieferscheine/files
    const { filesDir } = await ensureHistoryDirs(fsKey);
    const incoming = (req.files as Express.Multer.File[]) || [];

    const moved = incoming.map((f) => {
      const target = path.join(filesDir, path.basename(f.filename));
      try {
        fs.renameSync(f.path, target);
      } catch {
        fs.copyFileSync(f.path, target);
        try {
          fs.unlinkSync(f.path);
        } catch {}
      }
      const rel = escFsRel(
        path.join(fsKey, "lieferscheine", "files", path.basename(target))
      );
      return {
        name: f.originalname || f.filename,
        type: f.mimetype || mimeFromExt(f.filename),
        storagePath: target,
        url: `/projects/${rel}`,
      };
    });

    const mergedAtt = [
      ...normalizeAttachments({ attachments: prev?.attachments }),
      ...normalizeAttachments({ attachments: meta?.attachments }),
      ...moved,
    ].filter(Boolean);

    const seen = new Set<string>();
    const attachments = mergedAtt.filter((a) => {
      const k = String(a?.url || a?.name || "").trim();
      if (!k) return true;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    const updated = {
      ...prev,
      ...(meta || {}),
      id: docId,
      projectFsKey: fsKey,
      workflowStatus: "FREIGEGEBEN",
      date: safeDate(meta?.date || prev?.date),
      attachments,
      updatedAt: Date.now(),
    };

    writeJson(freigPath, updated);

    return res.json({
      ok: true,
      fsKey,
      docId,
      updated: true,
      movedFiles: moved.length,
    });
  } catch (e: any) {
    console.error("POST /api/ls/freigegeben/upload failed:", e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "Freigegeben upload failed",
    });
  }
});

/* =========================================================
 * FINAL/HISTORY (ufficiali): SOLO cartella /lieferscheine
 * - GET /api/ls?projectId=...&date=...  (compat: prende ultimo per data)
 * - GET /api/ls/list?projectId=...      (elenco history)
 * =======================================================*/
router.get("/", async (req, res) => {
  try {
    const projectId = String((req.query as any)?.projectId || "").trim();
    const dateRaw = String((req.query as any)?.date || "").trim();
    const date = dateRaw ? safeDate(dateRaw) : "";

    const filenameParam = String((req.query as any)?.filename || "").trim();

    if (!projectId || (!date && !filenameParam))
      return res.json({ ok: true, rows: [], items: [] });

    const { fsKey, dir } = await ensureHistoryDirs(projectId);

    let jsonPath: string | null = null;
    if (filenameParam) {
      const safe = path.basename(filenameParam);
      const candidate = path.join(dir, safe);
      if (fs.existsSync(candidate)) jsonPath = candidate;
    } else {
      jsonPath = latestJsonForDate(dir, date);
    }

    if (!jsonPath || !fs.existsSync(jsonPath))
      return res.json({ ok: true, rows: [], items: [] });

    const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    const rows = Array.isArray(data.rows)
      ? data.rows
      : Array.isArray(data.items?.lieferscheine)
      ? data.items.lieferscheine
      : [];

    return res.json({ ok: true, ...data, rows, fsKey });
  } catch (e: any) {
    console.error("GET /api/ls failed:", e);
    return res.status(500).json({ ok: false, error: e?.message || "LS load failed" });
  }
});

router.get("/list", async (req, res) => {
  try {
    const projectId = String((req.query as any)?.projectId || "").trim();
    if (!projectId) return res.json({ ok: true, items: [] });

    const { fsKey, dir } = await ensureHistoryDirs(projectId);
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
        const m = f.match(/^Lieferschein_(\d{4}-\d{2}-\d{2})_(\d+)\.json$/i);
        const date = (meta.date as string | undefined)?.slice(0, 10) || m?.[1] || "";
        const reportId = (meta.reportId as string | undefined) || m?.[2] || "";

        const rowsCount = Array.isArray(meta.rows)
          ? meta.rows.length
          : Array.isArray(meta.items?.lieferscheine)
          ? meta.items.lieferscheine.length
          : 0;

        return {
          date,
          filename: f,
          rows: rowsCount,
          savedAt: stats.mtime.toISOString(),
          reportId,
          fsKey,
        };
      })
      .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));

    return res.json({ ok: true, items });
  } catch (e: any) {
    console.error("GET /api/ls/list failed:", e);
    return res.status(500).json({ ok: false, error: e?.message || "LS list failed" });
  }
});

/* =========================================================
 * ✅ FREIGEGEBEN -> FINAL COMMIT (quello che ti serve nel Web)
 * POST /api/ls/freigegeben/commit
 * body: { projectId, docId }
 * - legge /ls/<docId>.json
 * - salva in /lieferscheine/Lieferschein_YYYY-MM-DD_XXX.json
 * - elimina /ls/<docId>.json (sparisce da Freigegeben)
 * =======================================================*/
router.post("/freigegeben/commit", async (req, res) => {
  try {
    const schema = z.object({
      projectId: z.string().min(1),
      docId: z.string().min(1),
    });
    const body = schema.parse(req.body);

    const fsKey = await resolveProjectFsKey(body.projectId);
    const freigPath = path.join(lsFreigabeDir(fsKey), `${body.docId}.json`);
    if (!fs.existsSync(freigPath)) {
      return res.status(404).json({ ok: false, error: "doc not found in freigegeben" });
    }

    const freig = readJson<any>(freigPath, null);
    if (!freig) return res.status(500).json({ ok: false, error: "invalid json" });

    const { dir } = await ensureHistoryDirs(fsKey);
    const date = safeDate(freig?.date || new Date().toISOString().slice(0, 10));
    const { jsonName, reportId } = nextLsFile(dir, date);
    const jsonPath = path.join(dir, jsonName);

    const payload = {
      kind: "lieferschein",
      ...freig,
      workflowStatus: "FREIGEGEBEN",
      date,
      reportId,
      savedAt: new Date().toISOString(),
      // attachments già normalizzati a /lieferscheine/files in approve/upload
      attachments: normalizeAttachments({ attachments: freig?.attachments }),
    };

    fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf8");

    try {
      fs.unlinkSync(freigPath);
    } catch {}

    return res.json({ ok: true, fsKey, filename: jsonName, reportId });
  } catch (e: any) {
    console.error("POST /api/ls/freigegeben/commit failed:", e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "Freigegeben commit failed",
    });
  }
});

/* =========================================================
 * ✅ COMMIT (History) + Workflow-Cleanup (come regie.ts)
 * POST /api/ls/commit/lieferschein
 * - salva in /lieferscheine (history)
 * - cleanup robusto del doc da /ls (freigegeben)
 * =======================================================*/
function tryUnlink(p: string) {
  try {
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      return true;
    }
  } catch (e) {
    console.warn("[ls] unlink failed:", p, e);
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

function cleanupFreigegeben(opts: {
  fsKey: string;
  preferId?: string;
  lieferscheinNummer?: string;
  date?: string;
}) {
  const dir = lsFreigabeDir(opts.fsKey);
  ensureDir(dir);

  const deleted: string[] = [];
  const tried: string[] = [];

  const preferId = String(opts.preferId || "").trim();
  const date = String(opts.date || "").slice(0, 10);
  const num = String(opts.lieferscheinNummer || "").trim();

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

  // 3) fallback by lieferscheinNummer + date
  if (deleted.length === 0 && (num || date)) {
    const files = listJsonFiles(dir);
    for (const f of files) {
      const j = readJson<any>(f, null);
      if (!j) continue;

      const jNum = String(j?.lieferscheinNummer || "").trim();
      const jDate = String(j?.date || "").slice(0, 10);

      const okNum = num ? jNum === num : true;
      const okDate = date ? jDate === date : true;

      if (okNum && okDate) {
        tried.push(f);
        if (tryUnlink(f)) deleted.push(f);
      }
    }
  }

  return { dir, tried, deleted };
}

router.post("/commit/lieferschein", async (req, res) => {
  try {
    const schema = z.object({
      projectId: z.string().min(1),
      date: z.string().min(1),

      // alias possibili dal frontend
      workflowDocId: z.string().optional(),
      docId: z.string().optional(),
      sourceDocId: z.string().optional(),

      lieferscheinNummer: z.string().optional(),

      note: z.any().optional(),
      rows: z.array(z.any()).default([]),
      items: z.any().optional(),
      attachments: z.array(z.any()).optional(),
    });

    const body = schema.parse(req.body);

    const { fsKey, dbId } = await resolveProjectIds(body.projectId);
    const { dir } = await ensureHistoryDirs(body.projectId);

    const { jsonName, reportId } = nextLsFile(dir, body.date);
    const jsonPath = path.join(dir, jsonName);

    const payload = {
      kind: "lieferschein",
      ...body,
      projectId: dbId ?? body.projectId,
      projectCode: fsKey,
      projectFsKey: fsKey,
      date: safeDate(body.date),
      reportId,
      savedAt: new Date().toISOString(),
      attachments: normalizeAttachments({ attachments: body.attachments }),
    };

    fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf8");

    // cleanup freigegeben (/ls)
    const preferId =
      String(body.workflowDocId || "").trim() ||
      String(body.sourceDocId || "").trim() ||
      String(body.docId || "").trim();

    const cleanup = cleanupFreigegeben({
      fsKey,
      preferId,
      lieferscheinNummer: body.lieferscheinNummer,
      date: body.date,
    });

    return res.json({
      ok: true,
      fsKey,
      filename: jsonName,
      reportId,
      cleanup,
    });
  } catch (e: any) {
    console.error("POST /api/ls/commit/lieferschein failed:", e);
    return res.status(500).json({ ok: false, error: e?.message || "LS commit failed" });
  }
});

/* =========================================================
 * LEGACY: POST /api/ls/upload
 * -> mantiene endpoint, ma salva SEMPRE in /lieferscheine/files (stabile)
 *    (non crea history json da solo)
 * =======================================================*/
router.post("/upload", upload.array("files", 20), async (req, res) => {
  try {
    const projectId = String(
      (req.body as any)?.projectId || (req.query as any)?.projectId || ""
    ).trim();
    if (!projectId) return res.status(400).json({ ok: false, error: "projectId required" });

    const { fsKey, filesDir } = await ensureHistoryDirs(projectId);
    const files = (req.files as Express.Multer.File[]) || [];

    const items = files.map((f) => {
      const target = path.join(filesDir, path.basename(f.filename));
      if (path.dirname(f.path) !== filesDir) {
        try {
          fs.renameSync(f.path, target);
        } catch {
          fs.copyFileSync(f.path, target);
          try {
            fs.unlinkSync(f.path);
          } catch {}
        }
      }

      const rel = escFsRel(path.join(fsKey, "lieferscheine", "files", path.basename(target)));
      return {
        name: f.originalname || f.filename,
        type: f.mimetype || mimeFromExt(f.filename),
        storagePath: target,
        publicUrl: `/projects/${rel}`,
        url: `/projects/${rel}`,
      };
    });

    return res.json({ ok: true, fsKey, items });
  } catch (e: any) {
    console.error("POST /api/ls/upload failed:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Upload failed" });
  }
});

export default router;

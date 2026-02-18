// apps/server/src/routes/fotos.ts
import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { PROJECTS_ROOT } from "../lib/projectsRoot";

const router = express.Router();

/**
 * =========================================================
 * Helpers
 * =========================================================
 */

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeName(name: string) {
  return String(name || "")
    .replace(/[^\w.\-() ]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 180);
}

function tryReadJsonFile(filePath: string, fallback: any) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function tryWriteJsonFile(filePath: string, data: any) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function moveDirRobust(src: string, dst: string) {
  // rename (fast) + fallback copy for cross-device cases
  try {
    ensureDir(path.dirname(dst));
    fs.renameSync(src, dst);
    return;
  } catch {
    // fallback copy
  }

  ensureDir(dst);

  const names = fs
    .readdirSync(src)
    .filter((n) => !!n && !String(n).startsWith("."));

  for (const name of names) {
    const from = path.join(src, name);
    const to = path.join(dst, name);

    const st = fs.statSync(from);
    if (st.isDirectory()) {
      moveDirRobust(from, to);
      continue;
    }

    try {
      fs.renameSync(from, to);
    } catch {
      fs.copyFileSync(from, to);
      try {
        fs.unlinkSync(from);
      } catch {}
    }
  }

  try {
    fs.rmSync(src, { recursive: true, force: true });
  } catch {}
}

/**
 * context/kind mapping:
 * - default: fotos/
 * - LIEFERSCHEIN: lieferscheine/files/
 * (damit mobile Uploads nicht mehr im falschen Ordner landen)
 */
function resolveTargetDir(projectId: string, ctxRaw?: string) {
  const ctx = String(ctxRaw || "").trim().toUpperCase();

  if (ctx === "LIEFERSCHEIN" || ctx === "LS") {
    return path.join(PROJECTS_ROOT, projectId, "lieferscheine", "files");
  }

  // Standard: Fotos/Notizen
  return path.join(PROJECTS_ROOT, projectId, "fotos");
}

/**
 * =========================================================
 * ✅ INBOX PATHS (Eingang/Prüfung)
 *   projects/<BA>/eingangspruefung/fotos/...
 * =========================================================
 */
function inboxFotosDir(projectId: string) {
  // ✅ SERVER: Inbox = Eingang/Prüfung
  return path.join(PROJECTS_ROOT, projectId, "eingangspruefung", "fotos");
}
function inboxFotosMetaPath(projectId: string) {
  return path.join(inboxFotosDir(projectId), "fotos_notes.json");
}

function readInboxNotes(projectId: string): any[] {
  const p = inboxFotosMetaPath(projectId);
  const parsed = tryReadJsonFile(p, []);
  return Array.isArray(parsed) ? parsed : [];
}
function writeInboxNotes(projectId: string, list: any[]) {
  ensureDir(inboxFotosDir(projectId));
  fs.writeFileSync(inboxFotosMetaPath(projectId), JSON.stringify(list, null, 2), "utf8");
}
function inboxDocDir(projectId: string, docId: string) {
  return path.join(inboxFotosDir(projectId), safeName(docId));
}
function inboxDocFilesDir(projectId: string, docId: string) {
  return path.join(inboxDocDir(projectId, docId), "files");
}
function makeInboxPublicUrl(projectId: string, docId: string, fileName: string) {
  // stored under: projects/<BA>/eingangspruefung/fotos/<docId>/files/<file>
  return `/projects/${projectId}/eingangspruefung/fotos/${safeName(docId)}/files/${fileName}`.replace(
    /\\/g,
    "/"
  );
}
function makeInboxMainPublicUrl(projectId: string, docId: string, fileName: string) {
  // stored under: projects/<BA>/eingangspruefung/fotos/<docId>/<file>
  return `/projects/${projectId}/eingangspruefung/fotos/${safeName(docId)}/${fileName}`.replace(
    /\\/g,
    "/"
  );
}

/**
 * ✅ FINAL (after commit): folder moved to
 *   projects/<BA>/fotos/<docId>/...
 * so public URLs must change accordingly
 *
 * NOTE:
 * In this server implementation, FINAL notes files are actually stored in:
 *   projects/<BA>/fotos/files/<file>
 * (flat storage, used by notesUpload + makePublicUrl)
 * So commit MUST move into notesFilesDir and rewrite URLs via makePublicUrl().
 */
function makeFinalPublicUrl(projectId: string, docId: string, fileName: string) {
  // stored under: projects/<BA>/fotos/<docId>/files/<file>
  return `/projects/${projectId}/fotos/${safeName(docId)}/files/${fileName}`.replace(/\\/g, "/");
}
function makeFinalMainPublicUrl(projectId: string, docId: string, fileName: string) {
  // stored under: projects/<BA>/fotos/<docId>/<file>
  return `/projects/${projectId}/fotos/${safeName(docId)}/${fileName}`.replace(/\\/g, "/");
}

/**
 * ---- Legacy Fotos Meta (single-file entries) ----
 */
function metaPath(projectId: string) {
  return path.join(resolveTargetDir(projectId, "FOTOS"), "fotos.json");
}

function readMeta(projectId: string): any[] {
  const p = metaPath(projectId);
  const parsed = tryReadJsonFile(p, []);
  return Array.isArray(parsed) ? parsed : [];
}

function writeMeta(projectId: string, list: any[]) {
  const dir = resolveTargetDir(projectId, "FOTOS");
  ensureDir(dir);
  fs.writeFileSync(metaPath(projectId), JSON.stringify(list, null, 2), "utf8");
}

/**
 * ---- NEW Fotos Notes Meta (records with main + files[]) ----
 * Used by mobile: /api/fotos/projects/:projectId/fotos/notes
 */
function notesDir(projectId: string) {
  return path.join(PROJECTS_ROOT, projectId, "fotos");
}
function notesFilesDir(projectId: string) {
  return path.join(notesDir(projectId), "files");
}
function notesMetaPath(projectId: string) {
  return path.join(notesDir(projectId), "fotos_notes.json");
}
function readNotes(projectId: string): any[] {
  const p = notesMetaPath(projectId);
  const parsed = tryReadJsonFile(p, []);
  return Array.isArray(parsed) ? parsed : [];
}
function writeNotes(projectId: string, list: any[]) {
  ensureDir(notesDir(projectId));
  ensureDir(notesFilesDir(projectId));
  fs.writeFileSync(notesMetaPath(projectId), JSON.stringify(list, null, 2), "utf8");
}

function parseJsonField(v: any, fallback: any) {
  if (!v) return fallback;
  if (typeof v === "object") return v;
  try {
    return JSON.parse(String(v));
  } catch {
    return fallback;
  }
}

function pickText(req: any) {
  // Mobile manda spesso comment/bemerkungen/note; noi salviamo tutti coerenti
  const comment = String(req.body?.comment ?? req.body?.note ?? "").trim();
  const bemerkungen = String(req.body?.bemerkungen ?? req.body?.comment ?? req.body?.note ?? "").trim();
  const note = String(req.body?.note ?? req.body?.comment ?? "").trim();
  return { comment, bemerkungen, note };
}

function makePublicUrl(projectId: string, fileName: string) {
  // files are stored under projects/<BA>/fotos/files/<file>
  return `/projects/${projectId}/fotos/files/${fileName}`.replace(/\\/g, "/");
}

/**
 * =========================================================
 * ✅ MOBILE COMPAT (Eingang/Prüfung)
 * - mobile expects attachments/photos with { uri, name, type? }
 * - also expects imageUri for preview/PDF
 * =========================================================
 */
function inferMimeFromName(nameOrUrl: string) {
  const s = String(nameOrUrl || "").toLowerCase();
  if (s.endsWith(".png")) return "image/png";
  if (s.endsWith(".webp")) return "image/webp";
  if (s.endsWith(".heic")) return "image/heic";
  if (s.endsWith(".heif")) return "image/heif";
  if (s.endsWith(".pdf")) return "application/pdf";
  if (s.endsWith(".jpg") || s.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

function toFileMetaFromInboxFile(f: any) {
  const publicUrl = String(f?.publicUrl || "").trim();
  if (!publicUrl) return null;
  const name = String(f?.name || f?.file || "file.bin");
  return {
    uri: publicUrl,
    name,
    type: inferMimeFromName(name || publicUrl),
  };
}

function decorateInboxItem(projectId: string, it: any) {
  const mainMeta = it?.main ? toFileMetaFromInboxFile(it.main) : null;
  const fileMetas = Array.isArray(it?.files)
    ? it.files.map(toFileMetaFromInboxFile).filter(Boolean)
    : [];

  const attachments = [mainMeta, ...fileMetas].filter(Boolean);

  return {
    ...it,
    projectId,
    projectCode: projectId,
    // ✅ compat for mobile previews + exporter
    imageUri: (mainMeta as any)?.uri || it?.imageUri || undefined,
    attachments,
    photos: attachments,
  };
}

/**
 * =========================================================
 * Multer (legacy single file upload: /projects/:projectId/fotos)
 * =========================================================
 */
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const projectId = String((req.params as any)?.projectId || "").trim();
    if (!projectId) return cb(new Error("projectId fehlt"), "");

    const ctx = (req.body?.context || req.body?.kind || req.query?.context || req.query?.kind) as
      | string
      | undefined;

    const dir = resolveTargetDir(projectId, ctx);
    try {
      ensureDir(dir);
      cb(null, dir);
    } catch (e: any) {
      cb(e, "");
    }
  },
  filename: (_req, file, cb) => {
    const base = safeName(file.originalname || "foto.jpg");
    const filename = `${Date.now()}-${base}`;
    cb(null, filename);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

/**
 * =========================================================
 * Multer (NEW notes upload: main + files[])
 * =========================================================
 */
const notesStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const projectId = String((req.params as any)?.projectId || "").trim();
    if (!projectId) return cb(new Error("projectId fehlt"), "");
    try {
      ensureDir(notesFilesDir(projectId));
      cb(null, notesFilesDir(projectId));
    } catch (e: any) {
      cb(e, "");
    }
  },
  filename: (_req, file, cb) => {
    const base = safeName(file.originalname || "file.bin");
    const filename = `${Date.now()}-${base}`;
    cb(null, filename);
  },
});

const notesUpload = multer({
  storage: notesStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB each
});

/**
 * =========================================================
 * ✅ Multer (INBOX notes upload)
 * - saves to: projects/<BA>/eingangspruefung/fotos/<docId>/... and .../files/
 * =========================================================
 */
const inboxNotesStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const projectId = String(req.body?.projectId || "").trim();
    const docId = String(req.body?.docId || req.body?.id || "").trim();
    if (!projectId) return cb(new Error("projectId fehlt"), "");
    if (!docId) return cb(new Error("docId fehlt"), "");

    try {
      // main goes into doc root, files into doc/files
      const isMain = String(file.fieldname || "").toLowerCase() === "main";
      const dir = isMain ? inboxDocDir(projectId, docId) : inboxDocFilesDir(projectId, docId);
      ensureDir(dir);
      cb(null, dir);
    } catch (e: any) {
      cb(e, "");
    }
  },
  filename: (_req, file, cb) => {
    const base = safeName(file.originalname || "file.bin");
    const filename = `${Date.now()}-${base}`;
    cb(null, filename);
  },
});

const inboxNotesUpload = multer({
  storage: inboxNotesStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
});

/* =========================================================
 * ROUTES (legacy bleiben)
 * =======================================================*/

/* ---- Liste aller Fotos eines Projekts ---- */
router.get("/projects/:projectId/fotos", (req, res) => {
  const { projectId } = req.params;
  if (!projectId) return res.status(400).json({ error: "projectId fehlt" });

  const list = readMeta(projectId);
  res.json(list);
});

/* ---- Einzelnes Foto ausliefern ---- */
router.get("/projects/:projectId/fotos/:file", (req, res) => {
  const { projectId, file } = req.params;
  if (!projectId || !file) {
    return res.status(400).json({ error: "projectId oder file fehlt" });
  }

  const filePath = path.join(resolveTargetDir(projectId, "FOTOS"), file);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Datei nicht gefunden" });
  }

  res.sendFile(path.resolve(filePath));
});

/* ---- Foto + Meta speichern (legacy) ---- */
router.post("/projects/:projectId/fotos", upload.single("file"), (req, res) => {
  const { projectId } = req.params;
  if (!projectId) {
    return res.status(400).json({ error: "projectId fehlt" });
  }
  if (!req.file) {
    return res.status(400).json({ error: "keine Datei gesendet" });
  }

  const ctx = String(req.body?.context || req.body?.kind || req.query?.context || req.query?.kind || "")
    .trim()
    .toUpperCase();

  const filename = req.file.filename;

  // publicUrl immer über /projects (static in index.ts)
  const rel =
    ctx === "LIEFERSCHEIN" || ctx === "LS"
      ? path.join(projectId, "lieferscheine", "files", filename)
      : path.join(projectId, "fotos", filename);

  const publicUrl = `/projects/${rel.replace(/\\/g, "/")}`;

  // Wenn es LIEFERSCHEIN ist: KEIN meta fotos.json
  if (ctx === "LIEFERSCHEIN" || ctx === "LS") {
    return res.json({
      ok: true,
      kind: "LIEFERSCHEIN_FILE",
      file: filename,
      name: req.file.originalname || filename,
      createdAt: new Date().toISOString(),
      publicUrl,
    });
  }

  let extras: any[] = [];
  let boxes: any[] = [];

  if (req.body.extras) {
    try {
      extras = JSON.parse(req.body.extras);
    } catch {
      extras = [];
    }
  }
  if (req.body.boxes) {
    try {
      boxes = JSON.parse(req.body.boxes);
    } catch {
      boxes = [];
    }
  }

  const list = readMeta(projectId);
  const entry = {
    id: filename,
    file: filename,
    createdAt: new Date().toISOString(),
    note: req.body.note || "",
    extras,
    boxes,
    publicUrl,
  };

  list.push(entry);
  writeMeta(projectId, list);

  res.json(entry);
});

/* ---- Foto + Meta löschen (legacy) ---- */
router.delete("/projects/:projectId/fotos/:id", (req, res) => {
  const { projectId, id } = req.params;
  if (!projectId || !id) {
    return res.status(400).json({ error: "projectId oder id fehlt" });
  }

  const list = readMeta(projectId);
  const idx = list.findIndex((e) => e.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: "Eintrag nicht gefunden" });
  }

  const entry = list[idx];
  const filePath = path.join(resolveTargetDir(projectId, "FOTOS"), entry.file);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // ignore
    }
  }

  list.splice(idx, 1);
  writeMeta(projectId, list);

  res.json({ ok: true });
});

/* =========================================================
 * ✅ NEW: PHOTOS / NOTES (FINAL – projects/<BA>/fotos/... )
 * =========================================================
 */

/* ---- Liste Notes ---- */
router.get("/projects/:projectId/fotos/notes", (req, res) => {
  const { projectId } = req.params;
  if (!projectId) return res.status(400).json({ error: "projectId fehlt" });

  const list = readNotes(projectId);
  res.json({ ok: true, items: list });
});

/* ---- Create/Upload Note (FINAL) ---- */
router.post(
  "/projects/:projectId/fotos/notes",
  notesUpload.fields([
    { name: "main", maxCount: 1 },
    { name: "files", maxCount: 50 },
  ]),
  (req, res) => {
    const { projectId } = req.params;
    if (!projectId) return res.status(400).json({ error: "projectId fehlt" });

    const filesAny = req.files as any;
    const mainFile = Array.isArray(filesAny?.main) ? filesAny.main[0] : null;
    const otherFiles = Array.isArray(filesAny?.files) ? filesAny.files : [];

    const idRaw = String(req.body?.docId || req.body?.id || "").trim();
    const id = idRaw || `ph_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;

    const date = String(req.body?.date || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
    const kostenstelle = String(req.body?.kostenstelle || "").trim();
    const lvItemPos = String(req.body?.lvItemPos || "").trim();

    const { comment, bemerkungen, note } = pickText(req);

    const extras = parseJsonField(req.body?.extras, undefined);
    const boxes = parseJsonField(req.body?.boxes, undefined);

    const derivedMain = !mainFile && otherFiles.length > 0 ? otherFiles[0] : null;
    const remainingFiles = derivedMain ? otherFiles.slice(1) : otherFiles;

    const main =
      mainFile || derivedMain
        ? {
            file: (mainFile || derivedMain).filename,
            name: (mainFile || derivedMain).originalname,
            publicUrl: makePublicUrl(projectId, (mainFile || derivedMain).filename),
          }
        : null;

    const files = remainingFiles.map((f: any) => ({
      file: f.filename,
      name: f.originalname,
      publicUrl: makePublicUrl(projectId, f.filename),
    }));

    const entry = {
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      date,
      kostenstelle,
      lvItemPos: lvItemPos || null,
      comment,
      bemerkungen,
      note,
      extras,
      boxes,
      main,
      files,
    };

    const list = readNotes(projectId);
    const idx = list.findIndex((x: any) => String(x?.id) === String(id));
    if (idx >= 0) list[idx] = { ...list[idx], ...entry, updatedAt: new Date().toISOString() };
    else list.push(entry);

    writeNotes(projectId, list);

    res.json({ ok: true, item: entry });
  }
);

/* ---- Delete Note (FINAL) ---- */
router.delete("/projects/:projectId/fotos/notes/:id", (req, res) => {
  const { projectId, id } = req.params;
  if (!projectId || !id) {
    return res.status(400).json({ error: "projectId oder id fehlt" });
  }

  const list = readNotes(projectId);
  const idx = list.findIndex((x: any) => String(x?.id) === String(id));
  if (idx === -1) {
    return res.status(404).json({ error: "Eintrag nicht gefunden" });
  }

  const entry = list[idx];

  const candidates: string[] = [];
  if (entry?.main?.file) candidates.push(String(entry.main.file));
  if (Array.isArray(entry?.files)) {
    for (const f of entry.files) {
      if (f?.file) candidates.push(String(f.file));
    }
  }

  for (const fn of candidates) {
    const abs = path.join(notesFilesDir(projectId), fn);
    if (fs.existsSync(abs)) {
      try {
        fs.unlinkSync(abs);
      } catch {}
    }
  }

  list.splice(idx, 1);
  writeNotes(projectId, list);

  res.json({ ok: true });
});

/* =========================================================
 * ✅ INBOX: Eingang/Prüfung Fotos
 *   - POST /api/fotos/inbox/upload
 *   - GET  /api/fotos/inbox/list?projectId=BA-...
 *   - GET  /api/fotos/inbox/read?projectId=BA-...&id=...
 *   - POST /api/fotos/inbox/reject   {projectId,id,reason?}
 *   - POST /api/fotos/commit         {projectId,id}   -> moves to FINAL
 *   - DEL  /api/fotos/inbox/delete?projectId=BA-...&id=...
 * =========================================================
 */

/* ---- Inbox list (used by Eingang/Prüfung) ---- */
router.get("/inbox/list", (req, res) => {
  const projectId = String(req.query?.projectId || "").trim();
  if (!projectId) return res.status(400).json({ ok: false, error: "projectId fehlt" });

  const itemsRaw = readInboxNotes(projectId);

  // newest first
  itemsRaw.sort((a: any, b: any) => {
    const ta = Date.parse(String(a?.updatedAt || a?.createdAt || 0)) || 0;
    const tb = Date.parse(String(b?.updatedAt || b?.createdAt || 0)) || 0;
    return tb - ta;
  });

  // ✅ MOBILE COMPAT: decorate items with attachments/photos/imageUri
  const items = itemsRaw.map((it: any) => decorateInboxItem(projectId, it));

  res.json({ ok: true, items });
});

/* ---- Inbox read (single item) ---- */
router.get("/inbox/read", (req, res) => {
  const projectId = String(req.query?.projectId || "").trim();
  const id = String(req.query?.id || req.query?.docId || "").trim();

  if (!projectId || !id) {
    return res.status(400).json({ ok: false, error: "projectId oder id fehlt" });
  }

  const items = readInboxNotes(projectId);
  const itemRaw = items.find((x: any) => String(x?.id) === String(id));
  if (!itemRaw) {
    return res.status(404).json({ ok: false, error: "Eintrag nicht gefunden" });
  }

  // Ensure folder exists; we don't require it here, but helps debugging
  const folder = inboxDocDir(projectId, id);
  const exists = fs.existsSync(folder);

  // ✅ MOBILE COMPAT: return snapshot + item decorated
  const item = decorateInboxItem(projectId, itemRaw);

  return res.json({ ok: true, item, snapshot: item, folder, folderExists: exists });
});

/* ---- Inbox upload (mobile must hit this!) ---- */
router.post(
  "/inbox/upload",
  inboxNotesUpload.fields([
    { name: "main", maxCount: 1 },
    { name: "files", maxCount: 50 },
  ]),
  (req, res) => {
    const projectId = String(req.body?.projectId || "").trim();
    if (!projectId) return res.status(400).json({ ok: false, error: "projectId fehlt" });

    const idRaw = String(req.body?.docId || req.body?.id || "").trim();
    const id = idRaw || `ph_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;

    const date = String(req.body?.date || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
    const kostenstelle = String(req.body?.kostenstelle || "").trim();
    const lvItemPos = String(req.body?.lvItemPos || "").trim();

    const workflowStatus = String(req.body?.workflowStatus || "EINGEREICHT").trim();

    const { comment, bemerkungen, note } = pickText(req);

    const extras = parseJsonField(req.body?.extras, undefined);
    const boxes = parseJsonField(req.body?.boxes, undefined);

    const filesAny = req.files as any;
    const mainFile = Array.isArray(filesAny?.main) ? filesAny.main[0] : null;
    const otherFiles = Array.isArray(filesAny?.files) ? filesAny.files : [];

    // if no explicit main, derive from first files[]
    const derivedMain = !mainFile && otherFiles.length > 0 ? otherFiles[0] : null;
    const remainingFiles = derivedMain ? otherFiles.slice(1) : otherFiles;

    const main =
      mainFile || derivedMain
        ? {
            file: (mainFile || derivedMain).filename,
            name: (mainFile || derivedMain).originalname,
            publicUrl: mainFile
              ? makeInboxMainPublicUrl(projectId, id, mainFile.filename)
              : makeInboxPublicUrl(projectId, id, (derivedMain as any).filename),
          }
        : null;

    const files = remainingFiles.map((f: any) => ({
      file: f.filename,
      name: f.originalname,
      publicUrl: makeInboxPublicUrl(projectId, id, f.filename),
    }));

    const entry = {
      id,
      kind: "fotos",
      workflowStatus,

      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      date,
      kostenstelle,
      lvItemPos: lvItemPos || null,

      comment,
      bemerkungen,
      note,

      extras,
      boxes,

      main,
      files,
    };

    const list = readInboxNotes(projectId);
    const idx = list.findIndex((x: any) => String(x?.id) === String(id));
    if (idx >= 0) list[idx] = { ...list[idx], ...entry, updatedAt: new Date().toISOString() };
    else list.push(entry);

    writeInboxNotes(projectId, list);

    // ✅ return decorated item for mobile
    res.json({ ok: true, item: decorateInboxItem(projectId, entry) });
  }
);

/* ---- Inbox reject (mobile uses /inbox/reject) ---- */
router.post("/inbox/reject", (req, res) => {
  const projectId = String(req.body?.projectId || "").trim();
  const id = String(req.body?.id || req.body?.docId || "").trim();
  const reason = String(req.body?.reason || req.body?.ablehnGrund || "").trim();

  if (!projectId || !id) {
    return res.status(400).json({ ok: false, error: "projectId oder id fehlt" });
  }

  const list = readInboxNotes(projectId);
  const idx = list.findIndex((x: any) => String(x?.id) === String(id));
  if (idx === -1) {
    return res.status(404).json({ ok: false, error: "Eintrag nicht gefunden" });
  }

  // Mark as rejected (keep entry for audit) + optionally delete folder
  list[idx] = {
    ...list[idx],
    workflowStatus: "ABGELEHNT",
    rejectedAt: new Date().toISOString(),
    rejectReason: reason || undefined,
    updatedAt: new Date().toISOString(),
  };
  writeInboxNotes(projectId, list);

  // If you want to hard-delete folder, do it best-effort:
  const folder = inboxDocDir(projectId, id);
  if (fs.existsSync(folder)) {
    try {
      fs.rmSync(folder, { recursive: true, force: true });
    } catch {}
  }

  return res.json({ ok: true });
});

/* ---- Commit (Freigeben): move INBOX doc -> FINAL notes list ---- */
router.post("/commit", (req, res) => {
  const projectId = String(req.body?.projectId || "").trim();
  const id = String(req.body?.id || req.body?.docId || "").trim();

  if (!projectId || !id) {
    return res.status(400).json({ ok: false, error: "projectId oder id fehlt" });
  }

  // inbox entry
  const inboxList = readInboxNotes(projectId);
  const idx = inboxList.findIndex((x: any) => String(x?.id) === String(id));
  if (idx === -1) {
    return res.status(404).json({ ok: false, error: "Eintrag nicht gefunden" });
  }

  const entry = inboxList[idx];

  // ✅ Canonical FINAL: projects/<BA>/fotos/files/<file>
  const finalDir = notesDir(projectId);
  const finalFiles = notesFilesDir(projectId);
  try {
    ensureDir(finalDir);
    ensureDir(finalFiles);
  } catch {}

  const srcDoc = inboxDocDir(projectId, id);
  const srcFiles = inboxDocFilesDir(projectId, id);

  function moveFileRobust(fromAbs: string, toAbs: string) {
    try {
      ensureDir(path.dirname(toAbs));
      fs.renameSync(fromAbs, toAbs);
      return true;
    } catch {
      // fallback copy
      try {
        ensureDir(path.dirname(toAbs));
        fs.copyFileSync(fromAbs, toAbs);
        try {
          fs.unlinkSync(fromAbs);
        } catch {}
        return true;
      } catch {
        return false;
      }
    }
  }

  // 1) move MAIN file (may be in doc root OR in doc/files if it was derived)
  let patchedMain = entry?.main || null;
  if (entry?.main?.file) {
    const fn = String(entry.main.file).trim();
    if (fn) {
      const candA = path.join(srcDoc, fn);
      const candB = path.join(srcFiles, fn);
      let from = "";
      if (fs.existsSync(candA)) from = candA;
      else if (fs.existsSync(candB)) from = candB;

      if (from) {
        const to = path.join(finalFiles, fn);
        moveFileRobust(from, to);
      }

      patchedMain = {
        ...entry.main,
        publicUrl: makePublicUrl(projectId, fn),
      };
    }
  }

  // 2) move FILES[] (stored under doc/files)
  const patchedFiles = Array.isArray(entry?.files)
    ? entry.files.map((f: any) => {
        const fn = String(f?.file || "").trim();
        if (!fn) return f;

        const from = path.join(srcFiles, fn);
        if (fs.existsSync(from)) {
          const to = path.join(finalFiles, fn);
          moveFileRobust(from, to);
        }

        return {
          ...f,
          publicUrl: makePublicUrl(projectId, fn),
        };
      })
    : [];

  // 3) cleanup inbox folder best-effort
  if (fs.existsSync(srcDoc)) {
    try {
      fs.rmSync(srcDoc, { recursive: true, force: true });
    } catch {}
  }

  // Build FINAL entry (same shape as notes)
  const finalEntry = {
    ...entry,
    main: patchedMain,
    files: patchedFiles,
    workflowStatus: "FREIGEGEBEN",
    committedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Write into final notes list
  const finalList = readNotes(projectId);
  const fIdx = finalList.findIndex((x: any) => String(x?.id) === String(id));
  if (fIdx >= 0) finalList[fIdx] = { ...finalList[fIdx], ...finalEntry };
  else finalList.push(finalEntry);
  writeNotes(projectId, finalList);

  // Remove from inbox list
  inboxList.splice(idx, 1);
  writeInboxNotes(projectId, inboxList);

  // ✅ return decorated item too (for mobile compat)
  return res.json({ ok: true, item: decorateInboxItem(projectId, finalEntry) });
});

/* ---- Inbox delete (legacy; useful for Ablehnen hard-delete) ---- */
router.delete("/inbox/delete", (req, res) => {
  const projectId = String(req.query?.projectId || "").trim();
  const id = String(req.query?.id || "").trim();

  if (!projectId || !id) return res.status(400).json({ ok: false, error: "projectId oder id fehlt" });

  const list = readInboxNotes(projectId);
  const idx = list.findIndex((x: any) => String(x?.id) === String(id));
  if (idx === -1) return res.status(404).json({ ok: false, error: "Eintrag nicht gefunden" });

  // delete folder best-effort: projects/<BA>/eingangspruefung/fotos/<docId>/
  const folder = inboxDocDir(projectId, id);
  if (fs.existsSync(folder)) {
    try {
      fs.rmSync(folder, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }

  list.splice(idx, 1);
  writeInboxNotes(projectId, list);

  res.json({ ok: true });
});

export default router;

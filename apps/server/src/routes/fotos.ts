// @ts-nocheck
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
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function moveDirRobust(src: string, dst: string) {
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
  fs.writeFileSync(
    inboxFotosMetaPath(projectId),
    JSON.stringify(list, null, 2),
    "utf8"
  );
}
function inboxDocDir(projectId: string, docId: string) {
  return path.join(inboxFotosDir(projectId), safeName(docId));
}
function inboxDocFilesDir(projectId: string, docId: string) {
  return path.join(inboxDocDir(projectId, docId), "files");
}
function makeInboxPublicUrl(projectId: string, docId: string, fileName: string) {
  return `/projects/${projectId}/eingangspruefung/fotos/${safeName(
    docId
  )}/files/${fileName}`.replace(/\\/g, "/");
}
function makeInboxMainPublicUrl(
  projectId: string,
  docId: string,
  fileName: string
) {
  return `/projects/${projectId}/eingangspruefung/fotos/${safeName(
    docId
  )}/${fileName}`.replace(/\\/g, "/");
}

/**
 * =========================================================
 * ✅ FINAL (after commit): public URLs
 * =========================================================
 */
function makeFinalPublicUrl(projectId: string, docId: string, fileName: string) {
  return `/projects/${projectId}/fotos/${safeName(docId)}/files/${fileName}`.replace(
    /\\/g,
    "/"
  );
}
function makeFinalMainPublicUrl(
  projectId: string,
  docId: string,
  fileName: string
) {
  return `/projects/${projectId}/fotos/${safeName(docId)}/${fileName}`.replace(
    /\\/g,
    "/"
  );
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
 * ---- NEW Fotos Notes Meta (FINAL) ----
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
  const comment = String(req.body?.comment ?? req.body?.note ?? "").trim();
  const bemerkungen = String(
    req.body?.bemerkungen ?? req.body?.comment ?? req.body?.note ?? ""
  ).trim();
  const note = String(req.body?.note ?? req.body?.comment ?? "").trim();
  return { comment, bemerkungen, note };
}

function makePublicUrl(projectId: string, fileName: string) {
  return `/projects/${projectId}/fotos/files/${fileName}`.replace(/\\/g, "/");
}

/**
 * =========================================================
 * ✅ MOBILE COMPAT (Eingang/Prüfung)
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
  const mainMeta = it?.main ? toFileMetaFromInboxFile(it.main) : null; // ✅ FIX: no duplicate
  const fileMetas = Array.isArray(it?.files)
    ? it.files.map(toFileMetaFromInboxFile).filter(Boolean)
    : [];

  const attachments = [mainMeta, ...fileMetas].filter(Boolean);

  return {
    ...it,
    projectId,
    projectCode: projectId,
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

    const ctx = (req.body?.context ||
      req.body?.kind ||
      req.query?.context ||
      req.query?.kind) as string | undefined;

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
  limits: { fileSize: 50 * 1024 * 1024 },
});

/**
 * =========================================================
 * Multer (NEW notes upload: FINAL main + files[])
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
  limits: { fileSize: 50 * 1024 * 1024 },
});

/**
 * =========================================================
 * ✅ Multer (INBOX notes upload)
 * - saves to: projects/<BA>/eingangspruefung/fotos/<docId>/... and .../files/
 * =========================================================
 */
const inboxNotesStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const projectId = String(req.body?.projectId || req.body?.projectCode || "").trim();
    const docId = String(req.body?.docId || req.body?.id || "").trim();
    if (!projectId) return cb(new Error("projectId fehlt"), "");
    if (!docId) return cb(new Error("docId fehlt"), "");

    try {
      const isMain = String(file.fieldname || "").toLowerCase() === "main";
      const dir = isMain
        ? inboxDocDir(projectId, docId)
        : inboxDocFilesDir(projectId, docId);
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

/* ---- Liste aller Fotos eines Projekts (legacy) ---- */
router.get("/projects/:projectId/fotos", (req, res) => {
  const { projectId } = req.params;
  if (!projectId) return res.status(400).json({ error: "projectId fehlt" });

  const list = readMeta(projectId);
  res.json(list);
});

/* ---- Einzelnes Foto ausliefern (legacy) ---- */
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
  if (!projectId) return res.status(400).json({ error: "projectId fehlt" });
  if (!req.file) return res.status(400).json({ error: "keine Datei gesendet" });

  const ctx = String(
    req.body?.context || req.body?.kind || req.query?.context || req.query?.kind || ""
  )
    .trim()
    .toUpperCase();

  const filename = req.file.filename;

  const rel =
    ctx === "LIEFERSCHEIN" || ctx === "LS"
      ? path.join(projectId, "lieferscheine", "files", filename)
      : path.join(projectId, "fotos", filename);

  const publicUrl = `/projects/${rel.replace(/\\/g, "/")}`;

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
  if (!projectId || !id) return res.status(400).json({ error: "projectId oder id fehlt" });

  const list = readMeta(projectId);
  const idx = list.findIndex((e) => e.id === id);
  if (idx === -1) return res.status(404).json({ error: "Eintrag nicht gefunden" });

  const entry = list[idx];
  const filePath = path.join(resolveTargetDir(projectId, "FOTOS"), entry.file);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }

  list.splice(idx, 1);
  writeMeta(projectId, list);

  res.json({ ok: true });
});

/* =========================================================
 * ✅ NEW: PHOTOS / NOTES (FINAL – projects/<BA>/fotos/... )
 * =========================================================
 */

router.get("/projects/:projectId/fotos/notes", (req, res) => {
  const { projectId } = req.params;
  if (!projectId) return res.status(400).json({ error: "projectId fehlt" });

  const list = readNotes(projectId);
  res.json({ ok: true, items: list });
});

router.post(
  "/projects/:projectId/fotos/notes",
  notesUpload.fields([{ name: "main", maxCount: 1 },{ name: "files", maxCount: 50 },{ name: "file", maxCount: 50 },{ name: "photos", maxCount: 50 },{ name: "attachments", maxCount: 50 }]),
  (req, res) => {
    const { projectId } = req.params;
    if (!projectId) return res.status(400).json({ error: "projectId fehlt" });

    const filesAny = req.files as any;
    const mainFile = Array.isArray(filesAny?.main) ? filesAny.main[0] : null;
    const otherFiles = [
      ...(Array.isArray(filesAny?.files) ? filesAny.files : []),
      ...(Array.isArray(filesAny?.file) ? filesAny.file : []),
      ...(Array.isArray(filesAny?.photos) ? filesAny.photos : []),
      ...(Array.isArray(filesAny?.attachments) ? filesAny.attachments : []),
    ];

    const idRaw = String(req.body?.docId || req.body?.id || "").trim();
    const id = idRaw || `ph_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;

    const date =
      String(req.body?.date || "").slice(0, 10) ||
      new Date().toISOString().slice(0, 10);

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

    const list = readNotes(projectId);
    const idx = list.findIndex((x: any) => String(x?.id) === String(id));
    const base = idx >= 0 ? list[idx] : { id, docId: id, createdAt: new Date().toISOString() };

    const entry = {
      ...base,
      id,
      docId: id,
      date,
      kostenstelle,
      lvItemPos,
      comment,
      bemerkungen,
      note: note || comment || bemerkungen || "",
      extras,
      boxes,
      main: main || base.main || null,
      files: [...(base.files || []), ...files],
      updatedAt: new Date().toISOString(),
    };

    if (idx >= 0) list[idx] = entry;
    else list.unshift(entry);

    writeNotes(projectId, list);

    res.json({ ok: true, projectId, item: entry });
  }
);

/* =========================================================
 * ✅ INBOX (Eingang/Prüfung) – Photos/Notes
 * =========================================================
 */

// SUBMIT -> crea voce INBOX e ritorna docId
router.post("/inbox/submit", express.json(), (req, res) => {
  const projectId = String(req.body?.projectId || req.body?.projectCode || "").trim();
  if (!projectId) return res.status(400).json({ error: "projectId fehlt" });

  const idRaw = String(req.body?.docId || req.body?.id || "").trim();
  const docId = idRaw || `ph_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;

  const date =
    String(req.body?.date || "").slice(0, 10) ||
    new Date().toISOString().slice(0, 10);

  const comment = String(req.body?.comment ?? req.body?.note ?? "").trim();
  const bemerkungen = String(
    req.body?.bemerkungen ?? req.body?.comment ?? req.body?.note ?? ""
  ).trim();
  const note = String(req.body?.note ?? req.body?.comment ?? "").trim();

  const entry = {
    id: docId,
    docId,
    date,
    projectId,
    projectCode: projectId,
    note: note || comment || bemerkungen || "",
    comment,
    bemerkungen,
    kostenstelle: String(req.body?.kostenstelle || "").trim(),
    lvItemPos: String(req.body?.lvItemPos || "").trim(),
    extras: req.body?.extras ?? undefined,
    boxes: req.body?.boxes ?? undefined,
    createdAt: new Date().toISOString(),
    status: "INBOX",
    main: null,
    files: [],
  };

  const list = readInboxNotes(projectId);
  const next = [entry, ...list.filter((x: any) => String(x?.id) !== String(docId))];
  writeInboxNotes(projectId, next);

  return res.json({ ok: true, projectId, docId });
});

// UPLOAD -> salva main + files[] in Eingang/Prüfung
router.post(
  "/inbox/upload",
  inboxNotesUpload.fields([{ name: "main", maxCount: 1 },{ name: "files", maxCount: 50 },{ name: "file", maxCount: 50 },{ name: "photos", maxCount: 50 },{ name: "attachments", maxCount: 50 }]),
  (req, res) => {
    const projectId = String(req.body?.projectId || req.body?.projectCode || "").trim();
    const docId = String(req.body?.docId || req.body?.id || "").trim();
    if (!projectId) return res.status(400).json({ error: "projectId fehlt" });
    if (!docId) return res.status(400).json({ error: "docId fehlt" });

    const filesAny = req.files as any;
    const mainFile = Array.isArray(filesAny?.main) ? filesAny.main[0] : null;
    const otherFiles = [
      ...(Array.isArray(filesAny?.files) ? filesAny.files : []),
      ...(Array.isArray(filesAny?.file) ? filesAny.file : []),
      ...(Array.isArray(filesAny?.photos) ? filesAny.photos : []),
      ...(Array.isArray(filesAny?.attachments) ? filesAny.attachments : []),
    ];

    const derivedMain = !mainFile && otherFiles.length > 0 ? otherFiles[0] : null;
    const remainingFiles = derivedMain ? otherFiles.slice(1) : otherFiles;

    const pickedMain = mainFile || derivedMain;

    const main = pickedMain
      ? {
          file: pickedMain.filename,
          name: pickedMain.originalname,
          publicUrl: mainFile
            ? makeInboxMainPublicUrl(projectId, docId, pickedMain.filename)
            : makeInboxPublicUrl(projectId, docId, pickedMain.filename),
        }
      : null;

    const files = (remainingFiles || []).map((f: any) => ({
      file: f.filename,
      name: f.originalname,
      publicUrl: makeInboxPublicUrl(projectId, docId, f.filename),
    }));

    const list = readInboxNotes(projectId);
    const idx = list.findIndex((x: any) => String(x?.id) === String(docId));

    const base =
      idx >= 0
        ? list[idx]
        : { id: docId, docId, projectId, projectCode: projectId, createdAt: new Date().toISOString() };

    const updated = {
      ...base,
      main: main || base.main || null,
      files: [...(base.files || []), ...files],
      updatedAt: new Date().toISOString(),
    };

    if (idx >= 0) list[idx] = updated;
    else list.unshift(updated);

    writeInboxNotes(projectId, list);

    const decorated = decorateInboxItem(projectId, updated);

    return res.json({
      ok: true,
      projectId,
      docId,
      item: decorated,
      items: [
        ...(main ? [{ name: main.name, url: main.publicUrl }] : []),
        ...files.map((x: any) => ({ name: x.name, url: x.publicUrl })),
      ],
    });
  }
);

// LIST INBOX
router.get("/inbox/list", (req, res) => {
  const projectId = String(req.query?.projectId || "").trim();
  if (!projectId) return res.status(400).json({ error: "projectId fehlt" });
  const list = readInboxNotes(projectId).map((it: any) => decorateInboxItem(projectId, it));
  return res.json({ ok: true, items: list });
});


// READ INBOX DOC
router.get("/inbox/read", (req, res) => {
  const projectId = String(req.query?.projectId || "").trim();
  const docId = String(req.query?.docId || req.query?.id || "").trim();

  if (!projectId) return res.status(400).json({ ok: false, error: "projectId fehlt" });
  if (!docId) return res.status(400).json({ ok: false, error: "docId fehlt" });

  const list = readInboxNotes(projectId);
  const found = list.find((x: any) =>
    String(x?.id || "") === docId || String(x?.docId || "") === docId
  );

  if (!found) return res.status(404).json({ ok: false, error: "doc not found in inbox" });

  return res.json({
    ok: true,
    projectId,
    docId,
    snapshot: decorateInboxItem(projectId, found),
  });
});

// APPROVE INBOX DOC -> FINAL
function commitInboxDoc(projectId: string, docIdRaw: string) {
  const docId = String(docIdRaw || "").trim();
  if (!projectId) throw new Error("projectId fehlt");
  if (!docId) throw new Error("docId fehlt");

  const inboxList = readInboxNotes(projectId);
  const idx = inboxList.findIndex((x: any) =>
    String(x?.id || "") === docId || String(x?.docId || "") === docId
  );

  if (idx < 0) {
    const err: any = new Error("doc not found in inbox");
    err.statusCode = 404;
    throw err;
  }

  const entry = inboxList[idx];
  const realDocId = String(entry?.id || entry?.docId || docId).trim();

  const srcDir = inboxDocDir(projectId, realDocId);
  const dstDir = path.join(notesDir(projectId), safeName(realDocId));

  if (fs.existsSync(srcDir)) {
    moveDirRobust(srcDir, dstDir);
  }

  const finalMain = entry?.main
    ? {
        ...entry.main,
        publicUrl: makeFinalMainPublicUrl(projectId, realDocId, String(entry.main.file || "")),
      }
    : null;

  const finalFiles = Array.isArray(entry?.files)
    ? entry.files.map((f: any) => ({
        ...f,
        publicUrl: makeFinalPublicUrl(projectId, realDocId, String(f.file || "")),
      }))
    : [];

  const finalList = readNotes(projectId);
  const finalIdx = finalList.findIndex((x: any) =>
    String(x?.id || "") === realDocId || String(x?.docId || "") === realDocId
  );

  const finalEntry = {
    ...entry,
    id: realDocId,
    docId: realDocId,
    projectId,
    projectCode: projectId,
    status: "FREIGEGEBEN",
    workflowStatus: "FREIGEGEBEN",
    submittedAt: entry?.submittedAt || entry?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    main: finalMain,
    files: finalFiles,
    imageUri: finalMain?.publicUrl || entry?.imageUri || undefined,
  };

  if (finalIdx >= 0) finalList[finalIdx] = finalEntry;
  else finalList.unshift(finalEntry);

  writeNotes(projectId, finalList);

  inboxList.splice(idx, 1);
  writeInboxNotes(projectId, inboxList);

  return finalEntry;
}

router.post("/inbox/approve", express.json(), (req, res) => {
  try {
    const projectId = String(req.body?.projectId || req.body?.projectCode || "").trim();
    const docId = String(req.body?.docId || req.body?.id || "").trim();

    if (!projectId) return res.status(400).json({ ok: false, error: "projectId fehlt" });
    if (!docId) return res.status(400).json({ ok: false, error: "docId fehlt" });

    const item = commitInboxDoc(projectId, docId);
    return res.json({ ok: true, projectId, docId: item.docId, item });
  } catch (e: any) {
    const status = Number(e?.statusCode || 500);
    return res.status(status).json({ ok: false, error: String(e?.message || e) });
  }
});

// alias
router.post("/commit", express.json(), (req, res) => {
  try {
    const projectId = String(req.body?.projectId || req.body?.projectCode || "").trim();
    const docId = String(req.body?.docId || req.body?.id || "").trim();

    if (!projectId) return res.status(400).json({ ok: false, error: "projectId fehlt" });
    if (!docId) return res.status(400).json({ ok: false, error: "docId fehlt" });

    const item = commitInboxDoc(projectId, docId);
    return res.json({ ok: true, projectId, docId: item.docId, item });
  } catch (e: any) {
    const status = Number(e?.statusCode || 500);
    return res.status(status).json({ ok: false, error: String(e?.message || e) });
  }
});

router.post("/inbox/reject", express.json(), (req, res) => {
  const projectId = String(req.body?.projectId || req.body?.projectCode || "").trim();
  const docId = String(req.body?.docId || req.body?.id || "").trim();
  const reason = String(req.body?.reason || "").trim();

  if (!projectId) return res.status(400).json({ ok: false, error: "projectId fehlt" });
  if (!docId) return res.status(400).json({ ok: false, error: "docId fehlt" });

  const list = readInboxNotes(projectId);
  const idx = list.findIndex((x: any) =>
    String(x?.id || "") === docId || String(x?.docId || "") === docId
  );

  if (idx < 0) return res.status(404).json({ ok: false, error: "doc not found in inbox" });

  list[idx] = {
    ...list[idx],
    status: "ABGELEHNT",
    workflowStatus: "ABGELEHNT",
    rejectionReason: reason || "",
    updatedAt: new Date().toISOString(),
  };

  writeInboxNotes(projectId, list);

  return res.json({ ok: true, projectId, docId, item: decorateInboxItem(projectId, list[idx]) });
});

export default router;

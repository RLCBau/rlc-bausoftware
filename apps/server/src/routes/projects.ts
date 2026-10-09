// apps/server/src/routes/projects.ts
import express, { Request, Response } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { prisma } from "../lib/prisma";
import { activeDmsRetention } from "../services/dmsArchive";

// ✅ FIX: usa il requireAuth “vero” (con DEV_AUTH bypass) dal middleware/auth.ts
import { requireAuth } from "../middleware/auth";
import { ensureProjectStructure } from "../lib/ensureProjectStructure";

import { PROJECTS_ROOT } from "../lib/projectsRoot";
import { archiveProjectBufferVersion } from "../services/dmsArchive";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});
const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
});

/* =========================================================
 * helpers
 * =======================================================*/
function safeFsName(name: string) {
  return String(name || "")
    .trim()
    .replace(/[^A-Za-z0-9_\-]/g, "_")
    .slice(0, 80);
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeProjectJson(projectDir: string, project: any) {
  const pj = {
    id: project.id,
    code: project.code,
    name: project.name,
    number: project.number ?? null,
    client: project.client ?? "",
    place: project.place ?? "",
    createdAt: project.createdAt ?? new Date().toISOString(),
    source: "DB",
  };
  const file = path.join(projectDir, "project.json");
  fs.writeFileSync(file, JSON.stringify(pj, null, 2), "utf8");
}

function uniqueFolderByCode(baseCode: string) {
  const base = safeFsName(baseCode);
  if (!base) throw new Error("Invalid project code for FS folder.");

  let candidate = base;
  let i = 1;
  while (fs.existsSync(path.join(PROJECTS_ROOT, candidate))) {
    candidate = `${base}_${i++}`;
    if (i > 999) throw new Error("Cannot allocate unique FS folder.");
  }
  return candidate;
}

function isUuidLike(x: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(x || "")
  );
}

function readProjectJsonFromFs(fsKeyOrCode: string): any | null {
  const fsKey = safeFsName(fsKeyOrCode);
  if (!fsKey) return null;

  const folder = path.join(PROJECTS_ROOT, fsKey);
  const file = path.join(folder, "project.json");
  if (!fs.existsSync(file)) return null;

  try {
    const raw = fs.readFileSync(file, "utf8");
    const data = JSON.parse(raw);
    return { fsKey, folder, data };
  } catch {
    return null;
  }
}

function readAllFsProjects(): Array<{
  fsKey: string;
  folder: string;
  data: any;
}> {
  try {
    ensureDir(PROJECTS_ROOT);
    const entries = fs.readdirSync(PROJECTS_ROOT, { withFileTypes: true });
    const out: Array<{ fsKey: string; folder: string; data: any }> = [];

    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const fsKey = String(e.name || "").trim();
      if (!fsKey) continue;

      const folder = path.join(PROJECTS_ROOT, fsKey);
      const file = path.join(folder, "project.json");
      if (!fs.existsSync(file)) continue;

      try {
        const raw = fs.readFileSync(file, "utf8");
        const data = JSON.parse(raw);
        out.push({ fsKey, folder, data });
      } catch {
        // ignore broken json
      }
    }

    return out;
  } catch {
    return [];
  }
}

function normalizeProjectForClient(p: any) {
  return {
    id: String(p?.id || "").trim(),
    code: p?.code ?? undefined,
    name: p?.name ?? undefined,
    number: p?.number ?? null,
    baustellenNummer: p?.baustellenNummer ?? p?.number ?? null,
    client: p?.client ?? "",
    kunde: p?.kunde ?? p?.client ?? "",
    place: p?.place ?? "",
    ort: p?.ort ?? p?.place ?? "",
    createdAt: p?.createdAt ?? undefined,
    year: p?.year !== null && p?.year !== undefined && Number.isFinite(Number(p.year)) ? Number(p.year) : null,
    totalNet: p?.totalNet !== null && p?.totalNet !== undefined && Number.isFinite(Number(p.totalNet)) ? Number(p.totalNet) : null,
  };
}

function dedupeProjectsStable(list: any[]) {
  const byId = new Map<string, any>();
  const byCode = new Map<string, any>();

  for (const p of list || []) {
    const id = String(p?.id || "").trim();
    const code = String(p?.code || "").trim();

    if (id && byId.has(id)) continue;
    if (!id && code && byCode.has(code)) continue;

    if (id) byId.set(id, p);
    if (code) byCode.set(code, p);
  }

  const out: any[] = [];
  const seen = new Set<any>();

  for (const p of list || []) {
    const id = String(p?.id || "").trim();
    const code = String(p?.code || "").trim();

    const pick = id ? byId.get(id) : code ? byCode.get(code) : p;
    if (!pick) continue;
    if (seen.has(pick)) continue;

    seen.add(pick);
    out.push(pick);
  }

  return out;
}

/* =========================================================
 * ensureCompanyId
 * =======================================================*/
async function ensureCompanyId(req: Request): Promise<string> {
  const auth: any = (req as any).auth;
  const candidate =
    typeof auth?.companyId === "string"
      ? auth.companyId
      : typeof auth?.company === "string"
        ? auth.company
        : "";

  const companyId = String(candidate || "").trim();

  if (!companyId) {
    const error: any = new Error("COMPANY_CONTEXT_REQUIRED");
    error.status = 403;
    throw error;
  }

  const found = await prisma.company.findUnique({
    where: { id: companyId },
  });

  if (!found) {
    const error: any = new Error("COMPANY_NOT_FOUND");
    error.status = 403;
    throw error;
  }

  return found.id;
}

function projectRole(req: any): string {
  return String(req?.auth?.companyRole || req?.auth?.role || "").trim().toUpperCase();
}

function projectUserId(req: any): string {
  return String(req?.auth?.sub || req?.auth?.userId || "").trim();
}

function projectAdmin(req: any): boolean {
  return ["ADMIN", "ADMINISTRATOR"].includes(projectRole(req));
}

function requireProjectManageRole(req: any, res: any, next: any) {
  if (!["ADMIN", "ADMINISTRATOR", "BAULEITER", "KALKULATOR"].includes(projectRole(req))) {
    return res.status(403).json({ ok: false, error: "PROJECT_MANAGE_FORBIDDEN" });
  }
  return next();
}

function requireProjectAdminRole(req: any, res: any, next: any) {
  if (!projectAdmin(req)) {
    return res.status(403).json({ ok: false, error: "PROJECT_ADMIN_REQUIRED" });
  }
  return next();
}

async function resolveAccessibleProject(req: any, token: string) {
  const companyId = await ensureCompanyId(req);
  const value = String(token || "").trim();
  if (!value) return null;

  const project = await prisma.project.findFirst({
    where: { companyId, OR: [{ id: value }, { code: value }] },
    select: { id: true, code: true, name: true, companyId: true },
  });
  if (!project) return null;
  if (projectAdmin(req)) return project;

  const uid = projectUserId(req);
  if (!uid) return null;
  const member = await prisma.projectMember.findFirst({
    where: { projectId: project.id, userId: uid },
    select: { id: true },
  });
  return member ? project : null;
}

function requireProjectParamAccess(paramName: string) {
  return async (req: any, res: any, next: any) => {
    try {
      const project = await resolveAccessibleProject(req, req.params?.[paramName]);
      if (!project) return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });
      req.resolvedProject = project;
      return next();
    } catch (error: any) {
      return res.status(Number(error?.status) === 403 ? 403 : 500).json({
        ok: false,
        error: error?.message || "PROJECT_ACCESS_CHECK_FAILED",
      });
    }
  };
}

function canonicalProjectDir(project: { id: string; code?: string | null }, allowLegacyRead = false) {
  const canonical = path.join(PROJECTS_ROOT, safeFsName(project.id));
  if (!allowLegacyRead || fs.existsSync(canonical)) return canonical;

  const code = safeFsName(String(project.code || ""));
  if (!code) return canonical;
  const legacy = readProjectJsonFromFs(code);
  if (legacy?.data && String(legacy.data.id || "").trim() === project.id) {
    return legacy.folder;
  }
  return canonical;
}
/* =========================================================
 * generator BA-YYYY-XXX
 * =======================================================*/
async function generateProjectCode(companyId: string) {
  const year = new Date().getFullYear();
  const prefix = `BA-${year}-`;

  // Never derive the next code from "last created": imports and manual codes
  // may be out of sequence. Read all BA codes for the current year and pick
  // the first free number after the real maximum.
  const rows = await prisma.project.findMany({
    where: { companyId, code: { startsWith: prefix } },
    select: { code: true },
  });

  let maxNumber = 0;
  const used = new Set<number>();
  for (const row of rows) {
    const match = String(row.code || "").match(new RegExp(`^BA-${year}-(\\d{3})$`));
    if (!match) continue;
    const n = Number(match[1]);
    if (!Number.isFinite(n)) continue;
    used.add(n);
    if (n > maxNumber) maxNumber = n;
  }

  let nextNumber = maxNumber + 1;
  while (used.has(nextNumber)) nextNumber += 1;

  return `BA-${year}-${String(nextNumber).padStart(3, "0")}`;
}

/* =========================================================
 * GET /api/projects
 * =======================================================*/
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const companyId = await ensureCompanyId(req);

    const uid = projectUserId(req);
    const db = await prisma.project.findMany({
      where: {
        companyId,
        ...(projectAdmin(req) ? {} : { projectMembers: { some: { userId: uid } } }),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        code: true,
        name: true,
        number: true,
        client: true,
        place: true,
        createdAt: true,
      },
    });

    const metrics: any[] = await prisma.$queryRawUnsafe(
      `WITH latest AS (
         SELECT DISTINCT ON (h."projectId") h.id, h."projectId", h."priceDate", h.version
         FROM "LVHeader" h
         JOIN "Project" pr ON pr.id = h."projectId"
         WHERE pr."companyId" = $1
         ORDER BY h."projectId", h.version DESC
       )
       SELECT l."projectId" AS "projectId",
              l."priceDate" AS "priceDate",
              SUM(COALESCE(p."x84Total", p.gesamt))::float8 AS "totalNet"
       FROM latest l
       LEFT JOIN "LVPosition" p ON p."lvId" = l.id
       GROUP BY l."projectId", l."priceDate"`,
      companyId
    );
    const metricByProject = new Map(metrics.map((row: any) => [String(row.projectId), row]));
    const out = db.map((project: any) => {
      const metric: any = metricByProject.get(project.id) || {};
      const priceDate = metric.priceDate ? new Date(metric.priceDate) : null;
      const explicitYear = priceDate && Number.isFinite(priceDate.getTime()) ? priceDate.getUTCFullYear() : null;
      const yearSource = String(`${project.code || ""} ${project.name || ""}`);
      const fourDigitYear = yearSource.match(/\b(20(?:2[0-9]|3[0-5]))\b/)?.[1];
      const twoDigitYear = yearSource.match(/(?:^|[^0-9])(2[0-9])(?:[^0-9]|$)/)?.[1];
      const inferredYear = fourDigitYear
        ? Number(fourDigitYear)
        : twoDigitYear
          ? 2000 + Number(twoDigitYear)
          : null;
      const fallbackYear = !String(project.code || "").startsWith("GAEB-")
        ? new Date(project.createdAt).getUTCFullYear()
        : null;
      return normalizeProjectForClient({
        ...project,
        year: explicitYear || inferredYear || fallbackYear,
        totalNet: metric.totalNet == null ? null : Number(metric.totalNet),
      });
    });

    res.json({ ok: true, projects: out });
  } catch (err: any) {
    console.error("GET /api/projects error:", err);
    const status = Number(err?.status) === 403 ? 403 : 500;
    res.status(status).json({
      ok: false,
      error: err?.message || "Fehler beim Laden der Projekte",
    });
  }
});

/* =========================================================
 * POST /api/projects – create project
 * =======================================================*/
router.post("/", requireAuth, requireProjectManageRole, async (req: Request, res: Response) => {
  try {
    const companyId = await ensureCompanyId(req);
    const { code: requestedCode, name, client, place, number } = req.body || {};

    const normalizedRequestedCode = String(requestedCode ?? "").trim().toUpperCase();
    const code = normalizedRequestedCode || await generateProjectCode(companyId);

    const duplicate = await prisma.project.findFirst({
      where: { companyId, code },
      select: { id: true, code: true, name: true },
    });
    if (duplicate) {
      return res.status(409).json({
        ok: false,
        error: `Projektnummer ${code} ist bereits vorhanden.`,
        projectId: duplicate.id,
      });
    }

    const project = await prisma.project.create({
      data: {
        code,
        name: String(name ?? "Neues Projekt"),
        client: String(client ?? ""),
        place: String(place ?? ""),
        number: number ?? null,
        companyId,
      },
    });
    
  const fsKey = safeFsName(project.id);
if (!fsKey) throw new Error("Project id missing - cannot create FS folder.");

const folderByCode = ensureProjectStructure(fsKey);

console.log("[PROJECT CREATE] code=", project.code);
console.log("[PROJECT CREATE] fsKey=", fsKey);
console.log("[PROJECT CREATE] PROJECTS_ROOT=", PROJECTS_ROOT);
console.log("[PROJECT CREATE] folderByCode=", folderByCode);
console.log("[PROJECT CREATE] exists after ensure=", fs.existsSync(folderByCode));

writeProjectJson(folderByCode, project);

const creatorRole = projectRole(req);
const creatorUserId = projectUserId(req);
if (creatorUserId && !projectAdmin(req)) {
  const memberRole = creatorRole === "KALKULATOR" ? "KALKULATOR" : "BAULEITER";
  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: project.id, userId: creatorUserId } },
    update: { role: memberRole as any },
    create: {
      projectId: project.id,
      userId: creatorUserId,
      role: memberRole as any,
      canDownload: true,
    },
  });
}

console.log(
  "[PROJECT CREATE] project.json exists=",
  fs.existsSync(path.join(folderByCode, "project.json"))
);

res.json({ ok: true, project, fsKey, folderByCode });

  } catch (err: any) {
    console.error("POST /api/projects error:", err);
    res.status(500).json({ ok: false, error: err?.message || "Fehler beim Erstellen des Projekts" });
  }
});

/* =========================================================
 * IMPORT – robust handler
 * =======================================================*/
async function importProjectFromAny(req: Request) {
  const companyId = await ensureCompanyId(req);

  const anyFiles: any = (req as any).files || {};
  const fileFromSingle = (req as any).file?.buffer ? (req as any).file : null;

  const pickBuffer = (): Buffer | null => {
    if (fileFromSingle?.buffer) return fileFromSingle.buffer;

    const keys = ["file", "project", "projectJson", "json", "project_json"];
    for (const k of keys) {
      const v = anyFiles?.[k];
      if (Array.isArray(v) && v[0]?.buffer) return v[0].buffer;
    }
    return null;
  };

  let imported: any = null;

  const buf = pickBuffer();
  if (buf) {
    imported = JSON.parse(buf.toString("utf8"));
  } else {
    const body: any = req.body || {};
    imported = body.project ?? body.data ?? body;
    if (!imported || typeof imported !== "object") {
      throw new Error("Missing project.json data (no file and no JSON body).");
    }
  }

  let desiredCode = String(imported?.code || "").trim();
  if (!desiredCode) desiredCode = await generateProjectCode(companyId);

  const exists = await prisma.project.findFirst({
    where: { companyId, code: desiredCode },
    select: { id: true },
  });

  if (exists) {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    desiredCode = `${desiredCode}_IMPORTED_${stamp}`;
  }

  const project = await prisma.project.create({
    data: {
      code: desiredCode,
      name: String(imported?.name ?? "Importiertes Projekt"),
      client: String(imported?.client ?? ""),
      place: String(imported?.place ?? ""),
      number: imported?.number ?? null,
      companyId,
    },
  });

  const fsKey = safeFsName(project.id);
  if (!fsKey) throw new Error("Project id missing - cannot create FS folder.");
  const folder = ensureProjectStructure(fsKey);
  writeProjectJson(folder, project);

  const creatorRole = projectRole(req);
  const creatorUserId = projectUserId(req);
  if (creatorUserId && !projectAdmin(req)) {
    const memberRole = creatorRole === "KALKULATOR" ? "KALKULATOR" : "BAULEITER";
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: project.id, userId: creatorUserId } },
      update: { role: memberRole as any },
      create: {
        projectId: project.id,
        userId: creatorUserId,
        role: memberRole as any,
        canDownload: true,
      },
    });
  }

  return { project, fsKey };
}

router.post("/import-json", requireAuth, requireProjectManageRole, upload.single("file"), async (req: Request, res: Response) => {
  try {
    const out = await importProjectFromAny(req);
    res.json({ ok: true, ...out });
  } catch (err: any) {
    console.error("POST /api/projects/import-json error:", err);
    res.status(500).json({ ok: false, error: err?.message || "Backend import error" });
  }
});

router.post(
  ["/import", "/importJson", "/import_project_json", "/import-project-json"],
  requireAuth,
  requireProjectManageRole,
  upload.fields([
    { name: "file", maxCount: 1 },
    { name: "project", maxCount: 1 },
    { name: "projectJson", maxCount: 1 },
    { name: "json", maxCount: 1 },
    { name: "project_json", maxCount: 1 },
  ]),
  async (req: Request, res: Response) => {
    try {
      const out = await importProjectFromAny(req);
      res.json({ ok: true, ...out });
    } catch (err: any) {
      console.error("POST /api/projects/import (aliases) error:", err);
      res.status(500).json({ ok: false, error: err?.message || "Backend import error" });
    }
  }
);

router.post(
  ["/import-json-body", "/importBody"],
  requireAuth,
  requireProjectManageRole,
  express.json({ limit: "10mb" }),
  async (req, res) => {
    try {
      const out = await importProjectFromAny(req as any);
      res.json({ ok: true, ...out });
    } catch (err: any) {
      console.error("POST /api/projects/import-json-body error:", err);
      res.status(500).json({ ok: false, error: err?.message || "Backend import error" });
    }
  }
);

/* =========================================================
 * GET /api/projects/:idOrCode
 * =======================================================*/
/* =========================================================
 * GET /api/projects/:fsKey/pdfs
 * =======================================================*/
function collectProjectPdfFiles(rootAbs: string) {
  const items: Array<{
    name: string;
    rel: string;
    folder: string;
    mtime: string;
    url: string;
  }> = [];

  function walk(dirAbs: string, depth: number) {
    if (depth > 6) return;
    if (!fs.existsSync(dirAbs)) return;

    const entries = fs.readdirSync(dirAbs, { withFileTypes: true });
    for (const e of entries) {
      const abs = path.join(dirAbs, e.name);

      if (e.isDirectory()) {
        walk(abs, depth + 1);
        continue;
      }

      if (!e.isFile()) continue;
      if (!e.name.toLowerCase().endsWith(".pdf")) continue;

      const st = fs.statSync(abs);
      const rel = path.relative(rootAbs, abs).replace(/\\/g, "/");
      const folder = rel.includes("/") ? rel.split("/")[0] : "";

      items.push({
        name: e.name,
        rel,
        folder,
        mtime: st.mtime.toISOString(),
        url: `/projects/${path.basename(rootAbs)}/${rel}`.replace(/\\/g, "/"),
      });
    }
  }

  walk(rootAbs, 0);
  items.sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
  return items;
}

router.get("/:fsKey/pdfs", requireAuth, requireProjectParamAccess("fsKey"), async (req: Request, res: Response) => {
  try {
    const project = (req as any).resolvedProject;
    if (!project) return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });
    const fsKey = safeFsName(project.id);
    const projectDir = canonicalProjectDir(project, true);
    if (!fs.existsSync(projectDir)) {
      return res.json({ ok: true, fsKey, items: [] });
    }

    const items = collectProjectPdfFiles(projectDir);
    return res.json({ ok: true, fsKey, items });
  } catch (err: any) {
    console.error("GET /api/projects/:fsKey/pdfs error:", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Fehler beim Laden der PDFs",
    });
  }
});

/* =========================================================
 * POST /api/projects/:fsKey/pdfs/upload
 * =======================================================*/
router.post(
  "/:fsKey/pdfs/upload",
  requireAuth,
  requireProjectManageRole,
  requireProjectParamAccess("fsKey"),
  pdfUpload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const project = (req as any).resolvedProject;
      if (!project) return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });
      const fsKey = safeFsName(project.id);

      if (!req.file?.buffer) {
        return res.status(400).json({ ok: false, error: "Missing PDF file" });
      }
      if (req.file.buffer.length < 5 || req.file.buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
        return res.status(415).json({ ok: false, error: "Ungültige PDF-Datei" });
      }

      const kindFolderRaw = String(req.body?.kindFolder || "").trim().toLowerCase();
      const kindFolder =
        kindFolderRaw === "regie" ||
        kindFolderRaw === "lieferscheine" ||
        kindFolderRaw === "photos"
          ? kindFolderRaw
          : "regie";

      const projectDir = ensureProjectStructure(fsKey);
      writeProjectJson(projectDir, project);

      const targetDir = path.join(projectDir, kindFolder);
      ensureDir(targetDir);

      const fileName = safeFsName(
        String((req.file.originalname || "export.pdf").replace(/\.pdf$/i, ""))
      ) + ".pdf";

      const target = path.join(targetDir, fileName);
      fs.writeFileSync(target, req.file.buffer);

      const auth = (req as any).auth || {};
      void archiveProjectBufferVersion({
        projectIdOrCode: fsKey,
        filename: fileName,
        kind: "PDF",
        buffer: req.file.buffer,
        uploadedBy: String(auth.email || auth.userId || auth.sub || "").trim() || null,
        meta: { module: "PROJEKTE", source: "projects.pdf.upload", folder: kindFolder }
      }).catch((error) => console.error("[projects:pdf-upload:dms]", error));

      const st = fs.statSync(target);
      const rel = path.relative(projectDir, target).replace(/\\/g, "/");

      return res.json({
        ok: true,
        fsKey,
        item: {
          name: fileName,
          rel,
          folder: kindFolder,
          mtime: st.mtime.toISOString(),
          url: `/projects/${fsKey}/${rel}`.replace(/\\/g, "/"),
        },
      });
    } catch (err: any) {
      console.error("POST /api/projects/:fsKey/pdfs/upload error:", err);
      return res.status(500).json({
        ok: false,
        error: err?.message || "Fehler beim Upload der PDF",
      });
    }
  }
);


/* =========================================================
 * POST /api/projects/:projectIdOrCode/documents/upload
 * Upload generico Mobile/Web: archivia direttamente nel DMS.
 * =======================================================*/
router.post(
  "/:projectIdOrCode/documents/upload",
  requireAuth,
  requireProjectManageRole,
  requireProjectParamAccess("projectIdOrCode"),
  pdfUpload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const project = (req as any).resolvedProject;
      if (!project) return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });
      const projectIdOrCode = project.id;

      if (!req.file?.buffer) {
        return res.status(400).json({ ok: false, error: "Datei fehlt." });
      }

      const fileName =
        String(req.file.originalname || "export.bin")
          .replace(/[^\w.-]+/g, "_")
          .replace(/_+/g, "_")
          .slice(0, 180) || "export.bin";

      const kind =
        /\.pdf$/i.test(fileName)
          ? "PDF"
          : /\.(x31|d11|x83|x84|d83|p83)$/i.test(fileName)
            ? "LV"
            : "OTHER";

      const auth = (req as any).auth || {};

      await archiveProjectBufferVersion({
        projectIdOrCode,
        filename: fileName,
        kind,
        buffer: req.file.buffer,
        uploadedBy: String(auth.email || auth.userId || auth.sub || "").trim() || null,
        meta: {
          module: String(req.body?.module || "MOBILE_EXPORT"),
          source: "projects.documents.upload",
          mime: String(req.file.mimetype || "application/octet-stream"),
        },
      });

      return res.json({ ok: true, fileName, kind });
    } catch (error: any) {
      console.error("[projects:documents-upload:dms]", error);
      return res.status(500).json({
        ok: false,
        error: error?.message || "Datei konnte nicht im DMS archiviert werden.",
      });
    }
  }
);

router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const key = String(req.params.id || "").trim();
    if (!key) return res.status(400).json({ ok: false, error: "Missing id" });

    const proj = await resolveAccessibleProject(req, key);
    if (!proj) return res.status(404).json({ ok: false, error: "Projekt nicht gefunden" });

    const fsKey = safeFsName(proj.id);
    if (fsKey) {
      const folder = ensureProjectStructure(fsKey);
      writeProjectJson(folder, proj);
    }

    res.json({ ok: true, project: proj, fsKey });
  } catch (err: any) {
    console.error("GET /api/projects/:id error:", err);
    res.status(500).json({ ok: false, error: err?.message || "Fehler beim Laden des Projekts" });
  }
});

/* =========================================================
 * DELETE /api/projects/:id
 * =======================================================*/
router.delete("/:id", requireAuth, requireProjectAdminRole, async (req: Request, res: Response) => {
  try {
    const companyId = await ensureCompanyId(req);
    const id = String(req.params.id);

    const proj = await prisma.project.findFirst({
      where: { id, companyId },
      select: { id: true, code: true },
    });
    if (!proj) return res.status(404).json({ ok: false, error: "Projekt nicht gefunden" });

    const retainedDocuments = await prisma.document.findMany({
      where: { projectId: proj.id, deletedAt: null },
      select: { id:true, name:true, meta:true }
    });
    const activeRetention = retainedDocuments
      .map((doc:any) => ({ doc, retention: activeDmsRetention(doc.meta) }))
      .filter((x:any) => x.retention.locked);
    if (activeRetention.length) {
      await prisma.project.update({ where:{id:proj.id}, data:{status:"archived"} });
      return res.status(409).json({
        ok:false,
        error:"PROJECT_LEGAL_RETENTION_LOCK",
        message:"Projekt enthält aufbewahrungspflichtige Dokumente und wurde daher archiviert statt gelöscht.",
        archived:true,
        retainedDocuments:activeRetention.slice(0,50).map((x:any)=>({id:x.doc.id,name:x.doc.name,retentionUntil:x.retention.until,reason:x.retention.reason}))
      });
    }

    // A project can be referenced as the current project of one or more users.
    // Clear that pointer first; all project-owned data then follows the schema's
    // cascade rules.
    await prisma.$transaction([
      prisma.user.updateMany({
        where: { currentProjectId: proj.id },
        data: { currentProjectId: null },
      }),
      prisma.project.delete({ where: { id: proj.id } }),
    ]);

    const fsKey = safeFsName(proj.id);
    if (fsKey) {
      const folder = path.join(PROJECTS_ROOT, fsKey);
      const rootResolved = path.resolve(PROJECTS_ROOT);
      const folderResolved = path.resolve(folder);
      if (folderResolved !== rootResolved && folderResolved.startsWith(rootResolved)) {
        if (fs.existsSync(folder)) fs.rmSync(folder, { recursive: true, force: true });
      }
    }

    res.json({ ok: true });
  } catch (err: any) {
    console.error("DELETE /api/projects/:id error:", err);
    res.status(500).json({ ok: false, error: err?.message || "Fehler beim Löschen des Projekts" });
  }
});

export default router;

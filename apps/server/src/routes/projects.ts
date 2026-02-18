// apps/server/src/routes/projects.ts
import express, { Request, Response } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { prisma } from "../lib/prisma";

// ✅ FIX: usa il requireAuth “vero” (con DEV_AUTH bypass) dal middleware/auth.ts
import { requireAuth } from "../middleware/auth";

import { PROJECTS_ROOT } from "../lib/projectsRoot";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

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

  if (auth && typeof auth.company === "string") {
    const found = await prisma.company.findUnique({ where: { id: auth.company } });
    if (found) return found.id;
  }

  if (process.env.DEV_COMPANY_ID) {
    const found = await prisma.company.findUnique({ where: { id: process.env.DEV_COMPANY_ID } });
    if (found) return found.id;
  }

  const first = await prisma.company.findFirst();
  if (first) return first.id;

  const created = await prisma.company.create({
    data: { name: "Standard Firma", code: "STANDARD" },
  });

  return created.id;
}

/* =========================================================
 * generator BA-YYYY-XXX
 * =======================================================*/
async function generateProjectCode(companyId: string) {
  const year = new Date().getFullYear();

  const last = await prisma.project.findFirst({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    select: { code: true },
  });

  let nextNumber = 1;
  if (last?.code) {
    const match = last.code.match(/^BA-(\d{4})-(\d{3})$/);
    if (match) {
      const lastYear = parseInt(match[1], 10);
      const lastNum = parseInt(match[2], 10);
      if (lastYear === year && Number.isFinite(lastNum)) nextNumber = lastNum + 1;
    }
  }

  return `BA-${year}-${String(nextNumber).padStart(3, "0")}`;
}

/* =========================================================
 * GET /api/projects
 * =======================================================*/
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const companyId = await ensureCompanyId(req);

    const db = await prisma.project.findMany({
      where: { companyId },
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

    const fsProjectsRaw = readAllFsProjects();
    const dbIds = new Set(db.map((p) => String(p.id)));
    const dbCodes = new Set(db.map((p) => String(p.code || "").trim()).filter(Boolean));

    const fsExtras = fsProjectsRaw
      .map((x) => x?.data || null)
      .filter(Boolean)
      .filter((p) => {
        const id = String(p?.id || "").trim();
        const code = String(p?.code || "").trim();
        if (id && dbIds.has(id)) return false;
        if (code && dbCodes.has(code)) return false;
        return true;
      })
      .map((p) => ({
        id: String(p?.id || "").trim() || `fs-${safeFsName(String(p?.code || "PROJECT"))}`,
        code: String(p?.code || "").trim() || undefined,
        name: String(p?.name || "").trim() || undefined,
        number: p?.number ?? null,
        client: String(p?.client || "").trim(),
        place: String(p?.place || "").trim(),
        createdAt: p?.createdAt || undefined,
        source: "FS",
      }));

    const merged = [...db, ...fsExtras];
    const deduped = dedupeProjectsStable(merged);
    const out = deduped.map(normalizeProjectForClient);

    res.json({ ok: true, projects: out });
  } catch (err: any) {
    console.error("GET /api/projects error:", err);
    res.status(500).json({ ok: false, error: err?.message || "Fehler beim Laden der Projekte" });
  }
});

/* =========================================================
 * POST /api/projects – create project
 * =======================================================*/
router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const companyId = await ensureCompanyId(req);
    const { name, client, place, number } = req.body || {};

    const code = await generateProjectCode(companyId);

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

    const fsKey = safeFsName(project.code || "");
    if (!fsKey) throw new Error("Project code missing - cannot create FS folder.");

    const folderByCode = path.join(PROJECTS_ROOT, fsKey);
    ensureDir(folderByCode);
    writeProjectJson(folderByCode, project);

    res.json({ ok: true, project, fsKey });
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

  const fsKey = uniqueFolderByCode(project.code);
  const folder = path.join(PROJECTS_ROOT, fsKey);
  ensureDir(folder);
  writeProjectJson(folder, project);

  return { project, fsKey };
}

router.post("/import-json", requireAuth, upload.single("file"), async (req: Request, res: Response) => {
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
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const companyId = await ensureCompanyId(req);
    const key = String(req.params.id || "").trim();
    if (!key) return res.status(400).json({ ok: false, error: "Missing id" });

    let proj = null as any;

    if (isUuidLike(key)) {
      proj = await prisma.project.findFirst({ where: { id: key, companyId } });
    }

    if (!proj) {
      proj = await prisma.project.findFirst({ where: { code: key, companyId } });
    }

    if (!proj) {
      const fsFound = readProjectJsonFromFs(key);
      if (fsFound?.data) {
        const code = String(fsFound.data.code || key).trim();
        const name = String(fsFound.data.name ?? "Projekt");
        const client = String(fsFound.data.client ?? "");
        const place = String(fsFound.data.place ?? "");
        const number = fsFound.data.number ?? null;

        const existing = await prisma.project.findFirst({ where: { companyId, code } });

        if (existing) {
          proj = existing;
        } else {
          proj = await prisma.project.create({
            data: { code, name, client, place, number, companyId },
          });
        }

        ensureDir(fsFound.folder);
        writeProjectJson(fsFound.folder, proj);
      }
    }

    if (!proj) return res.status(404).json({ ok: false, error: "Projekt nicht gefunden" });

    const fsKey = safeFsName(proj.code || "");
    if (fsKey) {
      const folderByCode = path.join(PROJECTS_ROOT, fsKey);
      ensureDir(folderByCode);
      writeProjectJson(folderByCode, proj);
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
router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const companyId = await ensureCompanyId(req);
    const id = String(req.params.id);

    const proj = await prisma.project.findFirst({
      where: { id, companyId },
      select: { id: true, code: true },
    });
    if (!proj) return res.status(404).json({ ok: false, error: "Projekt nicht gefunden" });

    await prisma.project.delete({ where: { id: proj.id } });

    const fsKey = safeFsName(proj.code || "");
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

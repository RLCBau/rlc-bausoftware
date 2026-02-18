// apps/server/src/routes/historie.ts
// @ts-nocheck

import { Router } from "express";
import fs from "fs";
import path from "path";

const router = Router();

const PROJECTS_ROOT =
  process.env.PROJECTS_ROOT || path.join(process.cwd(), "data", "projects");

const CANONICAL = "BA-2025-DEMO";

function existsDir(p: string) {
  try {
    return fs.existsSync(p) && fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}
function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
function readJson<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}
function writeJson(filePath: string, data: any) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}
function isUuidLike(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function projectDir(folder: string) {
  const dir = path.join(PROJECTS_ROOT, folder);
  ensureDir(dir);
  return dir;
}

function currentSollIstPath(folder: string) {
  return path.join(projectDir(folder), "soll-ist.json");
}
function historyPath(folder: string) {
  return path.join(projectDir(folder), "soll-ist-history.json");
}

function resolveProjectFolder(projectIdRaw: string): string {
  const projectId = String(projectIdRaw || "").trim();
  if (!projectId) return projectId;

  // 1) se la cartella canonica esiste, usala sempre
  const canonicalDir = path.join(PROJECTS_ROOT, CANONICAL);
  if (existsDir(canonicalDir)) return CANONICAL;

  // 2) se non è UUID e la dir esiste, usala
  const direct = path.join(PROJECTS_ROOT, projectId);
  if (!isUuidLike(projectId) && existsDir(direct)) return projectId;

  // 3) se UUID: prova a mappare solo su cartelle già esistenti
  if (isUuidLike(projectId)) {
    const uuidDir = path.join(PROJECTS_ROOT, projectId);
    const pj = path.join(uuidDir, "project.json");
    if (fs.existsSync(pj)) {
      const meta: any = readJson(pj, {});
      const candidates = [
        String(meta?.slug || "").trim(),
        String(meta?.name || "").trim(),
        String(meta?.projectId || "").trim(),
        String(meta?.id || "").trim(),
      ].filter(Boolean);

      for (const c of candidates) {
        const d = path.join(PROJECTS_ROOT, c);
        if (existsDir(d)) return c;
      }
    }
    if (existsDir(uuidDir)) return projectId;
  }

  return projectId;
}

/* ========================= ROUTES ========================= */

router.get("/historie", (req, res) => {
  const projectId = String(req.query.projectId || "").trim();
  if (!projectId) return res.status(400).json({ ok: false, error: "projectId fehlt" });

  const folder = resolveProjectFolder(projectId);
  const items = readJson<any[]>(historyPath(folder), []);
  return res.json({ ok: true, items, resolvedProjectId: folder });
});

router.get("/historie/current", (req, res) => {
  const projectId = String(req.query.projectId || "").trim();
  if (!projectId) return res.status(400).json({ ok: false, error: "projectId fehlt" });

  const folder = resolveProjectFolder(projectId);

  const dir = projectDir(folder);
  const legacy = path.join(dir, "sollist.json");
  const canonical = path.join(dir, "soll-ist.json");

  const rows = fs.existsSync(canonical)
    ? readJson<any[]>(canonical, [])
    : fs.existsSync(legacy)
      ? readJson<any[]>(legacy, [])
      : [];

  return res.json({ ok: true, rows, resolvedProjectId: folder });
});

// (opzionale) salva current direttamente
router.post("/historie/current", (req, res) => {
  const projectId = String(req.query.projectId || "").trim();
  if (!projectId) return res.status(400).json({ ok: false, error: "projectId fehlt" });

  const folder = resolveProjectFolder(projectId);
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];

  writeJson(currentSollIstPath(folder), rows);
  return res.json({ ok: true, resolvedProjectId: folder });
});

router.post("/historie", (req, res) => {
  const v = req.body || {};
  const projectId = String(v.projectId || "").trim();
  if (!projectId) return res.status(400).json({ ok: false, error: "projectId fehlt" });

  const folder = resolveProjectFolder(projectId);

  const file = historyPath(folder);
  const items = readJson<any[]>(file, []);

  const next = [v, ...items.filter((x) => x?.id !== v?.id)].slice(0, 200);
  writeJson(file, next);

  return res.json({ ok: true, resolvedProjectId: folder });
});

router.post("/historie/restore", (req, res) => {
  const v = req.body || {};
  const projectId = String(v.projectId || "").trim();
  if (!projectId) return res.status(400).json({ ok: false, error: "projectId fehlt" });

  const folder = resolveProjectFolder(projectId);
  const data = Array.isArray(v.data) ? v.data : [];

  writeJson(currentSollIstPath(folder), data);

  return res.json({ ok: true, resolvedProjectId: folder });
});

// ✅ DELETE singola versione
router.delete("/historie/:id", (req, res) => {
  const projectId = String(req.query.projectId || "").trim();
  const id = String(req.params.id || "").trim();
  if (!projectId) return res.status(400).json({ ok: false, error: "projectId fehlt" });
  if (!id) return res.status(400).json({ ok: false, error: "id fehlt" });

  const folder = resolveProjectFolder(projectId);
  const file = historyPath(folder);
  const items = readJson<any[]>(file, []);

  const next = items.filter((x) => String(x?.id || "") !== id);
  writeJson(file, next);

  return res.json({ ok: true, resolvedProjectId: folder });
});

export default router;

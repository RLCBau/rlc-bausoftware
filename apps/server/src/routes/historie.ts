// apps/server/src/routes/historie.ts
// @ts-nocheck

import { Router } from "express";
import fs from "fs";
import path from "path";
import { requireProjectMember } from "../middleware/guards";
import { prisma } from "../lib/prisma";

const router = Router();

const requireHistorieProjectAccess = async (req:any,res:any,next:any) => {
  const token=String(req.query?.projectId||req.body?.projectId||"").trim();
  if(!token) return res.status(400).json({ok:false,error:"projectId fehlt"});
  req.params=req.params||{};
  req.params.__historieProject=token;
  return requireProjectMember("__historieProject")(req,res,async (err?:any)=>{
    if(err) return next(err);
    const projectId=String(req.resolvedProjectId||token).trim();
    const projectCode=String(req.resolvedProjectCode||"").trim();
    if(!projectId) return res.status(403).json({ok:false,error:"PROJECT_RESOLUTION_FAILED"});
    if(projectCode && projectCode!==projectId){
      try{
        const duplicates=await prisma.project.count({where:{code:projectCode}});
        if(duplicates===1){
          const legacyRoot=path.join(PROJECTS_ROOT,projectCode);
          const canonicalRoot=path.join(PROJECTS_ROOT,projectId);
          for(const name of ["soll-ist.json","sollist.json","soll-ist-history.json"]){
            const src=path.join(legacyRoot,name), dst=path.join(canonicalRoot,name);
            if(fs.existsSync(src)&&!fs.existsSync(dst)){fs.mkdirSync(canonicalRoot,{recursive:true});fs.copyFileSync(src,dst);}
          }
        }
      }catch(e){console.error("[historie] legacy tenant migration failed",e);}
    }
    if(req.body && typeof req.body==="object") req.body.projectId=projectId;
    try{if(req.query && typeof req.query==="object") req.query.projectId=projectId;}catch{}
    req.resolvedProjectId=projectId;
    return next();
  });
};

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

  // Never force a global/demo project folder. The caller is tenant/project authorized.

  // If it is not a UUID and the directory exists, use it
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

router.get("/historie", requireHistorieProjectAccess, (req, res) => {
  const projectId = String(req.query.projectId || "").trim();
  if (!projectId) return res.status(400).json({ ok: false, error: "projectId fehlt" });

  const folder = String((req as any).resolvedProjectId || projectId);
  const items = readJson<any[]>(historyPath(folder), []);
  return res.json({ ok: true, items, resolvedProjectId: folder });
});

router.get("/historie/current", requireHistorieProjectAccess, (req, res) => {
  const projectId = String(req.query.projectId || "").trim();
  if (!projectId) return res.status(400).json({ ok: false, error: "projectId fehlt" });

  const folder = String((req as any).resolvedProjectId || projectId);

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
router.post("/historie/current", requireHistorieProjectAccess, (req, res) => {
  const projectId = String(req.query.projectId || "").trim();
  if (!projectId) return res.status(400).json({ ok: false, error: "projectId fehlt" });

  const folder = String((req as any).resolvedProjectId || projectId);
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];

  writeJson(currentSollIstPath(folder), rows);
  return res.json({ ok: true, resolvedProjectId: folder });
});

router.post("/historie", requireHistorieProjectAccess, (req, res) => {
  const v = req.body || {};
  const projectId = String(v.projectId || "").trim();
  if (!projectId) return res.status(400).json({ ok: false, error: "projectId fehlt" });

  const folder = String((req as any).resolvedProjectId || projectId);

  const file = historyPath(folder);
  const items = readJson<any[]>(file, []);

  const next = [v, ...items.filter((x) => x?.id !== v?.id)].slice(0, 200);
  writeJson(file, next);

  return res.json({ ok: true, resolvedProjectId: folder });
});

router.post("/historie/restore", requireHistorieProjectAccess, (req, res) => {
  const v = req.body || {};
  const projectId = String(v.projectId || "").trim();
  if (!projectId) return res.status(400).json({ ok: false, error: "projectId fehlt" });

  const folder = String((req as any).resolvedProjectId || projectId);
  const data = Array.isArray(v.data) ? v.data : [];

  writeJson(currentSollIstPath(folder), data);

  return res.json({ ok: true, resolvedProjectId: folder });
});

// ✅ DELETE singola versione
router.delete("/historie/:id", requireHistorieProjectAccess, (req, res) => {
  const projectId = String(req.query.projectId || "").trim();
  const id = String(req.params.id || "").trim();
  if (!projectId) return res.status(400).json({ ok: false, error: "projectId fehlt" });
  if (!id) return res.status(400).json({ ok: false, error: "id fehlt" });

  const folder = String((req as any).resolvedProjectId || projectId);
  const file = historyPath(folder);
  const items = readJson<any[]>(file, []);

  const next = items.filter((x) => String(x?.id || "") !== id);
  writeJson(file, next);

  return res.json({ ok: true, resolvedProjectId: folder });
});

export default router;

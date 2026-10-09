import { Router } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { PROJECTS_ROOT } from "../lib/projectsRoot";
import { archiveProjectFileVersion } from "../services/dmsArchive";
import { requireProjectMember } from "../middleware/guards";
import { prisma } from "../lib/prisma";

const router = Router();

router.use("/:moduleName/:projectKey", requireProjectMember("projectKey"), async (req:any, _res, next) => {
  const projectId=String(req.resolvedProjectId||"").trim();
  const projectCode=String(req.resolvedProjectCode||"").trim();
  const moduleName=String(req.params.moduleName||"").trim();
  if(!projectId) return next(new Error("RESOLVED_PROJECT_ID_MISSING"));
  if(projectCode && projectCode!==projectId && ALLOWED_MODULES.has(moduleName)){
    try{
      const duplicates=await prisma.project.count({where:{code:projectCode}});
      if(duplicates===1){
        const src=path.join(PROJECTS_ROOT,projectCode,"kalkulation",moduleName);
        const dst=path.join(PROJECTS_ROOT,projectId,"kalkulation",moduleName);
        if(fs.existsSync(src)&&!fs.existsSync(dst)){fs.mkdirSync(path.dirname(dst),{recursive:true});fs.cpSync(src,dst,{recursive:true});}
      }
    }catch(e){console.error("[kalkulation:storage] legacy tenant migration failed",e);}
  }
  req.params.projectKey=projectId;
  next();
});

const ALLOWED_MODULES = new Set([
  "urkalkulation",
  "versionsvergleich",
  "angebotsanalyse",
  "angebotsverfolgung",

  // RLC-KI Kalkulation Snapshot für Web + Mobile
  "ki",
  "kalkulation-mit-ki",
  "kalkulationMitKi",

  // X84 Learning Approval
  "learning",
]);

function isSafeKey(v: string) {
  return /^[A-Za-z0-9_\-]+$/.test(v || "");
}

function nowIso() {
  return new Date().toISOString();
}

function rid() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function getDir(projectKey: string, moduleName: string) {
  return path.join(PROJECTS_ROOT, projectKey, "kalkulation", moduleName);
}

function getFile(projectKey: string, moduleName: string) {
  return path.join(getDir(projectKey, moduleName), "data.json");
}

function ensureDir(projectKey: string, moduleName: string) {
  const dir = getDir(projectKey, moduleName);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readDoc(projectKey: string, moduleName: string): any {
  try {
    const file = getFile(projectKey, moduleName);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

function writeDoc(projectKey: string, moduleName: string, body: any) {
  ensureDir(projectKey, moduleName);

  const doc = {
    id: String(body?.id || "").trim() || `${moduleName}-${projectKey}-${rid()}`,
    projectKey,
    moduleName,
    data: body?.data !== undefined ? body.data : body,
    updatedAt: nowIso(),
    createdAt: body?.createdAt || nowIso(),
  };

  const savedFile = getFile(projectKey, moduleName);
  fs.writeFileSync(savedFile, JSON.stringify(doc, null, 2), "utf-8");

  void archiveProjectFileVersion({
    projectIdOrCode: projectKey,
    filename: `Kalkulation-${moduleName}.json`,
    kind: "LV",
    localPath: savedFile,
    meta: {
      module: "KALKULATION",
      source: "kalkulation.storage",
      snapshotType: moduleName
    }
  }).catch((error) => {
    console.error("[kalkulation:storage:dms]", error);
  });

  return doc;
}

router.get("/:moduleName/:projectKey", (req, res) => {
  const { moduleName, projectKey } = req.params;

  if (!ALLOWED_MODULES.has(moduleName)) {
    return res.status(400).json({ ok: false, error: "invalid moduleName", moduleName });
  }

  if (!isSafeKey(projectKey)) {
    return res.status(400).json({ ok: false, error: "invalid projectKey" });
  }

  const doc = readDoc(projectKey, moduleName);

  return res.json({
    ok: true,
    exists: !!doc,
    projectKey,
    moduleName,
    data: doc?.data ?? null,
    snapshot: doc ?? null,
    updatedAt: doc?.updatedAt || null,
  });
});

router.post("/:moduleName/:projectKey/save", (req, res) => {
  try {
    const { moduleName, projectKey } = req.params;

    if (!ALLOWED_MODULES.has(moduleName)) {
      return res.status(400).json({ ok: false, error: "invalid moduleName", moduleName });
    }

    if (!isSafeKey(projectKey)) {
      return res.status(400).json({ ok: false, error: "invalid projectKey" });
    }

    const doc = writeDoc(projectKey, moduleName, req.body || {});

    return res.json({
      ok: true,
      saved: true,
      projectKey,
      moduleName,
      data: doc.data,
      snapshot: doc,
    });
  } catch (e: any) {
    console.error("[kalkulation:storage:save]", e?.message || e);
    return res.status(500).json({ ok: false, error: "save failed" });
  }
});

router.delete("/:moduleName/:projectKey", (req, res) => {
  try {
    const { moduleName, projectKey } = req.params;

    if (!ALLOWED_MODULES.has(moduleName)) {
      return res.status(400).json({ ok: false, error: "invalid moduleName", moduleName });
    }

    if (!isSafeKey(projectKey)) {
      return res.status(400).json({ ok: false, error: "invalid projectKey" });
    }

    const file = getFile(projectKey, moduleName);
    if (fs.existsSync(file)) fs.unlinkSync(file);

    return res.json({ ok: true, deleted: true, projectKey, moduleName });
  } catch (e: any) {
    console.error("[kalkulation:storage:delete]", e?.message || e);
    return res.status(500).json({ ok: false, error: "delete failed" });
  }
});

export default router;

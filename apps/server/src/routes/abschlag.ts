// apps/server/src/routes/abschlag.ts
// @ts-nocheck

import { Router } from "express";
import path from "path";
import fs from "fs";
import { requireProjectMember } from "../middleware/guards";
import { prisma } from "../lib/prisma";

const router = Router();

const requireAbschlagAccess = async (req:any,res:any,next:any) => {
  req.params = req.params || {};
  const originalToken = String(req.params.projectKey || "").trim();
  return requireProjectMember("projectKey")(req,res,async (err?:any)=>{
    if(err) return next(err);
    const projectId = String(req.resolvedProjectId || "").trim();
    const projectCode = String(req.resolvedProjectCode || "").trim();
    if (!projectId) return res.status(403).json({ ok:false, error:"PROJECT_RESOLUTION_FAILED" });

    if (projectCode && projectCode !== projectId) {
      try {
        const duplicates = await prisma.project.count({ where: { code: projectCode } });
        if (duplicates === 1) {
          const legacyFile = path.join(PROJECTS_ROOT, projectCode, "abschlaege.json");
          const canonicalFile = path.join(PROJECTS_ROOT, projectId, "abschlaege.json");
          if (fs.existsSync(legacyFile) && !fs.existsSync(canonicalFile)) {
            fs.mkdirSync(path.dirname(canonicalFile), { recursive: true });
            fs.copyFileSync(legacyFile, canonicalFile);
          }
        }
      } catch (migrationError) {
        console.error("[abschlag] legacy tenant migration failed", migrationError);
      }
    }

    req.params.projectKey = projectId;
    return next();
  });
};

const PROJECTS_ROOT =
  process.env.PROJECTS_ROOT || path.join(process.cwd(), "data", "projects");

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function safeJsonParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}


function lockedStatus(value: any) {
  const status = String(value?.status || "").trim().toUpperCase();
  return status === "FREIGEGEBEN" || status === "GEBUCHT";
}

function canonical(value: any) {
  const copy = JSON.parse(JSON.stringify(value || {}));
  delete copy.updatedAt;
  return JSON.stringify(copy);
}

function filePath(projectKey: string) {
  const root = path.join(PROJECTS_ROOT, projectKey);
  ensureDir(root);
  return path.join(root, "abschlaege.json");
}

/**
 * GET /api/abschlag/list/:projectKey
 * -> legge data/projects/<projectKey>/abschlaege.json
 */
router.get("/abschlag/list/:projectKey", requireAbschlagAccess, (req, res) => {
  try {
    const projectKey = String(req.params.projectKey || "").trim();
    if (!projectKey) return res.status(400).json({ ok: false, error: "projectKey missing" });

    const fp = filePath(projectKey);
    if (!fs.existsSync(fp)) {
      return res.json({ ok: true, items: [], file: fp });
    }

    const raw = fs.readFileSync(fp, "utf-8");
    const items = safeJsonParse(raw, []);
    return res.json({ ok: true, items: Array.isArray(items) ? items : [], file: fp });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
});

/**
 * POST /api/abschlag/save/:projectKey
 * body: { items: [...] }
 */
router.post("/abschlag/save/:projectKey", requireAbschlagAccess, (req, res) => {
  try {
    const projectKey = String(req.params.projectKey || "").trim();
    if (!projectKey) return res.status(400).json({ ok: false, error: "projectKey missing" });

    const items = req.body?.items;
    if (!Array.isArray(items)) {
      return res.status(400).json({ ok: false, error: "items must be array" });
    }

    const fp = filePath(projectKey);
    const existing = fs.existsSync(fp) ? safeJsonParse(fs.readFileSync(fp, "utf-8"), []) : [];
    const incomingById = new Map(items.map((item: any) => [String(item?.id || ""), item]));

    for (const oldItem of Array.isArray(existing) ? existing : []) {
      if (!lockedStatus(oldItem)) continue;
      const incoming = incomingById.get(String(oldItem?.id || ""));
      if (!incoming) {
        return res.status(409).json({ ok: false, error: "ABSCHLAGSRECHNUNG_LOCKED", message: "Freigegebene/gebuchte Abschlagsrechnungen dürfen nicht gelöscht werden." });
      }
      if (canonical(oldItem) !== canonical(incoming)) {
        return res.status(409).json({ ok: false, error: "ABSCHLAGSRECHNUNG_LOCKED", message: "Freigegebene/gebuchte Abschlagsrechnungen dürfen nicht verändert werden. Verwenden Sie Korrektur/Storno." });
      }
    }

    fs.writeFileSync(fp, JSON.stringify(items, null, 2), "utf-8");

    return res.json({ ok: true, saved: items.length, file: fp });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
});

export default router;

import { Router } from "express";
import fs from "fs";
import path from "path";
import { PROJECTS_ROOT } from "../lib/projectsRoot";
import { requireProjectMember } from "../middleware/guards";
import { prisma } from "../lib/prisma";

const router = Router();

router.use("/:projectKey", requireProjectMember("projectKey"), async (req:any, _res, next) => {
  const projectId=String(req.resolvedProjectId||"").trim();
  const projectCode=String(req.resolvedProjectCode||"").trim();
  if(!projectId) return next(new Error("RESOLVED_PROJECT_ID_MISSING"));
  if(projectCode && projectCode!==projectId){
    try{
      const duplicates=await prisma.project.count({where:{code:projectCode}});
      if(duplicates===1){
        const src=path.join(PROJECTS_ROOT,projectCode,"kalkulation","mengen");
        const dst=path.join(PROJECTS_ROOT,projectId,"kalkulation","mengen");
        if(fs.existsSync(src)&&!fs.existsSync(dst)){fs.mkdirSync(path.dirname(dst),{recursive:true});fs.cpSync(src,dst,{recursive:true});}
      }
    }catch(e){console.error("[mengen] legacy tenant migration failed",e);}
  }
  req.params.projectKey=projectId;
  next();
});

/* =========================
   UTILS
========================= */

function isSafeKey(v: string) {
  return /^[A-Za-z0-9_\-]+$/.test(v || "");
}

function getDir(projectKey: string) {
  return path.join(PROJECTS_ROOT, projectKey, "kalkulation", "mengen");
}

function getFile(projectKey: string) {
  return path.join(getDir(projectKey), "mengen.json");
}

function ensureDir(projectKey: string) {
  const dir = getDir(projectKey);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readList(projectKey: string) {
  try {
    const file = getFile(projectKey);
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return [];
  }
}

function writeList(projectKey: string, list: any[]) {
  const dir = ensureDir(projectKey);
  const file = getFile(projectKey);
  fs.writeFileSync(file, JSON.stringify(list, null, 2));
}

/* =========================
   ROUTES
========================= */

/* GET: tutte le Mengen */
router.get("/:projectKey", (req, res) => {
  const { projectKey } = req.params;

  if (!isSafeKey(projectKey)) {
    return res.status(400).json({ error: "invalid projectKey" });
  }

  const list = readList(projectKey);
  res.json(list);
});

/* POST: salva */
router.post("/:projectKey/save", (req, res) => {
  try {
    const { projectKey } = req.params;
    const doc = req.body;

    if (!isSafeKey(projectKey)) {
      return res.status(400).json({ error: "invalid projectKey" });
    }

    if (!doc || !doc.id) {
      return res.status(400).json({ error: "missing doc.id" });
    }

    const list = readList(projectKey);

    const idx = list.findIndex((x: any) => x.id === doc.id);

    if (idx >= 0) {
      list[idx] = doc;
    } else {
      list.unshift(doc);
    }

    writeList(projectKey, list);

    res.json({
      ok: true,
      id: doc.id,
      count: list.length,
    });
  } catch (e) {
    console.error("mengen save error", e);
    res.status(500).json({ error: "save failed" });
  }
});

/* DELETE */
router.delete("/:projectKey/:id", (req, res) => {
  try {
    const { projectKey, id } = req.params;

    if (!isSafeKey(projectKey)) {
      return res.status(400).json({ error: "invalid projectKey" });
    }

    const list = readList(projectKey);

    const next = list.filter((x: any) => String(x.id) !== String(id));

    writeList(projectKey, next);

    res.json({ ok: true });
  } catch (e) {
    console.error("mengen delete error", e);
    res.status(500).json({ error: "delete failed" });
  }
});

export default router;

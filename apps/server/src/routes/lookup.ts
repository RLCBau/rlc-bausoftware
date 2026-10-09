import { Router } from "express";
import fs from "fs";
import path from "path";
import { requireProjectMember } from "../middleware/guards";
import { prisma } from "../lib/prisma";

const router = Router();

const requireLookupProjectAccess = async (req: any, res: any, next: any) => {
  const token = String(req.query?.projectId || "").trim();
  if (!token) return res.status(400).json({ error: "projectId fehlt" });
  req.params = req.params || {};
  req.params.__lookupProject = token;
  return requireProjectMember("__lookupProject")(req, res, async (err?: any) => {
    if (err) return next(err);
    const projectId=String(req.resolvedProjectId||"").trim();
    const projectCode=String(req.resolvedProjectCode||"").trim();
    if(!projectId) return res.status(403).json({error:"PROJECT_RESOLUTION_FAILED"});
    if(projectCode && projectCode!==projectId){
      try{
        const duplicates=await prisma.project.count({where:{code:projectCode}});
        if(duplicates===1){
          const uploadsRoot=path.join(process.cwd(),"uploads");
          for(const part of ["lv","regie"]){
            const src=path.join(uploadsRoot,projectCode,part), dst=path.join(uploadsRoot,projectId,part);
            if(fs.existsSync(src)&&!fs.existsSync(dst)){fs.mkdirSync(path.dirname(dst),{recursive:true});fs.cpSync(src,dst,{recursive:true});}
          }
        }
      }catch(e){console.error("[lookup] legacy tenant migration failed",e);}
    }
    req.query.projectId=projectId;
    return next();
  });
};

router.get("/lv", requireLookupProjectAccess, async (req, res) => {
  try {
    const projectId = String(req.query.projectId || "");
    const q = String(req.query.q || "").toLowerCase();
    const p = path.join(process.cwd(), "uploads", projectId, "lv", "positions.json");
    let rows: any[] = [];
    if (fs.existsSync(p)) rows = JSON.parse(fs.readFileSync(p, "utf8"));
    const out = rows
      .filter(r => !q || (r.id?.toLowerCase().includes(q) || r.kurz?.toLowerCase().includes(q)))
      .slice(0, 200)
      .map(r => ({ id: r.id, label: `${r.id} — ${r.kurz || ""}`.trim() }));
    res.json({ items: out });
  } catch (e:any) { res.status(500).send("LV-Lookup fehlgeschlagen"); }
});

router.get("/regieberichte", requireLookupProjectAccess, async (req, res) => {
  try {
    const projectId = String(req.query.projectId || "");
    const q = String(req.query.q || "").toLowerCase();
    const p = path.join(process.cwd(), "uploads", projectId, "regie", "regieberichte.json");
    let rows: any[] = [];
    if (fs.existsSync(p)) rows = JSON.parse(fs.readFileSync(p, "utf8"));
    const out = rows
      .filter(r => !q || (`${r.id} ${r.datum} ${r.titel||""}`.toLowerCase().includes(q)))
      .slice(0, 200)
      .map(r => ({ id: r.id, label: `${r.id} — ${r.datum || ""} ${r.titel ? "— " + r.titel : ""}`.trim() }));
    res.json({ items: out });
  } catch (e:any) { res.status(500).send("Regiebericht-Lookup fehlgeschlagen"); }
});

export default router;

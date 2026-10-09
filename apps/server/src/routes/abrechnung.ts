import { Router } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { COMPANIES_ROOT } from "../lib/companiesRoot";
import { archiveProjectBufferVersion } from "../services/dmsArchive";
import { requireProjectMember } from "../middleware/guards";

const router = Router();

function abrechnungRole(req:any){
  return String(req?.auth?.companyRole||req?.auth?.role||"").trim().toUpperCase();
}
function allowAbrechnungDraft(req:any,res:any,next:any){
  if(!["ADMIN","ADMINISTRATOR","BUCHHALTUNG","BAULEITER"].includes(abrechnungRole(req))){
    return res.status(403).json({ok:false,error:"ABRECHNUNG_WRITE_FORBIDDEN"});
  }
  return next();
}
function allowAbrechnungFinalize(req:any,res:any,next:any){
  if(!["ADMIN","ADMINISTRATOR","BUCHHALTUNG"].includes(abrechnungRole(req))){
    return res.status(403).json({ok:false,error:"ABRECHNUNG_FINALIZE_FORBIDDEN"});
  }
  return next();
}

const requireAbrechnungProjectAccess = async (req:any,res:any,next:any) => {
  const token=String(req.params?.projectId||req.body?.projectId||req.query?.projectId||"").trim();
  if(!token) return res.status(400).json({ok:false,error:"PROJECT_REQUIRED"});
  req.params=req.params||{};
  req.params.__abrechnungProject=token;
  return requireProjectMember("__abrechnungProject")(req,res,next);
};

type Abschlag = {
  id: string;
  projectId: string;
  nr: number;
  datum: string;
  betrag: number;
  createdAt: number;
  status: "DRAFT" | "FREIGEGEBEN";
  evidenceLock?: { hash: string; lockedAt: string; lockedBy: string | null; reason: string } | null;
};

function cid(req:any){ return String(req?.auth?.companyId || "").trim(); }
function safe(v:any){ return String(v||"").replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,160); }
function root(companyId:string){ const d=path.join(COMPANIES_ROOT,companyId,"abrechnung"); fs.mkdirSync(d,{recursive:true}); return d; }
function file(companyId:string,projectId:string){ return path.join(root(companyId),`${safe(projectId)}.json`); }
function read(companyId:string,projectId:string):Abschlag[]{ try{const f=file(companyId,projectId);if(!fs.existsSync(f))return [];const v=JSON.parse(fs.readFileSync(f,"utf8"));return Array.isArray(v)?v:[];}catch{return [];} }
function write(companyId:string,projectId:string,items:Abschlag[]){ const f=file(companyId,projectId);const t=`${f}.tmp-${process.pid}-${Date.now()}`;fs.writeFileSync(t,JSON.stringify(items,null,2),"utf8");fs.renameSync(t,f); }
function canonical(v:any){ const c=JSON.parse(JSON.stringify(v||{}));delete c.evidenceLock;return JSON.stringify(c); }
async function projectForCompany(companyId:string,token:string){
  return prisma.project.findFirst({where:{companyId,OR:[{id:token},{code:token}]},select:{id:true,code:true,name:true}});
}

router.post("/save", allowAbrechnungDraft, requireAbrechnungProjectAccess, async (req:any,res)=>{
  try{
    const companyId=cid(req); if(!companyId)return res.status(403).json({ok:false,error:"COMPANY_REQUIRED"});
    const token=String(req.body?.projectId||"").trim(); const betrag=Number(req.body?.betrag||0);
    if(!token||!(betrag>0))return res.status(400).json({ok:false,error:"PROJECT_AND_AMOUNT_REQUIRED"});
    const project=await projectForCompany(companyId,token); if(!project)return res.status(404).json({ok:false,error:"PROJECT_NOT_FOUND"});
    const items=read(companyId,project.id);
    const item:Abschlag={id:crypto.randomUUID(),projectId:project.id,nr:(items.reduce((m,x)=>Math.max(m,Number(x.nr||0)),0)+1),datum:new Date().toISOString().slice(0,10),betrag,createdAt:Date.now(),status:"DRAFT",evidenceLock:null};
    items.push(item); write(companyId,project.id,items);
    return res.json({ok:true,item,count:items.length});
  }catch(e:any){return res.status(500).json({ok:false,error:e?.message||"ABRECHNUNG_SAVE_FAILED"});}
});

router.get("/by-project/:projectId", requireAbrechnungProjectAccess, async (req:any,res)=>{
  try{
    const companyId=cid(req); if(!companyId)return res.status(403).json({ok:false,error:"COMPANY_REQUIRED"});
    const project=await projectForCompany(companyId,String(req.params.projectId||"")); if(!project)return res.status(404).json({ok:false,error:"PROJECT_NOT_FOUND"});
    return res.json({ok:true,projectId:project.id,items:read(companyId,project.id)});
  }catch(e:any){return res.status(500).json({ok:false,error:e?.message||"ABRECHNUNG_LOAD_FAILED"});}
});

router.post("/:id/finalize", allowAbrechnungFinalize, requireAbrechnungProjectAccess, async (req:any,res)=>{
  try{
    const companyId=cid(req); if(!companyId)return res.status(403).json({ok:false,error:"COMPANY_REQUIRED"});
    const token=String(req.body?.projectId||"").trim(); if(!token)return res.status(400).json({ok:false,error:"PROJECT_REQUIRED"});
    const project=await projectForCompany(companyId,token); if(!project)return res.status(404).json({ok:false,error:"PROJECT_NOT_FOUND"});
    const items=read(companyId,project.id); const idx=items.findIndex(x=>x.id===String(req.params.id||""));
    if(idx<0)return res.status(404).json({ok:false,error:"NOT_FOUND"});
    if(items[idx].evidenceLock)return res.status(409).json({ok:false,error:"ABRECHNUNG_LOCKED",lock:items[idx].evidenceLock});
    const base={...items[idx],status:"FREIGEGEBEN" as const};
    const lock={hash:crypto.createHash("sha256").update(canonical(base),"utf8").digest("hex"),lockedAt:new Date().toISOString(),lockedBy:String(req?.auth?.email||req?.auth?.sub||"").trim()||null,reason:"Abschlags-/Abrechnungsstand freigegeben – unveränderlich"};
    const finalized={...base,evidenceLock:lock};
    await archiveProjectBufferVersion({
      projectIdOrCode:project.id,
      filename:`Abrechnungsstand_${finalized.nr}_${finalized.id}.json`,
      kind:"DOC",
      buffer:Buffer.from(JSON.stringify(finalized,null,2),"utf8"),
      uploadedBy:lock.lockedBy,
      meta:{source:"abrechnung-final",evidenceLocked:true,evidenceHash:lock.hash,recordId:finalized.id}
    });
    items[idx]=finalized;
    write(companyId,project.id,items);
    return res.json({ok:true,item:items[idx]});
  }catch(e:any){return res.status(500).json({ok:false,error:e?.message||"ABRECHNUNG_FINALIZE_FAILED"});}
});

router.delete("/:id", allowAbrechnungDraft, requireAbrechnungProjectAccess, async (req:any,res)=>{
  try{
    const companyId=cid(req); if(!companyId)return res.status(403).json({ok:false,error:"COMPANY_REQUIRED"});
    const token=String(req.query?.projectId||req.body?.projectId||"").trim();
    if(!token)return res.status(400).json({ok:false,error:"PROJECT_REQUIRED"});
    const project=await projectForCompany(companyId,token); if(!project)return res.status(404).json({ok:false,error:"PROJECT_NOT_FOUND"});
    const items=read(companyId,project.id); const idx=items.findIndex(x=>x.id===String(req.params.id||""));
    if(idx<0)return res.status(404).json({ok:false,error:"NOT_FOUND"});
    if(items[idx].status!=="DRAFT"||items[idx].evidenceLock)return res.status(409).json({ok:false,error:"ABRECHNUNG_LOCKED",message:"Freigegebene Abrechnungsstände dürfen nicht gelöscht werden."});
    items.splice(idx,1); write(companyId,project.id,items); return res.json({ok:true});
  }catch(e:any){return res.status(500).json({ok:false,error:e?.message||"ABRECHNUNG_DELETE_FAILED"});}
});

export default router;

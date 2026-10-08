import { Router } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { COMPANIES_ROOT } from "../lib/companiesRoot";
import { requirePermission } from "../middleware/rbac";

const r = Router();

function cid(req:any){ return String(req?.auth?.companyId || "").trim(); }
function root(companyId:string){ const d=path.join(COMPANIES_ROOT,companyId,"privacy-compliance"); fs.mkdirSync(d,{recursive:true,mode:0o700}); return d; }
function file(companyId:string){ return path.join(root(companyId),"data-subject-requests.json"); }
function read(companyId:string):any[]{ try{const f=file(companyId);if(!fs.existsSync(f))return [];const v=JSON.parse(fs.readFileSync(f,"utf8"));return Array.isArray(v)?v:[];}catch{return [];} }
function write(companyId:string,rows:any[]){ const f=file(companyId);const t=`${f}.tmp-${process.pid}-${Date.now()}`;fs.writeFileSync(t,JSON.stringify(rows,null,2),{encoding:"utf8",mode:0o600});fs.renameSync(t,f);fs.chmodSync(f,0o600); }
function addMonths(value:any,months:number){ const d=new Date(value||Date.now());if(Number.isNaN(d.getTime()))return null;d.setMonth(d.getMonth()+months);return d.toISOString(); }
function canonical(v:any){ const c=JSON.parse(JSON.stringify(v||{}));delete c.updatedAt;delete c.compliance;return JSON.stringify(c); }

function compliance(v:any){
  const errors:string[]=[]; const warnings:string[]=[];
  if(!String(v?.subjectName||"").trim()) errors.push("Betroffene Person fehlt.");
  if(!String(v?.requestType||"").trim()) errors.push("Art des Betroffenenrechts fehlt.");
  if(!v?.receivedAt) errors.push("Eingangsdatum fehlt.");
  if(!String(v?.contact||"").trim()) warnings.push("Kontaktweg der betroffenen Person ist nicht dokumentiert.");
  if(String(v?.status||"").toUpperCase()==="COMPLETED" && !v?.identityVerifiedAt) errors.push("Identitätsprüfung ist vor Abschluss nicht dokumentiert.");
  if(String(v?.status||"").toUpperCase()==="COMPLETED" && !v?.completedAt) errors.push("Abschlussdatum fehlt.");
  if(String(v?.status||"").toUpperCase()==="REJECTED" && !String(v?.rejectionReason||"").trim()) errors.push("Ablehnungsgrund fehlt.");
  if(v?.extended===true && !String(v?.extensionReason||"").trim()) errors.push("Begründung der Fristverlängerung fehlt.");
  if(v?.extended===true && !v?.extensionNotifiedAt) errors.push("Mitteilung der Fristverlängerung ist nicht dokumentiert.");
  const deadline=v?.extended===true ? addMonths(v?.receivedAt,3) : addMonths(v?.receivedAt,1);
  if(deadline && Date.parse(deadline)<Date.now() && !["COMPLETED","REJECTED","WITHDRAWN"].includes(String(v?.status||"").toUpperCase())) warnings.push("Bearbeitungsfrist ist überschritten.");
  return {valid:errors.length===0,errors,warnings,deadline};
}


/** Data subject self-service. Requests are logged, never delete accounting records automatically. */
r.post("/self-service", async (req:any,res) => {
  const companyId=cid(req);
  const userId=String(req?.auth?.sub||"").trim();
  if (!companyId || !userId) return res.status(403).json({ok:false,error:"AUTH_COMPANY_REQUIRED"});
  const requestType=String(req.body?.requestType||"").trim().toUpperCase();
  if (!["ACCESS","ERASURE","RECTIFICATION","PORTABILITY","RESTRICTION","OBJECTION"].includes(requestType))
    return res.status(400).json({ok:false,error:"REQUEST_TYPE_INVALID"});
  const user=await prisma.user.findUnique({where:{id:userId},select:{id:true,email:true,name:true,companyId:true}});
  if (!user?.email || String(user.companyId || "") !== companyId) return res.status(403).json({ok:false,error:"USER_COMPANY_MISMATCH"});
  const rows=read(companyId);
  const alreadyOpen=rows.some(x=>x.subjectUserId===userId && x.requestType===requestType &&
    ["OPEN","IN_PROGRESS","PENDING"].includes(String(x.status||"").toUpperCase()));
  if (alreadyOpen) return res.status(409).json({ok:false,error:"REQUEST_ALREADY_OPEN"});
  const now=new Date().toISOString();
  const item={
    id:crypto.randomUUID(), requestType, subjectUserId:userId, subjectName:user.name||user.email,
    contact:user.email, description:String(req.body?.description||"").slice(0,1000),
    receivedAt:now, identityVerifiedAt:null, status:"OPEN", extended:false,
    extensionReason:"", extensionNotifiedAt:null, legalHold:false, legalHoldReason:"",
    rejectionReason:"", responseReference:"", completedAt:null, notes:"",
    createdAt:now, updatedAt:now, evidenceLock:null, source:"MOBILE_SELF_SERVICE"
  };
  rows.unshift(item); write(companyId,rows);
  return res.status(201).json({ok:true,id:item.id,status:item.status,receivedAt:now});
});

r.get("/self-service", async (req:any,res) => {
  const companyId=cid(req);
  const userId=String(req?.auth?.sub||"").trim();
  if (!companyId || !userId) return res.status(403).json({ok:false,error:"AUTH_COMPANY_REQUIRED"});
  return res.json({ok:true,items:read(companyId).filter(x=>x.subjectUserId===userId)
    .map(x=>({id:x.id,requestType:x.requestType,status:x.status,receivedAt:x.receivedAt,completedAt:x.completedAt||null}))});
});

r.get("/", requirePermission("privacy:*"), async (req:any,res)=>{
  const companyId=cid(req); if(!companyId)return res.status(403).json({ok:false,error:"COMPANY_REQUIRED"});
  const items=read(companyId).map(x=>({...x,compliance:compliance(x)}));
  return res.json({ok:true,items});
});

r.get("/ai-audit", requirePermission("privacy:*"), async (req:any,res)=>{
  const companyId=cid(req); if(!companyId)return res.status(403).json({ok:false,error:"COMPANY_REQUIRED"});
  const f=path.join(root(companyId),"ai-processing-audit.json");
  let items:any[]=[]; try{if(fs.existsSync(f)){const v=JSON.parse(fs.readFileSync(f,"utf8"));if(Array.isArray(v))items=v;}}catch{}
  const latest=items.slice(-250).reverse();
  const summary=latest.reduce((a:any,x:any)=>{a.calls+=1;a.totalTokens+=Math.max(0,Number(x?.totalTokens||0));const key=`${String(x?.provider||"unknown")} / ${String(x?.model||"unknown")}`;a.byModel[key]=(a.byModel[key]||0)+1;return a;},{calls:0,totalTokens:0,byModel:{}});
  return res.json({ok:true,summary,items:latest});
});

r.post("/", requirePermission("privacy:*"), async (req:any,res)=>{
  const companyId=cid(req); if(!companyId)return res.status(403).json({ok:false,error:"COMPANY_REQUIRED"});
  const b=req.body||{}; const receivedAt=b.receivedAt||new Date().toISOString();
  const item={
    id:crypto.randomUUID(), requestType:String(b.requestType||"ACCESS").toUpperCase(), subjectName:String(b.subjectName||""),
    contact:String(b.contact||""), description:String(b.description||""), receivedAt, identityVerifiedAt:b.identityVerifiedAt||null,
    status:"OPEN", extended:false, extensionReason:"", extensionNotifiedAt:null, legalHold:Boolean(b.legalHold),
    legalHoldReason:String(b.legalHoldReason||""), rejectionReason:"", responseReference:"", completedAt:null, notes:String(b.notes||""),
    createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), evidenceLock:null
  };
  const rows=read(companyId); rows.unshift(item); write(companyId,rows);
  return res.json({ok:true,item,compliance:compliance(item)});
});

r.put("/:id", requirePermission("privacy:*"), async (req:any,res)=>{
  const companyId=cid(req); if(!companyId)return res.status(403).json({ok:false,error:"COMPANY_REQUIRED"});
  const rows=read(companyId); const idx=rows.findIndex(x=>String(x.id)===String(req.params.id)); if(idx<0)return res.status(404).json({ok:false,error:"NOT_FOUND"});
  if(rows[idx].evidenceLock)return res.status(409).json({ok:false,error:"PRIVACY_REQUEST_LOCKED",lock:rows[idx].evidenceLock});
  const next={...rows[idx],...req.body,id:rows[idx].id,updatedAt:new Date().toISOString()};
  if(next.extended!==true){next.extensionReason="";next.extensionNotifiedAt=null;}
  const check=compliance(next);
  const finalStatus=["COMPLETED","REJECTED","WITHDRAWN"].includes(String(next.status||"").toUpperCase());
  if(finalStatus){
    if(String(next.status||"").toUpperCase()==="COMPLETED" && !next.completedAt) next.completedAt=new Date().toISOString();
    const finalCheck=compliance(next); if(!finalCheck.valid)return res.status(422).json({ok:false,error:"PRIVACY_REQUEST_INCOMPLETE",compliance:finalCheck});
    next.evidenceLock={hash:crypto.createHash("sha256").update(canonical(next),"utf8").digest("hex"),lockedAt:new Date().toISOString(),lockedBy:String(req?.auth?.email||req?.auth?.sub||"").trim()||null,reason:"Betroffenenanfrage abgeschlossen"};
  }
  rows[idx]=next; write(companyId,rows); return res.json({ok:true,item:next,compliance:compliance(next)});
});

r.delete("/:id", requirePermission("privacy:*"), async (req:any,res)=>{
  const companyId=cid(req); if(!companyId)return res.status(403).json({ok:false,error:"COMPANY_REQUIRED"});
  const rows=read(companyId); const row=rows.find(x=>String(x.id)===String(req.params.id)); if(!row)return res.status(404).json({ok:false,error:"NOT_FOUND"});
  if(row.evidenceLock)return res.status(409).json({ok:false,error:"PRIVACY_REQUEST_LOCKED"});
  write(companyId,rows.filter(x=>String(x.id)!==String(req.params.id))); return res.json({ok:true});
});

export default r;

import { Router } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { COMPANIES_ROOT } from "../lib/companiesRoot";
import { requirePermission } from "../middleware/rbac";
import { appendErasureEvent, newErasureRecord, checkRestoredErasureState } from "../lib/erasureLedger";

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
  if(String(v?.status||"").toUpperCase()==="COMPLETED" && String(v?.requestType||"").toUpperCase()==="ERASURE" && !String(v?.responseReference||"").trim()) errors.push("Löschungsnachweis beziehungsweise begründete Aufbewahrungsentscheidung fehlt.");
  if(String(v?.status||"").toUpperCase()==="COMPLETED" && v?.legalHold && !String(v?.legalHoldReason||"").trim()) errors.push("Aufbewahrungsgrund fehlt.");
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
  const owner=await prisma.user.findUnique({where:{id:userId},select:{companyId:true}});
  if (String(owner?.companyId||"")!==companyId) return res.status(403).json({ok:false,error:"USER_COMPANY_MISMATCH"});
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

/** Conservative erasure assessment. Never execute destructive actions unless every
 * record category has been inventoried and retention has been independently cleared. */
r.get("/:id/erasure-assessment", requirePermission("privacy:*"), async (req:any,res)=>{
  const companyId=cid(req);
  if (!companyId) return res.status(403).json({ok:false,error:"COMPANY_REQUIRED"});
  const item=read(companyId).find(x=>String(x.id)===String(req.params.id));
  if (!item) return res.status(404).json({ok:false,error:"NOT_FOUND"});
  if (String(item.requestType).toUpperCase()!=="ERASURE") return res.status(400).json({ok:false,error:"NOT_ERASURE_REQUEST"});
  if (!item.subjectUserId) return res.status(422).json({ok:false,error:"SUBJECT_ACCOUNT_NOT_LINKED"});
  const user=await prisma.user.findFirst({where:{id:String(item.subjectUserId),companyId},select:{id:true,email:true}});
  if (!user) return res.status(404).json({ok:false,error:"SUBJECT_NOT_FOUND"});
  const [activities,companyMemberships,projectMemberships,submissions]=await Promise.all([
    prisma.activityLog.count({where:{userId:user.id,companyId}}),
    prisma.companyMember.count({where:{userId:user.id,companyId}}),
    prisma.projectMember.count({where:{userId:user.id}}),
    prisma.projectSubmission.count({where:{userId:user.id}})
  ]);
  const secondary=await secondaryUserReferences(user.id);
  const [projectDocuments,projectSubmissions,employeeDocuments]=await Promise.all([
    prisma.document.count({where:{project:{companyId}}}),
    prisma.projectSubmission.count({where:{companyId}}),
    prisma.companyEmployeeDocument.count({where:{employee:{companyId}}})
  ]);
  const storageInventory={
    projectDocuments,
    projectSubmissions,
    employeeDocuments,
    objectStore:"REQUIRES_BUCKET_AND_KEY_OWNERSHIP_AUDIT",
    filesystem:"REQUIRES_ATTACHMENT_AND_PROJECT_FILE_SCAN",
    backupInventory:"REQUIRES_SNAPSHOT_AND_RESTORE_PROCEDURE_REVIEW"
  };
  const retentionCategories=[
    {category:"ACCOUNT_PROFILE",decision:"REVIEW_FOR_ERASURE",basis:"Art. 17 DSGVO"},
    {category:"CONSTRUCTION_PROJECT_DOCUMENTS",decision:"RETENTION_REVIEW",basis:"Contractual / statutory documentation"},
    {category:"ACCOUNTING_AND_INVOICES",decision:"RETENTION_REVIEW",basis:"HGB / AO / GoBD"},
    {category:"AUDIT_AND_SECURITY_LOGS",decision:"RETENTION_REVIEW",basis:"Security and accountability"},
    {category:"WORKFORCE_AND_TIMESHEETS",decision:"RETENTION_REVIEW",basis:"Employment-law requirements"},
    {category:"PHOTOS_AND_ATTACHMENTS",decision:"MANUAL_FILE_INVENTORY",basis:"Filesystem / object storage"},
    {category:"DATABASE_BACKUPS_AND_ARCHIVES",decision:"BACKUP_EXPIRY_REVIEW",basis:"Backup retention / restore procedures"},
    {category:"EXTERNAL_PROCESSORS_AND_AI",decision:"PROCESSOR_ERASURE_REVIEW",basis:"AVV / processor deletion"}
  ];
  const assessment={
    accountId:user.id, companyId, identityVerified:Boolean(item.identityVerifiedAt),
    legalHold:Boolean(item.legalHold), legalHoldReason:String(item.legalHoldReason||""),
    linkedRecords:{activities,companyMemberships,projectMemberships,submissions,secondary},
    storageInventory,
    retentionCategories, inventoryComplete:false,
    blockingCategories:retentionCategories.filter(c=>c.decision!=="REVIEW_FOR_ERASURE").map(c=>c.category),
    retentionReviewRequired:true,
    deletableNow:false,
    executionEnabled:false,
    reason:"Human-approved retention review and full data inventory required; no automatic deletion of construction, accounting, or audit records."
  };
  return res.json({ok:true,assessment});
});

/** Inventory of secondary references not represented as Prisma User relations.
 * Fail closed if any count query fails or a new data category has not been reviewed. */
async function secondaryUserReferences(userId:string) {
  const checks:[string,Promise<number>][]=[
    ["auditLog",prisma.auditLog.count({where:{userId}})],
    ["aiMarketReviewUsage",prisma.aiMarketReviewUsage.count({where:{userId}})],
    ["aiMarketCreditOrder",prisma.aiMarketCreditOrder.count({where:{userId}})],
    ["vorlageFavorite",prisma.vorlageFavorite.count({where:{userId}})],
    ["vorlageTemplate",prisma.vorlageTemplate.count({where:{createdByUserId:userId}})],
    ["vorlageDocument",prisma.vorlageDocument.count({where:{createdByUserId:userId}})],
    ["companyInviteCreated",prisma.companyInvite.count({where:{createdByUserId:userId}})],
    ["companyInviteActivated",prisma.companyInvite.count({where:{activatedByUserId:userId}})],
    ["mobileLicense",prisma.mobileLicense.count({where:{createdByUserId:userId}})],
    ["marketIntelligenceReview",prisma.marketIntelligenceReview.count({where:{userId}})]
  ];
  const values=await Promise.all(checks.map(async ([name,promise])=>[name,await promise] as const));
  return Object.fromEntries(values) as Record<string,number>;
}

/** Destructive proof-of-concept restricted to explicitly marked disposable test tenants.
 * Production accounts and retained construction records are never deleted here. */
r.post("/:id/test-erasure", requirePermission("privacy:*"), async (req:any,res)=>{
  const companyId=cid(req);
  const rows=read(companyId);
  const idx=rows.findIndex(x=>String(x.id)===String(req.params.id));
  if(idx<0) return res.status(404).json({ok:false,error:"NOT_FOUND"});
  const item=rows[idx];
  if(String(item.requestType).toUpperCase()!=="ERASURE" || !item.subjectUserId)
    return res.status(422).json({ok:false,error:"ERASURE_SUBJECT_REQUIRED"});
  if(!item.identityVerifiedAt || item.legalHold || item.evidenceLock)
    return res.status(409).json({ok:false,error:"IDENTITY_OR_RETENTION_BLOCK"});
  const company=await prisma.company.findUnique({where:{id:companyId},select:{code:true}});
  const user=await prisma.user.findFirst({where:{id:String(item.subjectUserId),companyId},select:{id:true,email:true}});
  if(!company?.code.startsWith("DSGVO-ISOLATION-") ||
     !user?.email.endsWith("@example.invalid") ||
     !user.email.startsWith("dsgvo-isolation-"))
    return res.status(403).json({ok:false,error:"REAL_ACCOUNT_ERASURE_DISABLED"});
  if(String(req.body?.confirmation||"")!==String(item.id))
    return res.status(400).json({ok:false,error:"CONFIRMATION_REQUIRED"});
  const [activities,members,projectMembers,submissions]=await Promise.all([
    prisma.activityLog.count({where:{userId:user.id}}),
    prisma.companyMember.count({where:{userId:user.id}}),
    prisma.projectMember.count({where:{userId:user.id}}),
    prisma.projectSubmission.count({where:{userId:user.id}})
  ]);
  const secondary=await secondaryUserReferences(user.id);
  if(activities||members||projectMembers||submissions||Object.values(secondary).some(n=>n>0))
    return res.status(409).json({ok:false,error:"LINKED_RECORDS_REQUIRE_REVIEW",linked:{activities,members,projectMembers,submissions,secondary}});
  // Persist the erasure obligation before the destructive operation; retained across database restores.
  appendErasureEvent(newErasureRecord(companyId,user.id,String(item.id)));
  await prisma.user.delete({where:{id:user.id}});
  const now=new Date().toISOString();
  const evidence={subjectUserId:user.id,deletedAt:now,scope:"DISPOSABLE_TEST_ACCOUNT_ONLY"};
  rows[idx]={
    ...item,subjectName:"[TEST ACCOUNT ERASED]",contact:"",description:"",
    status:"COMPLETED",completedAt:now,responseReference:"TEST_ERASURE:"+item.id,
    notes:"Synthetic account record removed; test-only operation.",updatedAt:now,
    evidenceLock:{hash:crypto.createHash("sha256").update(JSON.stringify(evidence)).digest("hex"),
      lockedAt:now,lockedBy:String(req.auth?.sub||""),reason:"Synthetic test erasure evidence"},
  };
  write(companyId,rows);
  return res.json({ok:true,erased:true,requestId:item.id,scope:"TEST_ONLY"});
});

r.get("/restore-gate/status", requirePermission("privacy:*"), async (_req:any,res)=>{
  const result=await checkRestoredErasureState(prisma);
  return res.status(result.ready?200:409).json({ok:result.ready,...result});
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

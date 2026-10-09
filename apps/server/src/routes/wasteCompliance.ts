import { Router } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { COMPANIES_ROOT } from "../lib/companiesRoot";
import { archiveProjectBufferVersion } from "../services/dmsArchive";
import { requireProjectMember } from "../middleware/guards";

const r = Router();

r.use((req:any,res,next)=>{
  if(req.method==="GET" || req.method==="HEAD") return next();
  const role=String(req?.auth?.companyRole||req?.auth?.role||"").trim().toUpperCase();
  if(!["ADMIN","ADMINISTRATOR","BAULEITER","CAPOCANTIERE"].includes(role)){
    return res.status(403).json({ok:false,error:"WASTE_WRITE_FORBIDDEN"});
  }
  return next();
});

const requireWasteProjectAccess = async (req:any,res:any,next:any) => {
  const token=String(req.params?.projectToken||"").trim();
  if(!token) return res.status(400).json({ok:false,error:"PROJECT_REQUIRED"});
  req.params=req.params||{};
  req.params.__wasteProject=token;
  return requireProjectMember("__wasteProject")(req,res,next);
};

function cid(req:any){ return String(req?.auth?.companyId || "").trim(); }
function safe(v:any){ return String(v||"").replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,160); }
function dir(companyId:string){ const d=path.join(COMPANIES_ROOT,companyId,"waste-compliance"); fs.mkdirSync(d,{recursive:true}); return d; }
function file(companyId:string,projectId:string){ return path.join(dir(companyId),`${safe(projectId)}.json`); }
function read(companyId:string,projectId:string){ try{const f=file(companyId,projectId); if(!fs.existsSync(f)) return {projectId,records:[],project:{totalWasteVolumeM3:0}}; const v=JSON.parse(fs.readFileSync(f,"utf8")); return v&&typeof v==="object"?v:{projectId,records:[],project:{totalWasteVolumeM3:0}};}catch{return {projectId,records:[],project:{totalWasteVolumeM3:0}};} }
function write(companyId:string,projectId:string,value:any){ const f=file(companyId,projectId); const t=`${f}.tmp-${process.pid}-${Date.now()}`; fs.writeFileSync(t,JSON.stringify(value,null,2),"utf8"); fs.renameSync(t,f); }
function hash(v:any){ return crypto.createHash("sha256").update(JSON.stringify(v),"utf8").digest("hex"); }

async function projectForCompany(companyId:string,token:string){
  return prisma.project.findFirst({where:{companyId,OR:[{id:token},{code:token}]},select:{id:true,code:true,name:true}});
}

function validateRecord(record:any, totalWasteVolumeM3:number){
  const errors:string[]=[]; const warnings:string[]=[];
  const hazardous=record?.hazardous===true;
  const ebv=record?.ebvRelevant===true;
  const gewabfRequired=Number(totalWasteVolumeM3||0)>10;

  if(!String(record?.wasteCode||"").trim()) errors.push("AVV-Abfallschlüssel fehlt.");
  if(!String(record?.description||"").trim()) errors.push("Abfall-/Materialbezeichnung fehlt.");
  if(!(Number(record?.quantity||0)>0)) errors.push("Menge fehlt.");
  if(!String(record?.quantityUnit||"").trim()) errors.push("Mengeneinheit fehlt.");
  if(!String(record?.carrierName||"").trim()) errors.push("Beförderer fehlt.");
  if(!String(record?.receiverName||"").trim()) errors.push("Übernehmer/Entsorger fehlt.");
  if(!String(record?.receiverAddress||"").trim()) errors.push("Anschrift Übernehmer/Entsorger fehlt.");
  if(!String(record?.destination||"").trim()) errors.push("Beabsichtigter/tatsächlicher Verbleib fehlt.");
  if(!String(record?.recoveryMethod||"").trim()) errors.push("Verwertungs-/Entsorgungsart fehlt.");

  if(gewabfRequired){
    if(record?.separateCollection!==true && !String(record?.separationDeviationReason||"").trim()){
      errors.push("GewAbfV: Getrenntsammlung oder begründete technische/wirtschaftliche Abweichung fehlt.");
    }
    if(!String(record?.evidenceRefs||"").trim()) errors.push("GewAbfV: Lageplan/Fotos/Liefer- oder Wiegeschein bzw. vergleichbarer Nachweis fehlt.");
    if(!String(record?.receiverDeclaration||"").trim()) errors.push("GewAbfV: Übernehmererklärung zu Masse, Verwertungsart und Verbleib fehlt.");
  }

  if(hazardous){
    if(!String(record?.disposalProofNumber||"").trim()) errors.push("NachwV: Entsorgungsnachweis-/Sammelentsorgungsnachweisnummer fehlt.");
    if(!String(record?.consignmentNoteNumber||"").trim()) errors.push("NachwV: Begleitschein-/Übernahmescheinnummer fehlt.");
  }

  if(ebv){
    if(!String(record?.materialClass||"").trim()) errors.push("ErsatzbaustoffV: Materialklasse fehlt.");
    if(!String(record?.deliveryNoteNumber||"").trim()) errors.push("ErsatzbaustoffV §25: Lieferscheinnummer fehlt.");
    if(!String(record?.placingLocation||"").trim()) errors.push("ErsatzbaustoffV: Einbauort fehlt.");
    if(!String(record?.placingMethod||"").trim()) errors.push("ErsatzbaustoffV: Einbauweise fehlt.");
    if(!String(record?.groundwaterCoverSoil||"").trim()) errors.push("ErsatzbaustoffV: Bodenart der Grundwasserdeckschicht fehlt.");
    if(record?.coverSheetPresent!==true) errors.push("ErsatzbaustoffV §25: Deckblatt ist nicht bestätigt.");
    if(record?.notificationRequired===true && !record?.preNotificationSubmittedAt) errors.push("ErsatzbaustoffV: erforderliche Voranzeige ist nicht dokumentiert.");
    if(record?.notificationRequired===true && record?.measureCompleted===true && !record?.finalNotificationSubmittedAt) errors.push("ErsatzbaustoffV: erforderliche Abschlussanzeige ist nicht dokumentiert.");
  }

  if(Number(totalWasteVolumeM3||0)<=10) warnings.push("GewAbfV §§8/9: 10-m³-Ausnahme für die dortige Dokumentationspflicht berücksichtigt; andere Abfallpflichten bleiben unberührt.");
  return {valid:errors.length===0,errors,warnings,gewabfDocumentationRequired:gewabfRequired,hazardousEvidenceRequired:hazardous,ebvDocumentationRequired:ebv};
}

r.get("/:projectToken", requireWasteProjectAccess, async (req:any,res)=>{
  try{
    const companyId=cid(req); if(!companyId) return res.status(403).json({ok:false,error:"COMPANY_REQUIRED"});
    const project=await projectForCompany(companyId,String(req.params.projectToken||"")); if(!project) return res.status(404).json({ok:false,error:"PROJECT_NOT_FOUND"});
    const data=read(companyId,project.id); const volume=Number(data?.project?.totalWasteVolumeM3||0);
    const records=(Array.isArray(data.records)?data.records:[]).map((x:any)=>({...x,compliance:validateRecord(x,volume)}));
    return res.json({ok:true,project,data:{...data,records}});
  }catch(e:any){return res.status(500).json({ok:false,error:e?.message||"WASTE_LOAD_FAILED"});}
});

r.put("/:projectToken/project", requireWasteProjectAccess, async (req:any,res)=>{
  try{
    const companyId=cid(req); if(!companyId) return res.status(403).json({ok:false,error:"COMPANY_REQUIRED"});
    const project=await projectForCompany(companyId,String(req.params.projectToken||"")); if(!project) return res.status(404).json({ok:false,error:"PROJECT_NOT_FOUND"});
    const data=read(companyId,project.id);
    data.project={...(data.project||{}),totalWasteVolumeM3:Math.max(0,Number(req.body?.totalWasteVolumeM3||0)),producerName:String(req.body?.producerName||data.project?.producerName||"").trim(),producerAddress:String(req.body?.producerAddress||data.project?.producerAddress||"").trim(),ownerName:String(req.body?.ownerName||data.project?.ownerName||"").trim(),updatedAt:new Date().toISOString()};
    write(companyId,project.id,data);
    return res.json({ok:true,project: data.project});
  }catch(e:any){return res.status(500).json({ok:false,error:e?.message||"WASTE_PROJECT_SAVE_FAILED"});}
});

r.post("/:projectToken/records", requireWasteProjectAccess, async (req:any,res)=>{
  try{
    const companyId=cid(req); if(!companyId) return res.status(403).json({ok:false,error:"COMPANY_REQUIRED"});
    const project=await projectForCompany(companyId,String(req.params.projectToken||"")); if(!project) return res.status(404).json({ok:false,error:"PROJECT_NOT_FOUND"});
    const data=read(companyId,project.id);
    const record={id:crypto.randomUUID(),date:String(req.body?.date||new Date().toISOString().slice(0,10)),status:"OPEN",createdAt:new Date().toISOString(),...req.body,evidenceLock:null};
    data.records=[record,...(Array.isArray(data.records)?data.records:[])]; write(companyId,project.id,data);
    return res.json({ok:true,record,compliance:validateRecord(record,Number(data?.project?.totalWasteVolumeM3||0))});
  }catch(e:any){return res.status(500).json({ok:false,error:e?.message||"WASTE_CREATE_FAILED"});}
});

r.put("/:projectToken/records/:id", requireWasteProjectAccess, async (req:any,res)=>{
  try{
    const companyId=cid(req); if(!companyId) return res.status(403).json({ok:false,error:"COMPANY_REQUIRED"});
    const project=await projectForCompany(companyId,String(req.params.projectToken||"")); if(!project) return res.status(404).json({ok:false,error:"PROJECT_NOT_FOUND"});
    const data=read(companyId,project.id); const rows=Array.isArray(data.records)?data.records:[]; const idx=rows.findIndex((x:any)=>String(x.id)===String(req.params.id));
    if(idx<0) return res.status(404).json({ok:false,error:"NOT_FOUND"});
    if(rows[idx]?.evidenceLock) return res.status(409).json({ok:false,error:"WASTE_EVIDENCE_LOCKED",lock:rows[idx].evidenceLock});
    const next={...rows[idx],...req.body,id:rows[idx].id,updatedAt:new Date().toISOString()};
    const compliance=validateRecord(next,Number(data?.project?.totalWasteVolumeM3||0));
    if(String(next.status||"").toUpperCase()==="FINAL"){
      if(!compliance.valid) return res.status(422).json({ok:false,error:"WASTE_COMPLIANCE_INCOMPLETE",compliance});
      const lock={hash:hash(next),lockedAt:new Date().toISOString(),lockedBy:String(req?.auth?.email||req?.auth?.sub||"").trim()||null,reason:"Abfall-/Entsorgungsnachweis abgeschlossen"};
      next.evidenceLock=lock;
      await archiveProjectBufferVersion({
        projectIdOrCode: project.id,
        filename: `Entsorgungsnachweis_${next.id}.json`,
        kind: "DOC",
        buffer: Buffer.from(JSON.stringify({record:next,compliance,lock},null,2),"utf8"),
        uploadedBy: lock.lockedBy,
        meta: {module:"ABFALL_ENTSORGUNG",source:"waste-compliance",recordId:next.id,evidenceHash:lock.hash,evidenceLocked:true}
      });
    }
    rows[idx]=next; data.records=rows; write(companyId,project.id,data);
    return res.json({ok:true,record:next,compliance});
  }catch(e:any){return res.status(500).json({ok:false,error:e?.message||"WASTE_UPDATE_FAILED"});}
});

r.delete("/:projectToken/records/:id", requireWasteProjectAccess, async (req:any,res)=>{
  try{
    const companyId=cid(req); if(!companyId) return res.status(403).json({ok:false,error:"COMPANY_REQUIRED"});
    const project=await projectForCompany(companyId,String(req.params.projectToken||"")); if(!project) return res.status(404).json({ok:false,error:"PROJECT_NOT_FOUND"});
    const data=read(companyId,project.id); const rows=Array.isArray(data.records)?data.records:[]; const row=rows.find((x:any)=>String(x.id)===String(req.params.id));
    if(!row) return res.status(404).json({ok:false,error:"NOT_FOUND"});
    if(row.evidenceLock) return res.status(409).json({ok:false,error:"WASTE_EVIDENCE_LOCKED",lock:row.evidenceLock});
    data.records=rows.filter((x:any)=>String(x.id)!==String(req.params.id)); write(companyId,project.id,data); return res.json({ok:true});
  }catch(e:any){return res.status(500).json({ok:false,error:e?.message||"WASTE_DELETE_FAILED"});}
});

export default r;

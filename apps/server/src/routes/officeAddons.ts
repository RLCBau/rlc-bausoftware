import {bidComparisonSnapshot} from '../services/bidComparisonSnapshot';
import {preisspiegelPdf} from '../services/pdf/preisspiegelPdf';
import { Router } from "express";
import cockpitRouter from "./operationsCockpit";
import shipmentsRouter from "./shipments";
import machineUsageRouter from "./machineUsage";
import { releaseInput,releaseTransition } from "../domain/machineRelease";
import { prisma } from "../lib/prisma";
import { InputError, input, transition, expiryStatus } from "../domain/officeAddons";

import { bidInput, total as bidTotal, compareBids } from "../domain/preisspiegel";

const router = Router();
const roles = ["ADMIN", "ADMINISTRATOR", "BAULEITER", "BUCHHALTUNG"];
function role(req: any) { return String(req.auth?.companyRole || req.auth?.role || "").toUpperCase(); }
function cid(req: any) { return String(req.auth?.companyId || ""); }
function uid(req: any) { return String(req.auth?.sub || req.auth?.userId || ""); }
router.use((req: any, res, next) => {
  if (!cid(req) || !uid(req)) return res.status(401).json({ ok: false, error: "Anmeldung erforderlich." });
  const allowed = req.path.startsWith("/bids") ? [...roles,"KALKULATOR"] : req.path.startsWith("/machine-releases") || req.path.startsWith("/machine-usage") || req.path==="/links" ? [...roles,"KALKULATOR","CAPOCANTIERE"] : req.path.startsWith("/shipments") ? [...roles,"CAPOCANTIERE"] : roles;
  if (!allowed.includes(role(req))) return res.status(403).json({ ok: false, error: "Berechtigung für kaufmännische Projektunterlagen erforderlich." });
  next();
});
async function project(req: any, token: unknown, tx: any = prisma) {
  const key = typeof token === "string" ? token.trim() : "";
  if (!key) throw new InputError("Projekt erforderlich.");
  return tx.project.findFirst({ where: { companyId: cid(req), OR: [{ id: key }, { code: key }],
    ...(["ADMIN", "ADMINISTRATOR", "BUCHHALTUNG"].includes(role(req)) ? {} : { projectMembers: { some: { userId: uid(req) } } }),
  }, select: { id: true, code: true, name: true } });
}
async function links(req: any, projectId: string, data: any) {
  if (data.contractId) {
    const c = await prisma.contract.findFirst({ where: { id: data.contractId, companyId: cid(req), projectId } });
    if (!c) throw new InputError("Vertrag gehört nicht zu diesem Projekt.");
    if (data.certificate && !["Nachunternehmervertrag", "Liefervertrag"].includes(c.contractType)) throw new InputError("Nachweis benötigt einen Liefer- oder Nachunternehmervertrag.");
  }
  if (data.documentId && !await prisma.document.findFirst({ where: { id: data.documentId, projectId, deletedAt: null, project: { companyId: cid(req) } } })) {
    throw new InputError("Dokument gehört nicht zu diesem Projekt.");
  }
}
function dto(item: any) { return { ...item, ...(item.amount !== undefined ? { amount: String(item.amount) } : {}), expiry: expiryStatus(item.validUntil) }; }
function fail(res: any, e: any) {
  if (e instanceof InputError) return res.status(400).json({ ok: false, error: e.message });
  if (e?.code === "P2002") return res.status(409).json({ ok: false, error: "Diese Bürgschaftsnummer ist im Projekt bereits vorhanden." });
  console.error("[office-addons]", e?.code || e?.name || "ERROR");
  return res.status(500).json({ ok: false, error: "Vorgang konnte nicht abgeschlossen werden." });
}
for (const kind of ["guarantees", "certificates"] as const) {
  const model = kind === "guarantees" ? "projectGuarantee" : "contractCertificate";
  router.get("/" + kind + "/:id/history", async (req: any, res) => {
    try {
      const row = await (prisma as any)[model].findFirst({ where: { id: req.params.id, companyId: cid(req) } });
      if (!row || !await project(req, row.projectId)) return res.status(404).json({ ok: false, error: "Unterlage nicht verfügbar." });
      const items = await prisma.auditLog.findMany({ where: { companyId: cid(req), resource: kind + ":" + row.id },
        orderBy: { createdAt: "desc" }, take: 100, select: { id: true, action: true, createdAt: true, userId: true, meta: true } });
      res.json({ ok: true, items });
    } catch (e) { fail(res, e); }
  });
  router.get("/" + kind, async (req: any, res) => {
    try {
      const p = await project(req, req.query.projectId);
      if (!p) return res.status(404).json({ ok: false, error: "Projekt nicht verfügbar." });
      const items = await (prisma as any)[model].findMany({ where: { companyId: cid(req), projectId: p.id },
        orderBy: [{ validUntil: "asc" }, { updatedAt: "desc" }], take: 2000,
        include: { contract: { select: { title: true, partner: true, contractNumber: true } }, document: { select: { name: true } } } });
      res.json({ ok: true, project: p, items: items.map(dto) });
    } catch (e) { fail(res, e); }
  });
  router.post("/" + kind, async (req: any, res) => {
    try {
      const p = await project(req, req.body?.projectId);
      if (!p) return res.status(404).json({ ok: false, error: "Projekt nicht verfügbar." });
      const data = input(kind, req.body);
      const initial = kind === "guarantees" ? "Entwurf" : "Ungeprüft";
      if (data.status !== initial) throw new InputError("Neue Unterlagen müssen zunächst als " + initial + " gespeichert werden.");
      await links(req, p.id, { ...data, certificate: kind === "certificates" });
      const item = await prisma.$transaction(async tx => {
        const row = await (tx as any)[model].create({ data: { ...data, companyId: cid(req), projectId: p.id } });
        await tx.auditLog.create({ data: { companyId: cid(req), userId: uid(req), action: "OFFICE_ADDON_CREATE", resource: kind + ":" + row.id,
          meta: { projectId: p.id, revision: row.revision, status: row.status, after: JSON.parse(JSON.stringify(row)) } } });
        return row;
      });
      res.status(201).json({ ok: true, item: dto(item) });
    } catch (e) { fail(res, e); }
  });
  router.put("/" + kind + "/:id", async (req: any, res) => {
    try {
      const current = await (prisma as any)[model].findFirst({ where: { id: req.params.id, companyId: cid(req) } });
      if (!current || !await project(req, current.projectId)) return res.status(404).json({ ok: false, error: "Unterlage nicht verfügbar." });
      if (!Number.isSafeInteger(req.body?.revision) || req.body.revision !== current.revision) return res.status(409).json({ ok: false, error: "Unterlage wurde geändert. Bitte neu laden." });
      if (current.status === "Archiviert") throw new InputError("Archivierte Unterlagen sind gesperrt.");
      const data: any = input(kind, req.body);
      transition(kind, current.status, data.status);
      if (["Archiviert", "Zurückgegeben"].includes(current.status)) {
        const comparable: any = { ...current, validFrom: current.validFrom?.toISOString().slice(0, 10) || "", validUntil: current.validUntil?.toISOString().slice(0, 10) || "" };
        for (const key of Object.keys(data).filter(k => k !== "status")) {
          const a = data[key] instanceof Date ? data[key].toISOString().slice(0, 10) : String(data[key] ?? "");
          const b = String(comparable[key] ?? "");
          if (a !== b && !(key === "amount" && Number(a) === Number(b))) throw new InputError("Zurückgegebene oder archivierte Unterlagen sind gegen Änderungen gesperrt.");
        }
      }
      await links(req, current.projectId, { ...data, certificate: kind === "certificates" });
      const result = await prisma.$transaction(async tx => {
        const count = await (tx as any)[model].updateMany({ where: { id: current.id, companyId: cid(req), revision: current.revision },
          data: { ...data, revision: { increment: 1 }, ...(kind === "certificates" ? {
            reviewedBy: data.status === "Geprüft" ? uid(req) : null,
            reviewedAt: data.status === "Geprüft" ? new Date() : null } : {}) } });
        if (count.count !== 1) return null;
        await tx.auditLog.create({ data: { companyId: cid(req), userId: uid(req), action: "OFFICE_ADDON_UPDATE", resource: kind + ":" + current.id,
          meta: { projectId: current.projectId, previousStatus: current.status, status: data.status, revision: current.revision + 1, before: JSON.parse(JSON.stringify(current)), after: JSON.parse(JSON.stringify(data)) } } });
        return (tx as any)[model].findUnique({ where: { id: current.id } });
      });
      if (!result) return res.status(409).json({ ok: false, error: "Unterlage wurde gleichzeitig geändert. Bitte neu laden." });
      res.json({ ok: true, item: dto(result) });
    } catch (e) { fail(res, e); }
  });
}
router.get("/links", async (req: any, res) => {
  try {
    const p = await project(req, req.query.projectId);
    if (!p) return res.status(404).json({ ok: false, error: "Projekt nicht verfügbar." });
    const [contracts, documents] = await Promise.all([
      prisma.contract.findMany({ where: { companyId: cid(req), projectId: p.id }, select: { id: true, title: true, partner: true, contractType: true }, orderBy: { title: "asc" } }),
      prisma.document.findMany({ where: { projectId: p.id, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 2000 }),
    ]);
    res.json({ ok: true, contracts, documents });
  } catch (e) { fail(res, e); }
});

router.get("/bids", async (req: any, res) => {
  try {
    const p=await project(req,req.query.projectId);
    if(!p)return res.status(404).json({ok:false,error:"Projekt nicht verfügbar."});
    const items=await prisma.projectBid.findMany({where:{companyId:cid(req),projectId:p.id},orderBy:{updatedAt:"desc"}});
    res.json({ok:true,items:items.map(b=>({...b,discountPercent:String(b.discountPercent),total:bidTotal(b.positions as any,String(b.discountPercent))}))});
  }catch(e){fail(res,e);}
});
router.post("/bids", async(req:any,res)=>{
  try {
    const p=await project(req,req.body?.projectId);
    if(!p)return res.status(404).json({ok:false,error:"Projekt nicht verfügbar."});
    const data=bidInput(req.body);
    if(data.status!=="Entwurf")throw new InputError("Neue Angebote zunächst als Entwurf speichern.");
    await links(req,p.id,data);
    const item=await prisma.$transaction(async tx=>{
      const row=await tx.projectBid.create({data:{...data,companyId:cid(req),projectId:p.id}});
      await tx.auditLog.create({data:{companyId:cid(req),userId:uid(req),action:"BID_CREATE",resource:"bid:"+row.id,meta:{after:JSON.parse(JSON.stringify(row))}}});
      return row;
    });
    res.status(201).json({ok:true,item});
  }catch(e){fail(res,e);}
});
router.put("/bids/:id", async(req:any,res)=>{
  try{
    const current=await prisma.projectBid.findFirst({where:{id:req.params.id,companyId:cid(req)}});
    if(!current || !await project(req,current.projectId))return res.status(404).json({ok:false,error:"Angebot nicht verfügbar."});
    if(req.body?.revision!==current.revision)return res.status(409).json({ok:false,error:"Angebot wurde geändert. Bitte neu laden."});
    const data=bidInput(req.body);
    if(current.status==="Archiviert" || current.awardedAt)throw new InputError("Archivierte oder ausgewählte Angebote sind gesperrt.");
    if(current.status==="Eingereicht"){
      if(data.status!=="Archiviert")throw new InputError("Eingereichte Angebote können nur archiviert werden. Änderungen als neues Angebot erfassen.");
      for(const key of ["title","supplier","packageKey","kind","notes","documentId"] as const)if(String(data[key]??"")!==String(current[key]??""))throw new InputError("Eingereichte Angebote sind inhaltlich gesperrt.");
      if(JSON.stringify(data.positions.map(r=>[r.position,r.title,r.unit,r.quantity,r.unitPrice]))!==JSON.stringify((current.positions as any[]).map(r=>[r.position,r.title,r.unit,r.quantity,r.unitPrice])) || Number(data.discountPercent)!==Number(current.discountPercent))throw new InputError("Eingereichte Angebotspreise sind gesperrt.");
    }
    await links(req,current.projectId,data);
    const item=await prisma.$transaction(async tx=>{
      const count=await tx.projectBid.updateMany({where:{id:current.id,companyId:cid(req),revision:current.revision},data:{...data,revision:{increment:1}}});
      if(count.count!==1)throw new Error("BID_CONFLICT");
      const row=await tx.projectBid.findUnique({where:{id:current.id}});
      await tx.auditLog.create({data:{companyId:cid(req),userId:uid(req),action:"BID_UPDATE",resource:"bid:"+current.id,meta:{before:JSON.parse(JSON.stringify(current)),after:JSON.parse(JSON.stringify(row))}}});
      return row;
    });
    res.json({ok:true,item});
  }catch(e:any){if(e?.message==="BID_CONFLICT")return res.status(409).json({ok:false,error:"Angebot wurde gleichzeitig geändert."});fail(res,e);}
});
router.get("/bids/compare/:baselineId",async(req:any,res)=>{
 try{
  const data=await prisma.$transaction(async tx=>{
   const baseline=await tx.projectBid.findFirst({where:{id:req.params.baselineId,companyId:cid(req),status:{not:"Archiviert"}}});
   if(!baseline||!await project(req,baseline.projectId,tx))return null;
   return bidComparisonSnapshot(tx,cid(req),baseline.id);
  },{isolationLevel:"RepeatableRead",timeout:15000});
  if(!data)return res.status(404).json({ok:false,error:"Vergleichsbasis nicht verfügbar."});
  res.setHeader("Cache-Control","private, no-store");res.json({ok:true,...data.comparison,snapshot:data.snapshot});
 }catch(e){fail(res,e);}
});
router.post("/bids/compare/:baselineId/pdf",async(req:any,res)=>{
 try{
  if(typeof req.body?.fingerprint!=="string"||!/^[a-f0-9]{64}$/.test(req.body.fingerprint))throw new InputError("Aktuellen Vergleich vor PDF-Ausgabe berechnen.");
  const data=await prisma.$transaction(async tx=>{
   const baseline=await tx.projectBid.findFirst({where:{id:req.params.baselineId,companyId:cid(req),status:{not:"Archiviert"}}});
   if(!baseline||!await project(req,baseline.projectId,tx))return null;
   return bidComparisonSnapshot(tx,cid(req),baseline.id);
  },{isolationLevel:"RepeatableRead",timeout:15000});
  if(!data)return res.status(404).json({ok:false,error:"Vergleichsbasis nicht verfügbar."});
  if(data.snapshot.fingerprint!==req.body.fingerprint)return res.status(409).json({ok:false,error:"Angebote oder Projektangaben geändert. Vergleich erneut berechnen."});
  const pdf=await preisspiegelPdf(data);
  res.setHeader("Content-Type","application/pdf");res.setHeader("Content-Disposition",'attachment; filename="Preisspiegel.pdf"');res.setHeader("Cache-Control","private, no-store");res.setHeader("X-Content-Type-Options","nosniff");res.send(pdf);
 }catch(e){fail(res,e);}
});
router.post("/bids/:id/award",async(req:any,res)=>{
  try {
    const bid=await prisma.projectBid.findFirst({where:{id:req.params.id,companyId:cid(req)}});
    if(!bid || !await project(req,bid.projectId))return res.status(404).json({ok:false,error:"Angebot nicht verfügbar."});
    if(bid.status!=="Eingereicht")throw new InputError("Nur eingereichte Angebote können ausgewählt werden.");
    if(req.body?.revision!==bid.revision)return res.status(409).json({ok:false,error:"Angebot wurde geändert. Bitte neu laden."});
    const baseline=await prisma.projectBid.findFirst({where:{id:String(req.body?.baselineId || ""),companyId:cid(req),projectId:bid.projectId,packageKey:bid.packageKey,kind:bid.kind,status:"Eingereicht"}});
    if(!baseline)throw new InputError("Eine eingereichte Vergleichsbasis aus demselben Vergabepaket ist erforderlich.");
    const comparison=compareBids([baseline,...(baseline.id===bid.id?[]:[bid])],baseline.id);
    if(!comparison.offers.find(x=>x.id===bid.id)?.comparable)throw new InputError("Unvollständige oder nicht vergleichbare Angebote können nicht ausgewählt werden.");
    if(bid.awardedAt) return res.json({ok:true});
    await prisma.$transaction(async tx=>{
      await tx.projectBid.updateMany({where:{companyId:cid(req),projectId:bid.projectId,packageKey:bid.packageKey,kind:bid.kind,awardedAt:{not:null}},data:{awardedAt:null,awardedBy:null,revision:{increment:1}}});
      const count=await tx.projectBid.updateMany({where:{id:bid.id,companyId:cid(req),revision:bid.revision,status:"Eingereicht"},data:{awardedAt:new Date(),awardedBy:uid(req),revision:{increment:1}}});
      if(count.count!==1)throw new Error("BID_CONFLICT");
      await tx.auditLog.create({data:{companyId:cid(req),userId:uid(req),action:"BID_SELECT",resource:"bid:"+bid.id,meta:{baseline:JSON.parse(JSON.stringify(baseline)),offer:JSON.parse(JSON.stringify(bid)),comparison:JSON.parse(JSON.stringify(comparison))}}});
    });
    res.json({ok:true});
  }catch(e:any){if(e?.message==="BID_CONFLICT" || e?.code==="P2002" || e?.code==="P2034")return res.status(409).json({ok:false,error:"Auswahl wurde gleichzeitig geändert. Bitte neu laden."});fail(res,e);}
});

router.post("/bids/:id/unselect",async(req:any,res)=>{
 try{
  const current=await prisma.projectBid.findFirst({where:{id:req.params.id,companyId:cid(req)}});
  if(!current || !await project(req,current.projectId))return res.status(404).json({ok:false,error:"Angebot nicht verfügbar."});
  if(req.body?.revision!==current.revision)return res.status(409).json({ok:false,error:"Angebot wurde geändert."});
  await prisma.$transaction(async tx=>{
   const count=await tx.projectBid.updateMany({where:{id:current.id,companyId:cid(req),revision:current.revision},data:{awardedAt:null,awardedBy:null,revision:{increment:1}}});
   if(count.count!==1)throw new Error("BID_CONFLICT");
   await tx.auditLog.create({data:{companyId:cid(req),userId:uid(req),action:"BID_UNSELECT",resource:"bid:"+current.id,meta:{before:JSON.parse(JSON.stringify(current))}}});
  });
  res.json({ok:true});
 }catch(e:any){if(e?.message==="BID_CONFLICT")return res.status(409).json({ok:false,error:"Angebot wurde gleichzeitig geändert."});fail(res,e);}
});


async function releaseMachine(req:any,projectId:string,machineId:string){
 const machine=await prisma.companyMachine.findFirst({where:{id:machineId,companyId:cid(req),active:true}});
 if(!machine)return null;
 if(machine.projectId===projectId)return machine;
 const assignment=await prisma.resourceAssignment.findFirst({where:{companyId:cid(req),projectId,resourceType:"MACHINE",resourceId:machineId}});
 return assignment?machine:null;
}
function releaseDto(row:any){
 return {...row,releaseDate:row.releaseDate.toISOString().slice(0,10),availableFrom:row.availableFrom.toISOString().slice(0,10)};
}
router.get("/machine-releases/resources",async(req:any,res)=>{
 try{
  const p=await project(req,req.query.projectId);if(!p)return res.status(404).json({ok:false,error:"Projekt nicht verfügbar."});
  const assignments=await prisma.resourceAssignment.findMany({where:{companyId:cid(req),projectId:p.id,resourceType:"MACHINE"},select:{resourceId:true},distinct:["resourceId"]});
  const machines=await prisma.companyMachine.findMany({where:{companyId:cid(req),active:true,OR:[{projectId:p.id},{id:{in:assignments.map(a=>a.resourceId)}}]},select:{id:true,name:true,serial:true,status:true},orderBy:{name:"asc"}});
  return res.json({ok:true,machines});
 }catch(e){fail(res,e);}
});
router.get("/machine-releases",async(req:any,res)=>{
 try{
  const p=await project(req,req.query.projectId);if(!p)return res.status(404).json({ok:false,error:"Projekt nicht verfügbar."});
  const items=await prisma.machineRelease.findMany({where:{companyId:cid(req),projectId:p.id},include:{machine:{select:{name:true,serial:true}},document:{select:{name:true}}},orderBy:[{releaseDate:"desc"},{createdAt:"desc"}]});
  return res.json({ok:true,items:items.map(releaseDto)});
 }catch(e){fail(res,e);}
});
router.get("/machine-releases/:id/history",async(req:any,res)=>{
 try{
  const row=await prisma.machineRelease.findFirst({where:{id:req.params.id,companyId:cid(req)}});
  if(!row || !await project(req,row.projectId))return res.status(404).json({ok:false,error:"Freimeldung nicht verfügbar."});
  const items=await prisma.auditLog.findMany({where:{companyId:cid(req),resource:"machine-release:"+row.id},orderBy:{createdAt:"desc"},take:100,select:{id:true,action:true,createdAt:true,meta:true}});
  return res.json({ok:true,items});
 }catch(e){fail(res,e);}
});
router.post("/machine-releases",async(req:any,res)=>{
 try{
  const p=await project(req,req.body?.projectId);if(!p)return res.status(404).json({ok:false,error:"Projekt nicht verfügbar."});
  const data=releaseInput(req.body);
  if(data.status!=="Entwurf")throw new InputError("Neue Freimeldung zunächst als Entwurf speichern.");
  if(!await releaseMachine(req,p.id,data.machineId))throw new InputError("Gerät gehört nicht zu den Einsätzen dieses Projekts.");
  await links(req,p.id,data);
  const row=await prisma.$transaction(async tx=>{
   const item=await tx.machineRelease.create({data:{...data,companyId:cid(req),projectId:p.id}});
   await tx.auditLog.create({data:{companyId:cid(req),userId:uid(req),action:"MACHINE_RELEASE_CREATE",resource:"machine-release:"+item.id,meta:{after:JSON.parse(JSON.stringify(item))}}});
   return item;
  });
  return res.status(201).json({ok:true,item:releaseDto(row)});
 }catch(e){fail(res,e);}
});
router.put("/machine-releases/:id",async(req:any,res)=>{
 try{
  const current=await prisma.machineRelease.findFirst({where:{id:req.params.id,companyId:cid(req)}});
  if(!current || !await project(req,current.projectId))return res.status(404).json({ok:false,error:"Freimeldung nicht verfügbar."});
  if(!Number.isSafeInteger(req.body?.revision) || current.revision!==req.body.revision)return res.status(409).json({ok:false,error:"Freimeldung wurde geändert. Bitte neu laden."});
  if(current.status==="Archiviert")throw new InputError("Archivierte Freimeldung ist gesperrt.");
  const data=releaseInput(req.body);releaseTransition(current.status,data.status);
  if(current.status!=="Entwurf"){
   for(const key of ["machineId","condition","notes","documentId"] as const)if(String(data[key]??"")!==String(current[key]??""))throw new InputError("Gemeldete Freimeldung ist inhaltlich gesperrt.");
   if(data.releaseDate.getTime()!==current.releaseDate.getTime() || data.availableFrom.getTime()!==current.availableFrom.getTime())throw new InputError("Gemeldete Termine sind gesperrt.");
  }else{
   if(!await releaseMachine(req,current.projectId,data.machineId))throw new InputError("Gerät gehört nicht zu den Einsätzen dieses Projekts.");
   await links(req,current.projectId,data);
  }
  if(data.status==="Bestätigt" && current.status!=="Bestätigt"){
   const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Berlin",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
   if(data.releaseDate.toISOString().slice(0,10)>today)throw new InputError("Künftiges Einsatzende kann noch nicht bestätigt werden.");
  }
  const row=await prisma.$transaction(async tx=>{
   const count=await tx.machineRelease.updateMany({where:{id:current.id,companyId:cid(req),revision:current.revision},data:{
    ...data,revision:{increment:1},
    ...(current.status==="Entwurf" && data.status==="Gemeldet"?{reportedAt:new Date(),reportedBy:uid(req)}:{}),
    ...(current.status==="Gemeldet" && data.status==="Bestätigt"?{confirmedAt:new Date(),confirmedBy:uid(req)}:{})
   }});
   if(count.count!==1)throw new Error("RELEASE_CONFLICT");
   const after=await tx.machineRelease.findUnique({where:{id:current.id}});
   await tx.auditLog.create({data:{companyId:cid(req),userId:uid(req),action:"MACHINE_RELEASE_UPDATE",resource:"machine-release:"+current.id,meta:{before:JSON.parse(JSON.stringify(current)),after:JSON.parse(JSON.stringify(after))}}});
   return after!;
  });
  return res.json({ok:true,item:releaseDto(row)});
 }catch(e:any){if(e?.message==="RELEASE_CONFLICT")return res.status(409).json({ok:false,error:"Freimeldung wurde gleichzeitig geändert."});fail(res,e);}
});

router.use("/machine-usage",machineUsageRouter({cid,uid,role,project,links,machine:releaseMachine}));
router.use("/shipments",shipmentsRouter({cid,uid,project,links}));
router.use("/cockpit",cockpitRouter({cid,project}));
export default router;

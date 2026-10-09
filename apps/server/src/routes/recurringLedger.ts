
import {Router} from "express";
import {prisma} from "../lib/prisma";
import {InputError} from "../domain/officeAddons";
import {recurringInput,dueDates,ledgerText} from "../domain/recurringLedger";
import {berlinToday} from "../domain/machineUsage";
type Context=(req:any)=>Promise<any>;
export default function recurringLedgerRouter(context:Context){
 const router=Router();
 function actor(req:any){return String(req.auth?.sub||req.auth?.userId||"");}
 function fail(res:any,e:any){
  if(e?.message==="RECURRING_CONFLICT" || e?.code==="P2002")return res.status(409).json({ok:false,error:"Vorlage wurde gleichzeitig geändert. Bitte neu laden."});
  if(e instanceof InputError)return res.status(400).json({ok:false,error:e.message});
  if(["PROJECT_FORBIDDEN","COMPANY_REQUIRED"].includes(e?.message))return res.status(403).json({ok:false,error:e.message});
  console.error("[recurring-ledger]",e?.code||e?.name);
  return res.status(500).json({ok:false,error:"Vorgang fehlgeschlagen."});
 }
 async function center(tx:any,p:any,code:string|null){
  if(code && !await tx.projectCostCenter.findFirst({where:{companyId:p.companyId,projectId:p.id,code,active:true}}))throw new InputError("Aktive Kostenstelle aus diesem Projekt erforderlich.");
 }
 const dto=(r:any)=>({...r,amount:String(r.amount),startDate:r.startDate.toISOString().slice(0,10),endDate:r.endDate?.toISOString().slice(0,10)||""});
 async function pending(tx:any,row:any,through:string){
  if(through>berlinToday())throw new InputError("Zukünftige Fälligkeiten können noch nicht gebucht werden.");
  const dates=dueDates(row,through);
  const booked=await tx.recurringLedgerOccurrence.findMany({where:{templateId:row.id},select:{date:true}});
  const done=new Set(booked.map((x:any)=>x.date.toISOString().slice(0,10)));
  return dates.filter(d=>!done.has(d));
 }
 router.get("/",async(req:any,res)=>{
  try{const {project,accounting}=await context(req);
   const [items,centers]=await Promise.all([prisma.recurringLedgerTemplate.findMany({where:{accountingId:accounting.id},orderBy:{createdAt:"desc"},include:{_count:{select:{occurrences:true}}}}),prisma.projectCostCenter.findMany({where:{companyId:project.companyId,projectId:project.id,active:true},select:{code:true,description:true},orderBy:{code:"asc"}})]);
   res.json({ok:true,items:items.map(dto),centers});
  }catch(e){fail(res,e);}
 });
 router.post("/",async(req:any,res)=>{
  try{
   const {project,accounting}=await context(req),data=recurringInput(req.body);
   const id=ledgerText(req.body.requestId,"Anfrage-ID",36,true);
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))throw new InputError("Gültige Anfrage-ID erforderlich.");
   const item=await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "AccountingRoot" WHERE id = ${accounting.id} FOR UPDATE`;
    const existing=await tx.recurringLedgerTemplate.findUnique({where:{id}});
    if(existing){
     if(existing.accountingId!==accounting.id)throw new Error("RECURRING_CONFLICT");
     for(const [key,value] of Object.entries(data)){
      const a=value instanceof Date?value.toISOString():String(value??"");
      const b=(existing as any)[key] instanceof Date?(existing as any)[key].toISOString():String((existing as any)[key]??"");
      if(key==="amount"?Number(a)!==Number(b):a!==b)throw new Error("RECURRING_CONFLICT");
     }
     return existing;
    }
    await center(tx,project,data.costCenter);
    const row=await tx.recurringLedgerTemplate.create({data:{...data,id,accountingId:accounting.id}});
    await tx.auditLog.create({data:{companyId:project.companyId,userId:actor(req),action:"RECURRING_LEDGER_CREATE",resource:"recurring-ledger:"+id,meta:{after:JSON.parse(JSON.stringify(row))}}});
    return row;
   });res.status(201).json({ok:true,item:dto(item)});
  }catch(e){fail(res,e);}
 });
 router.put("/:id",async(req:any,res)=>{
  try{
   const {project,accounting}=await context(req),data=recurringInput(req.body);
   if(!Number.isSafeInteger(req.body.revision))throw new Error("RECURRING_CONFLICT");
   const item=await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "RecurringLedgerTemplate" WHERE id = ${String(req.params.id)} FOR UPDATE`;
    const old=await tx.recurringLedgerTemplate.findFirst({where:{id:req.params.id,accountingId:accounting.id}});
    if(!old)return null;
    if(old.revision!==req.body.revision)throw new Error("RECURRING_CONFLICT");
    const count=await tx.recurringLedgerOccurrence.count({where:{templateId:old.id}});
    if(count){
     for(const k of Object.keys(data).filter(k=>k!=="active")){
      const a=(data as any)[k],b=(old as any)[k];
      if(k==="amount"?Number(a)!==Number(b):(a instanceof Date?a.toISOString():String(a??""))!==(b instanceof Date?b.toISOString():String(b??"")))throw new InputError("Vorlage mit gebuchten Fälligkeiten ist inhaltlich gesperrt. Für Änderungen neue Vorlage anlegen.");
     }
    }
    if(!count)await center(tx,project,data.costCenter);
    const row=await tx.recurringLedgerTemplate.update({where:{id:old.id},data:{...data,revision:{increment:1}}});
    await tx.auditLog.create({data:{companyId:project.companyId,userId:actor(req),action:"RECURRING_LEDGER_UPDATE",resource:"recurring-ledger:"+old.id,meta:{before:JSON.parse(JSON.stringify(old)),after:JSON.parse(JSON.stringify(row))}}});
    return row;
   });if(!item)return res.status(404).json({ok:false,error:"Vorlage nicht verfügbar."});
   res.json({ok:true,item:dto(item)});
  }catch(e){fail(res,e);}
 });
 router.get("/:id/history",async(req:any,res)=>{
  try{const {project,accounting}=await context(req);
   const row=await prisma.recurringLedgerTemplate.findFirst({where:{id:req.params.id,accountingId:accounting.id}});
   if(!row)return res.status(404).json({ok:false,error:"Vorlage nicht verfügbar."});
   const [items,occurrences]=await Promise.all([prisma.auditLog.findMany({where:{companyId:project.companyId,resource:"recurring-ledger:"+row.id},orderBy:{createdAt:"desc"},take:100}),prisma.recurringLedgerOccurrence.findMany({where:{templateId:row.id},include:{ledger:true},orderBy:{date:"desc"}})]);
   res.json({ok:true,items,occurrences});
  }catch(e){fail(res,e);}
 });
 router.get("/:id/preview",async(req:any,res)=>{
  try{const {accounting}=await context(req),row=await prisma.recurringLedgerTemplate.findFirst({where:{id:req.params.id,accountingId:accounting.id}});
   if(!row)return res.status(404).json({ok:false,error:"Vorlage nicht verfügbar."});
   const through=ledgerText(req.query.through,"Bis-Datum",10,true);
   const dates=row.active?await pending(prisma,row,through):[];
   res.json({ok:true,revision:row.revision,dates,amount:String(row.amount),active:row.active});
  }catch(e){fail(res,e);}
 });
 router.post("/:id/generate",async(req:any,res)=>{
  try{const {project,accounting}=await context(req);
   const through=ledgerText(req.body.through,"Bis-Datum",10,true);
   const requested=req.body.dates;
   if(!Array.isArray(requested)||!requested.length||requested.length>120||requested.some((x:any)=>typeof x!=="string")||new Set(requested).size!==requested.length)throw new InputError("Eine bis 120 bestätigte Fälligkeiten erforderlich.");
   const items=await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "RecurringLedgerTemplate" WHERE id = ${String(req.params.id)} FOR UPDATE`;
    const row=await tx.recurringLedgerTemplate.findFirst({where:{id:req.params.id,accountingId:accounting.id}});
    if(!row)throw new InputError("Vorlage nicht verfügbar.");
    if(req.body.revision!==row.revision)throw new Error("RECURRING_CONFLICT");
    if(!row.active)throw new InputError("Vorlage ist pausiert.");
    await center(tx,project,row.costCenter);
    const valid=new Set(dueDates(row,through));
    if(through>berlinToday()||requested.some((d:string)=>!valid.has(d)))throw new InputError("Ungültige oder zukünftige Fälligkeiten.");
    const done=await tx.recurringLedgerOccurrence.findMany({where:{templateId:row.id},select:{date:true}});
    const already=new Set(done.map(x=>x.date.toISOString().slice(0,10)));
    const entries=[];
    for(const date of requested.slice().sort()){
     if(already.has(date))continue;
     const ledger=await tx.ledgerEntry.create({data:{accountingId:accounting.id,date:new Date(date+"T00:00:00Z"),account:row.account,contraAccount:row.contraAccount,amount:row.amount,text:row.text,costCenter:row.costCenter,refType:"RECURRING_LEDGER",refId:row.id}});
     await tx.recurringLedgerOccurrence.create({data:{templateId:row.id,date:new Date(date+"T00:00:00Z"),ledgerId:ledger.id}});
     await tx.auditLog.create({data:{companyId:project.companyId,userId:actor(req),action:"RECURRING_LEDGER_BOOK",resource:"recurring-ledger:"+row.id,meta:{date,revision:row.revision,ledger:JSON.parse(JSON.stringify(ledger))}}});
     entries.push(ledger);
    }
    return entries;
   },{timeout:20000});res.json({ok:true,items,created:items.length});
  }catch(e){fail(res,e);}
 });
 return router;
}

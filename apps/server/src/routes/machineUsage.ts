import {Router} from "express";
import {prisma} from "../lib/prisma";
import {InputError} from "../domain/officeAddons";
import {usageInput,usageDecimal,moneyText,berlinToday} from "../domain/machineUsage";
import {planningRange} from "../domain/resourcePlanning";
type Context={cid:(req:any)=>string;uid:(req:any)=>string;role:(req:any)=>string;project:(req:any,token:unknown)=>Promise<any>;links:(req:any,projectId:string,data:any)=>Promise<void>;machine:(req:any,projectId:string,machineId:string)=>Promise<any>};
export function usageDto(row:any){return {...row,date:row.date.toISOString().slice(0,10),hours:String(row.hours),hourlyRate:String(row.hourlyRate),amount:String(row.amount)};}
export default function machineUsageRouter(access:Context){
 const router=Router(),{cid,uid,role,project,links,machine}=access;
 const privileged=(req:any)=>["ADMIN","ADMINISTRATOR","BUCHHALTUNG"].includes(role(req));
 const fail=(res:any,e:any)=>{if(e instanceof InputError)return res.status(400).json({ok:false,error:e.message});if(e?.message==="USAGE_CONFLICT" || e?.code==="P2002" || e?.code==="P2034")return res.status(409).json({ok:false,error:"Geräteeinsatz wurde geändert. Bitte neu laden."});console.error("[machine-usage]",e?.code || e?.name);return res.status(500).json({ok:false,error:"Geräteeinsatz konnte nicht gespeichert werden."});};
 const reference=async(req:any,projectId:string,data:any)=>{
  if(!await machine(req,projectId,data.machineId))throw new InputError("Gerät gehört nicht zu den Einsätzen dieses Projekts.");
  if(data.costCenter && !await prisma.projectCostCenter.findFirst({where:{companyId:cid(req),projectId,code:data.costCenter,active:true}}))throw new InputError("Kostenstelle gehört nicht zu diesem Projekt.");
  await links(req,projectId,data);
 };
 const same=(row:any,data:any)=>Object.keys(data).every(key=>data[key] instanceof Date?row[key].getTime()===data[key].getTime():["hours","hourlyRate","amount"].includes(key)?Number(row[key])===Number(data[key]):String(row[key]??"")===String(data[key]??""));
 router.get("/resources",async(req:any,res)=>{
  try{
   const p=await project(req,req.query.projectId);if(!p)return res.status(404).json({ok:false,error:"Projekt nicht verfügbar."});
   const assignments=await prisma.resourceAssignment.findMany({where:{companyId:cid(req),projectId:p.id,resourceType:"MACHINE"},select:{resourceId:true},distinct:["resourceId"]});
   const [machines,costCenters]=await Promise.all([
    prisma.companyMachine.findMany({where:{companyId:cid(req),active:true,OR:[{projectId:p.id},{id:{in:assignments.map(a=>a.resourceId)}}]},select:{id:true,name:true,serial:true,hourlyRate:true},orderBy:{name:"asc"}}),
    prisma.projectCostCenter.findMany({where:{companyId:cid(req),projectId:p.id,active:true},select:{code:true,description:true},orderBy:{code:"asc"}})
   ]);
   return res.json({ok:true,machines:machines.map(m=>({...m,hourlyRate:String(m.hourlyRate)})),costCenters,canBook:privileged(req)});
  }catch(e){fail(res,e);}
 });
 router.get("/",async(req:any,res)=>{
  try{
   const p=await project(req,req.query.projectId);if(!p)return res.status(404).json({ok:false,error:"Projekt nicht verfügbar."});
   const date=planningRange(req.query.from,req.query.to);
   const items=await prisma.machineUsageEntry.findMany({where:{companyId:cid(req),projectId:p.id,date},include:{machine:{select:{name:true,serial:true}}},orderBy:[{date:"desc"},{createdAt:"desc"}]});
   const booked=items.filter(x=>x.status==="Gebucht"),hours=booked.reduce((s,x)=>s+usageDecimal(String(x.hours),"Stunden",2),0n),amount=booked.reduce((s,x)=>s+usageDecimal(String(x.amount),"Betrag",12),0n);
   return res.json({ok:true,items:items.map(usageDto),totals:{hours:moneyText(hours),amount:moneyText(amount)},canBook:privileged(req)});
  }catch(e){fail(res,e);}
 });
 router.get("/:id/history",async(req:any,res)=>{
  try{
   const row=await prisma.machineUsageEntry.findFirst({where:{id:req.params.id,companyId:cid(req)}});
   if(!row || !await project(req,row.projectId))return res.status(404).json({ok:false,error:"Geräteeinsatz nicht verfügbar."});
   const items=await prisma.auditLog.findMany({where:{companyId:cid(req),resource:"machine-usage:"+row.id},orderBy:{createdAt:"desc"},take:100,select:{id:true,action:true,createdAt:true,meta:true}});
   return res.json({ok:true,items});
  }catch(e){fail(res,e);}
 });
 router.post("/",async(req:any,res)=>{
  try{
   const p=await project(req,req.body?.projectId);if(!p)return res.status(404).json({ok:false,error:"Projekt nicht verfügbar."});
   if(req.body?.status && req.body.status!=="Entwurf")throw new InputError("Neuen Geräteeinsatz als Entwurf speichern.");
   const data=usageInput(req.body);await reference(req,p.id,data);
   const requestId=req.body?.requestId;
   if(requestId!==undefined && (typeof requestId!=="string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)))throw new InputError("Ungültige Anfragekennung.");
   const replay=async()=>{if(!requestId)return null;const row=await prisma.machineUsageEntry.findFirst({where:{id:requestId,companyId:cid(req),projectId:p.id}});if(row&&!same(row,data))throw new Error("USAGE_CONFLICT");return row;};
   let row=await replay();
   if(!row){
    try{row=await prisma.$transaction(async tx=>{
     const item=await tx.machineUsageEntry.create({data:{...data,companyId:cid(req),projectId:p.id,...(requestId?{id:requestId}:{})}});
     await tx.auditLog.create({data:{companyId:cid(req),userId:uid(req),action:"MACHINE_USAGE_CREATE",resource:"machine-usage:"+item.id,meta:{after:JSON.parse(JSON.stringify(item))}}});return item;
    });}catch(e:any){if(e?.code!=="P2002" || !requestId)throw e;row=await replay();if(!row)throw new Error("USAGE_CONFLICT");}
   }
   return res.status(201).json({ok:true,item:usageDto(row)});
  }catch(e){fail(res,e);}
 });
 router.put("/:id",async(req:any,res)=>{
  try{
   const current=await prisma.machineUsageEntry.findFirst({where:{id:req.params.id,companyId:cid(req)}});
   if(!current || !await project(req,current.projectId))return res.status(404).json({ok:false,error:"Geräteeinsatz nicht verfügbar."});
   if(current.status!=="Entwurf")throw new InputError("Gebuchte oder stornierte Geräteeinsätze sind inhaltlich gesperrt.");
   if(!Number.isSafeInteger(req.body?.revision) || req.body.revision!==current.revision)throw new Error("USAGE_CONFLICT");
   const data=usageInput(req.body);await reference(req,current.projectId,data);
   const item=await prisma.$transaction(async tx=>{
    const count=await tx.machineUsageEntry.updateMany({where:{id:current.id,companyId:cid(req),revision:current.revision,status:"Entwurf"},data:{...data,revision:{increment:1}}});
    if(count.count!==1)throw new Error("USAGE_CONFLICT");
    const after=await tx.machineUsageEntry.findUniqueOrThrow({where:{id:current.id}});
    await tx.auditLog.create({data:{companyId:cid(req),userId:uid(req),action:"MACHINE_USAGE_UPDATE",resource:"machine-usage:"+current.id,meta:{before:JSON.parse(JSON.stringify(current)),after:JSON.parse(JSON.stringify(after))}}});return after;
   });
   return res.json({ok:true,item:usageDto(item)});
  }catch(e){fail(res,e);}
 });
 for(const action of ["book","cancel"] as const)router.post("/:id/"+action,async(req:any,res)=>{
  try{
   const current=await prisma.machineUsageEntry.findFirst({where:{id:req.params.id,companyId:cid(req)}});
   if(!current || !await project(req,current.projectId))return res.status(404).json({ok:false,error:"Geräteeinsatz nicht verfügbar."});
   if(!Number.isSafeInteger(req.body?.revision) || req.body.revision!==current.revision)throw new Error("USAGE_CONFLICT");
   if((action==="book" || current.status==="Gebucht")&&!privileged(req))return res.status(403).json({ok:false,error:"Buchung/Storno gebuchter Einsätze erfordert Buchhaltung oder Administrator."});
   if(current.status==="Storniert" || action==="book"&&current.status!=="Entwurf")throw new InputError("Dieser Statuswechsel ist nicht zulässig.");
   if(action==="book" && current.date.toISOString().slice(0,10)>berlinToday())throw new InputError("Künftige Einsätze können noch nicht gebucht werden.");
   const cancelReason=action==="cancel"?String(req.body?.reason??"").trim():null;
   if(action==="cancel" && (typeof req.body?.reason!=="string" || !cancelReason || cancelReason.length>5000))throw new InputError("Stornogrund erforderlich, höchstens 5000 Zeichen.");
   const item=await prisma.$transaction(async tx=>{
    // Serialize bookings and cancellations for this machine/day across projects.
    await tx.$queryRaw`SELECT "id" FROM "CompanyMachine" WHERE "id"=${current.machineId} AND "companyId"=${cid(req)} FOR UPDATE`;
    const locked=await tx.machineUsageEntry.findUnique({where:{id:current.id}});
    if(!locked || locked.revision!==current.revision || locked.status!==current.status)throw new Error("USAGE_CONFLICT");
    if(action==="book"){
     const sum=await tx.machineUsageEntry.aggregate({where:{companyId:cid(req),machineId:current.machineId,date:current.date,status:"Gebucht"},_sum:{hours:true}});
     const booked=usageDecimal(String(sum._sum.hours || "0"),"Stunden",8);
     if(booked+usageDecimal(String(current.hours),"Stunden",2)>2400n)throw new InputError("Für dieses Gerät sind an diesem Tag insgesamt höchstens 24 Stunden buchbar.");
    }
    const count=await tx.machineUsageEntry.updateMany({where:{id:current.id,companyId:cid(req),revision:current.revision,status:current.status},data:{status:action==="book"?"Gebucht":"Storniert",revision:{increment:1},...(action==="book"?{bookedAt:new Date(),bookedBy:uid(req)}:{cancelledAt:new Date(),cancelledBy:uid(req),cancelReason})}});
    if(count.count!==1)throw new Error("USAGE_CONFLICT");
    const after=await tx.machineUsageEntry.findUniqueOrThrow({where:{id:current.id}});
    await tx.auditLog.create({data:{companyId:cid(req),userId:uid(req),action:action==="book"?"MACHINE_USAGE_BOOK":"MACHINE_USAGE_CANCEL",resource:"machine-usage:"+current.id,meta:{before:JSON.parse(JSON.stringify(current)),after:JSON.parse(JSON.stringify(after))}}});return after;
   });
   return res.json({ok:true,item:usageDto(item)});
  }catch(e){fail(res,e);}
 });
 return router;
}

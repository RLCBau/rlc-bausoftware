
import {Router} from "express";
import {Prisma} from "@prisma/client";
import {prisma} from "../lib/prisma";
import {InputError} from "../domain/officeAddons";
import {shipmentInput,shipmentAction,readyForShipment} from "../domain/shipment";
import {deliveryList,deliverySource} from "../services/deliveryAccounting";
import {berlinToday} from "../domain/machineUsage";
export default function shipmentsRouter(deps:{cid:(r:any)=>string;uid:(r:any)=>string;project:(r:any,t:any)=>Promise<any>;links:(r:any,id:string,d:any)=>Promise<void>}){
 const router=Router(),{cid,uid,project,links}=deps;
 function fail(res:any,e:any){
  if(e?.message==="SHIPMENT_CONFLICT"||e?.code==="P2002")return res.status(409).json({ok:false,error:"Sendung wurde geändert. Bitte neu laden."});
  if(e instanceof InputError)return res.status(400).json({ok:false,error:e.message});
  console.error("[shipments]",e?.code||e?.name);res.status(500).json({ok:false,error:"Versandvorgang fehlgeschlagen."});
 }
 function dto(row:any){
  return {...row,plannedDate:row.plannedDate?.toISOString().slice(0,10)||"",expectedDate:row.expectedDate?.toISOString().slice(0,10)||"",dispatchedDate:row.dispatchedDate?.toISOString().slice(0,10)||"",deliveredDate:row.deliveredDate?.toISOString().slice(0,10)||"",
   overdue:row.status==="Geplant"&&row.plannedDate?.toISOString().slice(0,10)<berlinToday()||["Versendet","Problem"].includes(row.status)&&row.expectedDate?.toISOString().slice(0,10)<berlinToday()};
 }
 async function source(p:any,data:any){
  if(!data.deliveryKey)return {sourceHash:null,deliverySnapshot:Prisma.JsonNull};
  const note=await deliverySource(p,data.deliveryKey);
  return {sourceHash:note.sourceHash,deliverySnapshot:JSON.parse(JSON.stringify(note))};
 }
 const snapshot=(v:any)=>JSON.parse(JSON.stringify(v));
 router.get("/resources",async(req:any,res)=>{
  try{
   const p=await project(req,req.query.projectId);if(!p)return res.status(404).json({ok:false,error:"Projekt nicht verfügbar."});
   const [notes,documents]=await Promise.all([deliveryList(p),prisma.document.findMany({where:{projectId:p.id,deletedAt:null},select:{id:true,name:true},orderBy:{name:"asc"},take:2000})]);
   res.json({ok:true,notes:notes.items,unreadable:notes.unreadable,documents});
  }catch(e){fail(res,e);}
 });
 router.get("/",async(req:any,res)=>{
  try{
   const p=await project(req,req.query.projectId);if(!p)return res.status(404).json({ok:false,error:"Projekt nicht verfügbar."});
   const rows=await prisma.projectShipment.findMany({where:{companyId:cid(req),projectId:p.id},include:{document:{select:{name:true}},receiptDocument:{select:{name:true}}},orderBy:{createdAt:"desc"}});
   res.json({ok:true,items:rows.map(dto)});
  }catch(e){fail(res,e);}
 });
 router.get("/:id/history",async(req:any,res)=>{
  try{
   const row=await prisma.projectShipment.findFirst({where:{id:req.params.id,companyId:cid(req)}});
   if(!row||!await project(req,row.projectId))return res.status(404).json({ok:false,error:"Sendung nicht verfügbar."});
   const items=await prisma.auditLog.findMany({where:{companyId:cid(req),resource:"shipment:"+row.id},orderBy:{createdAt:"desc"},take:100,select:{id:true,action:true,createdAt:true,userId:true,meta:true}});
   res.json({ok:true,items});
  }catch(e){fail(res,e);}
 });
 router.post("/",async(req:any,res)=>{
  try{
   const p=await project(req,req.body?.projectId);if(!p)return res.status(404).json({ok:false,error:"Projekt nicht verfügbar."});
   if(req.body.status!==undefined&&req.body.status!=="Entwurf")throw new InputError("Neue Sendungen als Entwurf speichern.");
   const data=shipmentInput(req.body),id=req.body.requestId;
   if(typeof id!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))throw new InputError("Gültige Anfrage-ID erforderlich.");
   await links(req,p.id,data);const link=await source(p,data);
   const item=await prisma.$transaction(async tx=>{
    await tx.$queryRawUnsafe('SELECT id FROM "Project" WHERE id = $1 FOR UPDATE',p.id);
    const old=await tx.projectShipment.findUnique({where:{id}});
    if(old){
     if(old.companyId!==cid(req)||old.projectId!==p.id)throw new Error("SHIPMENT_CONFLICT");
     for(const k of Object.keys(data)){
      const a=(data as any)[k],b=(old as any)[k];
      if((a instanceof Date?a.toISOString():String(a??""))!==(b instanceof Date?b.toISOString():String(b??"")))throw new Error("SHIPMENT_CONFLICT");
     }return old;
    }
    const row=await tx.projectShipment.create({data:{...data,...link,id,companyId:cid(req),projectId:p.id,number:"VS-"+id.slice(0,13).toUpperCase()}});
    await tx.auditLog.create({data:{companyId:cid(req),userId:uid(req),action:"SHIPMENT_CREATE",resource:"shipment:"+row.id,meta:{after:snapshot(row)}}});return row;
   });res.status(201).json({ok:true,item:dto(item)});
  }catch(e){fail(res,e);}
 });
 router.put("/:id",async(req:any,res)=>{
  try{
   const old=await prisma.projectShipment.findFirst({where:{id:req.params.id,companyId:cid(req)}});
   const p=old?await project(req,old.projectId):null;if(!old||!p)return res.status(404).json({ok:false,error:"Sendung nicht verfügbar."});
   const data=shipmentInput(req.body);await links(req,p.id,data);const link=await source(p,data);
   const row=await prisma.$transaction(async tx=>{
    await tx.$queryRawUnsafe('SELECT id FROM "ProjectShipment" WHERE id = $1 FOR UPDATE',old.id);
    const current=await tx.projectShipment.findUnique({where:{id:old.id}});
    if(!current||!Number.isSafeInteger(req.body.revision)||current.revision!==req.body.revision)throw new Error("SHIPMENT_CONFLICT");
    if(!["Entwurf","Geplant"].includes(current.status))throw new InputError("Versendete und geschlossene Angaben sind inhaltlich gesperrt.");
    if(current.status==="Geplant"){readyForShipment(data);if(!data.plannedDate)throw new InputError("Geplantes Versanddatum erforderlich.");}
    const item=await tx.projectShipment.update({where:{id:current.id},data:{...data,...link,revision:{increment:1}}});
    await tx.auditLog.create({data:{companyId:cid(req),userId:uid(req),action:"SHIPMENT_UPDATE",resource:"shipment:"+item.id,meta:{before:snapshot(current),after:snapshot(item)}}});return item;
   });res.json({ok:true,item:dto(row)});
  }catch(e){fail(res,e);}
 });
 router.post("/:id/transition",async(req:any,res)=>{
  try{
   const old=await prisma.projectShipment.findFirst({where:{id:req.params.id,companyId:cid(req)}}),p=old?await project(req,old.projectId):null;
   if(!old||!p)return res.status(404).json({ok:false,error:"Sendung nicht verfügbar."});
   const b=req.body||{};
   const receiptId = b.receiptDocumentId; if(receiptId!==undefined&&receiptId!==null&&typeof receiptId!=="string")throw new InputError("Zustellbeleg ungültig.");
   if(receiptId)await links(req,p.id,{documentId:receiptId});
   const item=await prisma.$transaction(async tx=>{
    await tx.$queryRawUnsafe('SELECT id FROM "ProjectShipment" WHERE id = $1 FOR UPDATE',old.id);
    const current=await tx.projectShipment.findUnique({where:{id:old.id}});
    if(!current||!Number.isSafeInteger(b.revision)||b.revision!==current.revision)throw new Error("SHIPMENT_CONFLICT");
    const data=shipmentAction(current,b);
    if(["plan","dispatch"].includes(b.action)&&current.deliveryKey){
     const link=await source(p,current);if(link.sourceHash!==current.sourceHash)throw new Error("SHIPMENT_CONFLICT");
    }
    const row=await tx.projectShipment.update({where:{id:current.id},data:{...data,revision:{increment:1},...(b.action==="dispatch"?{dispatchedBy:uid(req)}:b.action==="deliver"?{deliveredBy:uid(req)}:{})}});
    await tx.auditLog.create({data:{companyId:cid(req),userId:uid(req),action:"SHIPMENT_"+String(b.action).toUpperCase(),resource:"shipment:"+row.id,meta:{before:snapshot(current),after:snapshot(row),eventDate:b.date||berlinToday(),reason:typeof b.reason==="string"?b.reason.trim():""}}});return row;
   });res.json({ok:true,item:dto(item)});
  }catch(e){fail(res,e);}
 });
 return router;
}

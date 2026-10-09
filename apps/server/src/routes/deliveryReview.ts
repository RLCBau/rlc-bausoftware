import {allocationInput,reconciliation} from "../domain/deliveryReconciliation";

import {Prisma} from "@prisma/client";
import {Router} from "express";
import {prisma} from "../lib/prisma";
import {InputError} from "../domain/officeAddons";
import {ledgerText} from "../domain/recurringLedger";
import {deliveryList,deliverySource,orderFingerprint} from "../services/deliveryAccounting";
export default function deliveryReviewRouter(context:(req:any)=>Promise<any>){
 const router=Router();
 function fail(res:any,e:any){
  if(e?.message==="DELIVERY_REVIEW_CONFLICT"||e?.code==="P2002")return res.status(409).json({ok:false,error:"Lieferscheinprüfung wurde geändert. Bitte neu laden."});
  if(e instanceof InputError)return res.status(400).json({ok:false,error:e.message});
  if(["PROJECT_FORBIDDEN","COMPANY_REQUIRED"].includes(e?.message))return res.status(403).json({ok:false,error:e.message});
  console.error("[delivery-review]",e?.name||e?.code);res.status(500).json({ok:false,error:"Lieferscheinprüfung fehlgeschlagen."});
 }
 router.get("/",async(req:any,res)=>{
  try{
   const {project,accounting}=await context(req);
   const [source,reviews,bills,orders]=await Promise.all([
    deliveryList(project),prisma.deliveryReview.findMany({where:{projectId:project.id,companyId:project.companyId},include:{order:{include:{lines:true}}}}),
    prisma.vendorBill.findMany({where:{accountingId:accounting.id},select:{id:true,number:true,status:true,data:true}}),
    prisma.companyPurchaseOrder.findMany({where:{companyId:project.companyId,projectId:{in:[project.id,project.code]}},include:{lines:true},orderBy:{updatedAt:"desc"}})
   ]);
   const map=new Map(reviews.map(r=>[r.deliveryKey,r]));
   const items=source.items.map(n=>{
    const review=map.get(n.key);
    return {...n,review:review?{...review,sourceChanged:review.sourceHash!==n.sourceHash,orderChanged:review.orderId?orderFingerprint(review.order)!==orderFingerprint(review.orderSnapshot):false}:null,
     invoices:bills.filter(b=>(b.data as any)?.deliveryNoteKey===n.key).map(({data,...b})=>b)};
   });
   res.json({ok:true,items,orders:orders.map(o=>({...o,orderHash:orderFingerprint(o),reconciliation:reconciliation(o,reviews,source.items,orderFingerprint)})),unreadable:source.unreadable});
  }catch(e){fail(res,e);}
 });
 router.put("/",async(req:any,res)=>{
  try{
   const {project}=await context(req),b=req.body||{},note=await deliverySource(project,b.deliveryKey);
   if(b.sourceHash!==note.sourceHash)throw new Error("DELIVERY_REVIEW_CONFLICT");
   if(!Number.isSafeInteger(b.revision)||b.revision<0)throw new Error("DELIVERY_REVIEW_CONFLICT");
   if(!["IN_PRUEFUNG","GEKLAERT","REKLAMATION"].includes(b.status))throw new InputError("Prüfstatus ungültig.");
   if(typeof b.supplierConfirmed!=="boolean"||typeof b.quantityConfirmed!=="boolean")throw new InputError("Lieferanten- und Mengenprüfung erforderlich.");
   const notes=ledgerText(b.notes,"Prüfvermerk",5000),orderId=ledgerText(b.orderId,"Bestellung",100)||null;
   if(b.status==="GEKLAERT"&&(!b.supplierConfirmed||!b.quantityConfirmed))throw new InputError("Lieferant und Mengen vor Abschluss prüfen.");
   if(b.status==="REKLAMATION"&&!notes)throw new InputError("Reklamationsgrund erforderlich.");
   const item=await prisma.$transaction(async tx=>{
    await tx.$queryRawUnsafe('SELECT id FROM "Project" WHERE id = $1 FOR UPDATE',project.id);
    const old=await tx.deliveryReview.findUnique({where:{projectId_deliveryKey:{projectId:project.id,deliveryKey:note.key}}});
    if((old?.revision||0)!==b.revision)throw new Error("DELIVERY_REVIEW_CONFLICT");
    if(orderId)await tx.$queryRawUnsafe('SELECT id FROM "CompanyPurchaseOrder" WHERE id = $1 FOR UPDATE',orderId);
    const order=orderId?await tx.companyPurchaseOrder.findFirst({where:{id:orderId,companyId:project.companyId,projectId:{in:[project.id,project.code]}},include:{lines:true}}):null;
    if(order && b.orderHash!==orderFingerprint(order))throw new Error("DELIVERY_REVIEW_CONFLICT");
    if(orderId&&!order)throw new InputError("Bestellung gehört nicht zu diesem Projekt.");
    const previous=old && old.orderId===orderId && old.sourceHash===note.sourceHash && orderFingerprint(old.orderSnapshot)===orderFingerprint(order) ? old.allocations:[];
    const allocations=allocationInput(b.allocations===undefined?previous:b.allocations,note,order);
    const data={allocations,companyId:project.companyId,projectId:project.id,deliveryKey:note.key,sourceHash:note.sourceHash,orderId,
     orderSnapshot:order?JSON.parse(JSON.stringify(order)):Prisma.JsonNull,status:b.status,supplierConfirmed:b.supplierConfirmed,
     quantityConfirmed:b.quantityConfirmed,notes:notes||null,
     reviewedBy:b.status==="GEKLAERT"?String(req.auth?.sub||req.auth?.userId||""):null,reviewedAt:b.status==="GEKLAERT"?new Date():null};
    const current=await deliverySource(project,b.deliveryKey);
    if(current.sourceHash!==note.sourceHash)throw new Error("DELIVERY_REVIEW_CONFLICT");
    const row=old?await tx.deliveryReview.update({where:{id:old.id},data:{...data,revision:{increment:1}}}):await tx.deliveryReview.create({data});
    await tx.auditLog.create({data:{companyId:project.companyId,userId:String(req.auth?.sub||req.auth?.userId||""),action:"DELIVERY_REVIEW_SAVE",resource:"delivery-review:"+row.id,
     meta:{before:old?JSON.parse(JSON.stringify(old)):null,after:JSON.parse(JSON.stringify(row)),deliverySnapshot:note}}});
    return row;
   });
   res.json({ok:true,item});
  }catch(e){fail(res,e);}
 });
 router.get("/history",async(req:any,res)=>{
  try{
   const {project}=await context(req),note=await deliverySource(project,req.query.deliveryKey);
   const row=await prisma.deliveryReview.findUnique({where:{projectId_deliveryKey:{projectId:project.id,deliveryKey:note.key}}});
   const items=row?await prisma.auditLog.findMany({where:{companyId:project.companyId,resource:"delivery-review:"+row.id},orderBy:{createdAt:"desc"},take:100,select:{id:true,action:true,createdAt:true,userId:true,meta:true}}):[];
   res.json({ok:true,items});
  }catch(e){fail(res,e);}
 });
 return router;
}

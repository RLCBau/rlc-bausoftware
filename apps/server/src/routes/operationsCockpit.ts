import {Router} from "express";
import {prisma} from "../lib/prisma";
import {InputError} from "../domain/officeAddons";
import {berlinToday} from "../domain/machineUsage";
import {operationsCard} from "../domain/operationsCockpit";
export default function cockpitRouter(deps:{cid:(req:any)=>string;project:(req:any,token:any)=>Promise<any>}){
 const router=Router();
 router.get("/",async(req:any,res)=>{
  try{
   const p=await deps.project(req,req.query.projectId);if(!p)return res.status(404).json({ok:false,error:"Projekt nicht verfügbar."});
   const companyId=deps.cid(req),where={companyId,projectId:p.id},today=berlinToday(),end=new Date(today+"T00:00:00Z");end.setUTCDate(end.getUTCDate()+6);const through=end.toISOString().slice(0,10);
   const queries:Record<string,()=>Promise<any[]>>={
    guarantees:()=>prisma.projectGuarantee.findMany({where:{...where,status:{notIn:["Archiviert","Zurückgegeben"]}},select:{id:true,title:true,status:true,validFrom:true,validUntil:true}}),
    certificates:()=>prisma.contractCertificate.findMany({where:{...where,status:{not:"Archiviert"}},select:{id:true,title:true,status:true,validFrom:true,validUntil:true}}),
    bids:()=>prisma.projectBid.findMany({where:{...where,status:{not:"Archiviert"}},select:{id:true,title:true,status:true,awardedAt:true}}),
    releases:()=>prisma.machineRelease.findMany({where:{...where,status:{in:["Entwurf","Gemeldet"]}},select:{id:true,status:true,releaseDate:true,machine:{select:{name:true}}}}),
    usage:()=>prisma.machineUsageEntry.findMany({where:{...where,status:"Entwurf"},select:{id:true,status:true,activity:true,date:true}}),
    shipments:()=>prisma.projectShipment.findMany({where:{...where,status:{notIn:["Zugestellt","Storniert"]}},select:{id:true,title:true,number:true,status:true,plannedDate:true,expectedDate:true}}),
    planning:()=>prisma.resourceAssignment.findMany({where:{companyId,projectId:{in:[p.id,p.code]},date:{gte:new Date(today+"T00:00:00Z"),lt:new Date(end.getTime()+86400000)}},select:{id:true,date:true,resourceType:true}}),
    recurring:()=>prisma.recurringLedgerTemplate.findMany({where:{active:true,accounting:{projectId:p.id,project:{companyId}}},select:{id:true,title:true,startDate:true,endDate:true,frequency:true,occurrences:{select:{date:true}}}})
   };
   const entries=Object.entries(queries),results=await Promise.allSettled(entries.map(async([key,read])=>operationsCard(key,await read(),today,through)));
   const cards=results.map((r,i)=>r.status==="fulfilled"?r.value:{key:entries[i][0],available:false,total:null,attention:null,open:null,items:[],error:"Bereich konnte nicht ausgewertet werden."});
   res.json({ok:true,project:p,today,asOf:new Date().toISOString(),cards});
  }catch(e:any){if(e instanceof InputError)return res.status(400).json({ok:false,error:e.message});console.error("[operations-cockpit]",e?.code||e?.name);res.status(500).json({ok:false,error:"Cockpit konnte nicht geladen werden."});}
 });
 return router;
}

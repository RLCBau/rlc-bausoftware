import { PrismaClient } from '@prisma/client';
import { calculateAutonomousUrkalkulation } from '../kalkulation/autonomous/autonomousUrkalkulationEngine';
async function main(){
 const prisma=new PrismaClient();
 const ctx:any={projectType:'Tiefbau',trade:'Tiefbau',difficulty:'medium',logisticsRisk:'medium',trafficRisk:'medium',durationRisk:'medium',marketFactor:1,distanceFactor:1,confidence:.9,warnings:[]};
 const rows:any[]=await prisma.lVPosition.findMany({where:{x84UnitPrice:{gt:0}},include:{lv:{include:{project:true}}},orderBy:[{position:'asc'}]});
 let n=0;
 for(const p of rows){
   const row:any={posNr:p.position,kurztext:p.kurztext,langtext:p.langtext||'',einheit:p.einheit,menge:Number(p.menge),x84UnitPrice:Number(p.x84UnitPrice||0)};
   const res:any=calculateAutonomousUrkalkulation(row,ctx,[row]);
   if(res && Number(res.unitPrice)>0) continue;
   console.log('ZERO|'+JSON.stringify({project:p.lv.project.name,pos:p.position,kurz:p.kurztext,unit:p.einheit,qty:Number(p.menge),x84:Number(p.x84UnitPrice),family:res?.leistungsart||null,warnings:res?.warnings||[],lang:(p.langtext||'').slice(0,900)}));
   if(++n>=40) break;
 }
 await prisma.$disconnect();
}
main().catch(e=>{console.error(e);process.exit(1)});

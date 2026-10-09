import { PrismaClient } from '@prisma/client';
import { calculateAutonomousUrkalkulation as calc } from './kalkulation/autonomous/autonomousUrkalkulationEngine';
const prisma=new PrismaClient();
const ctx:any={projectType:'Tiefbau',trade:'Tiefbau',difficulty:'medium',logisticsRisk:'medium',trafficRisk:'medium',durationRisk:'medium',marketFactor:1,distanceFactor:1,bgkRate:0,profitRate:0,confidence:0.9,warnings:[]};
const norm=(s:string)=>String(s||'').toLowerCase().replace(/[0-9]+([.,][0-9]+)?/g,'#').replace(/[^a-zäöüß#]+/g,' ').replace(/\s+/g,' ').trim().slice(0,180);
(async()=>{
 const projects=await prisma.project.findMany({select:{code:true,lvSets:{take:1,orderBy:{version:'desc'},select:{positions:{select:{position:true,kurztext:true,langtext:true,einheit:true,menge:true,x84UnitPrice:true}}}}}});
 let all=0,textRows=0,resolved=0,unresolved=0;
 const gaps:Record<string,{count:number,units:Record<string,number>,examples:any[]}>= {};
 const trades:Record<string,number>={};
 for(const project of projects){
  const dbRows=project.lvSets[0]?.positions||[];
  const allRows:any[]=dbRows.map((r:any)=>({posNr:r.position,kurztext:r.kurztext,langtext:r.langtext||'',einheit:r.einheit,menge:Number(r.menge)}));
  for(let i=0;i<dbRows.length;i++){
   const row:any=dbRows[i],input=allRows[i]; all++;
   const raw=String(row.kurztext||row.langtext||'').trim(); if(!raw) continue; textRows++;
   const x:any=calc(input,ctx,allRows); const ep=Number(x?.unitPrice||0);
   if(ep>0){resolved++; continue;}
   unresolved++;
   const trade=String(x?.trade||'UNRESOLVED'); trades[trade]=(trades[trade]||0)+1;
   const key=norm(raw); const e=gaps[key]||(gaps[key]={count:0,units:{},examples:[]});
   e.count++; const u=String(row.einheit||''); e.units[u]=(e.units[u]||0)+1;
   if(e.examples.length<3)e.examples.push({project:project.code,pos:row.position,unit:row.einheit,text:raw.slice(0,260),x84:row.x84UnitPrice===null?null:Number(row.x84UnitPrice)});
  }
 }
 console.log(JSON.stringify({all,textRows,resolved,unresolved,trades:Object.entries(trades).sort((a:any,b:any)=>b[1]-a[1]).slice(0,20),top:Object.entries(gaps).sort((a:any,b:any)=>b[1].count-a[1].count).slice(0,30)},null,2));
 await prisma.$disconnect();
})().catch(async e=>{console.error(e);await prisma.$disconnect();process.exit(1)});
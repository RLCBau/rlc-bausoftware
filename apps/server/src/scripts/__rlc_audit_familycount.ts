import { PrismaClient } from '@prisma/client';
import { calculateAutonomousUrkalkulation as calc } from '../kalkulation/autonomous/autonomousUrkalkulationEngine';
const prisma=new PrismaClient();
const ctx:any={projectType:'Tiefbau',trade:'Tiefbau',difficulty:'medium',logisticsRisk:'medium',trafficRisk:'medium',durationRisk:'medium',marketFactor:1,distanceFactor:1,bgkRate:0,profitRate:0,confidence:0.9,warnings:[]};
const norm=(s:string)=>String(s||'').toLowerCase().replace(/[0-9]+([.,][0-9]+)?/g,'#').replace(/[^a-zäöüß#]+/g,' ').replace(/\s+/g,' ').trim().slice(0,160);
(async()=>{
 const projects=await prisma.project.findMany({select:{code:true,lvSets:{take:1,orderBy:{version:'desc'},select:{positions:{select:{id:true,position:true,kurztext:true,langtext:true,einheit:true,menge:true,x84UnitPrice:true}}}}}});
 const families:Record<string,number>={},gaps:Record<string,any>={},status:Record<string,number>={}; let all=0,textRows=0,resolved=0,unresolved=0,x84=0;
 for(const project of projects){
   const dbRows=project.lvSets[0]?.positions||[];
   const allRows:any[]=dbRows.map((r:any)=>({id:r.id,posNr:r.position,kurztext:r.kurztext,langtext:r.langtext||'',einheit:r.einheit,menge:Number(r.menge)}));
   for(let i=0;i<dbRows.length;i++){
     const row:any=dbRows[i]; const input=allRows[i]; all++; const raw=String(row.kurztext||row.langtext||'').trim(); if(!raw)continue; textRows++; if(row.x84UnitPrice!==null)x84++;
     const x:any=calc(input,ctx,allRows); const ep=Number(x?.unitPrice||0),art=String(x?.leistungsart||'UNRESOLVED'),trade=String(x?.trade||'UNRESOLVED');
     status[String(x?.calculationStatus||'unresolved')]=(status[String(x?.calculationStatus||'unresolved')]||0)+1; families[`${trade} / ${art}`]=(families[`${trade} / ${art}`]||0)+1;
     if(ep>0)resolved++; else {unresolved++; const key=norm(raw); const e=gaps[key]||(gaps[key]={count:0,x84:0,examples:[]}); e.count++; if(row.x84UnitPrice!==null)e.x84++; if(e.examples.length<2)e.examples.push({project:project.code,pos:row.position,unit:row.einheit,text:raw.slice(0,220),x84:row.x84UnitPrice===null?null:Number(row.x84UnitPrice)});}
   }
 }
 console.log(JSON.stringify({allLatestRows:all,textRows,blankRows:all-textRows,x84TextRows:x84,resolved,unresolved,status,familyCount:Object.keys(families).length,topFamilies:Object.entries(families).sort((a:any,b:any)=>b[1]-a[1]).slice(0,80),topMissingFamilies:Object.entries(gaps).sort((a:any,b:any)=>b[1].count-a[1].count).slice(0,120)},null,2)); await prisma.$disconnect();
})().catch(async e=>{console.error(e);await prisma.$disconnect();process.exit(1)});

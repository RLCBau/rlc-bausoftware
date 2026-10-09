import { PrismaClient } from '@prisma/client';
import { calculateAutonomousUrkalkulation as calc } from '../kalkulation/autonomous/autonomousUrkalkulationEngine';
const prisma=new PrismaClient();
const ctx:any={projectType:'Tiefbau',trade:'Tiefbau',difficulty:'medium',logisticsRisk:'medium',trafficRisk:'medium',durationRisk:'medium',marketFactor:1,distanceFactor:1,confidence:.9,warnings:[]};
const norm=(s:string)=>String(s||'').toLowerCase().replace(/[0-9]+([.,][0-9]+)?/g,'#').replace(/[^a-zäöüß#]+/g,' ').replace(/\s+/g,' ').trim().slice(0,160);
const parts=(s:any)=>(String(s??'').match(/\d+/g)||[]).map(Number);
const cmp=(a:any,b:any)=>{const A=parts(a.posNr),B=parts(b.posNr),m=Math.max(A.length,B.length);for(let i=0;i<m;i++){const x=A[i]??-1,y=B[i]??-1;if(x!==y)return x-y}return String(a.posNr).localeCompare(String(b.posNr),'de')};
(async()=>{
 const projects=await prisma.project.findMany({select:{code:true,lvSets:{take:1,orderBy:{version:'desc'},select:{positions:{select:{id:true,position:true,kurztext:true,langtext:true,einheit:true,menge:true,x84UnitPrice:true}}}}}});
 const families:Record<string,number>={},zeroFamilies:Record<string,any>={},gaps:Record<string,any>={},status:Record<string,number>={}; let all=0,textRows=0,resolved=0,unresolved=0,x84=0;
 for(const project of projects){
   const rows:any[]=(project.lvSets[0]?.positions||[]).map(r=>({id:r.id,posNr:r.position,kurztext:r.kurztext,langtext:r.langtext||'',einheit:r.einheit,menge:Number(r.menge),x84UnitPrice:r.x84UnitPrice==null?null:Number(r.x84UnitPrice)})).sort(cmp);
   for(const row of rows){all++;const raw=String(row.kurztext||row.langtext||'').trim(); if(!raw)continue;textRows++;if(row.x84UnitPrice!==null)x84++;
     const out:any=calc(row,ctx,rows); const ep=Number(out?.unitPrice||0),art=String(out?.leistungsart||'UNRESOLVED'),trade=String(out?.trade||'UNRESOLVED'); const st=String(out?.calculationStatus||'unresolved'); status[st]=(status[st]||0)+1; families[`${trade} / ${art}`]=(families[`${trade} / ${art}`]||0)+1;
     if(ep>0)resolved++; else {unresolved++; const fk=`${trade} / ${art} / ${row.einheit||''}`; const z=zeroFamilies[fk]||(zeroFamilies[fk]={count:0,examples:[]}); z.count++; if(z.examples.length<5)z.examples.push(raw.slice(0,180)); const key=norm(raw);const e=gaps[key]||(gaps[key]={count:0,x84:0,examples:[]});e.count++;if(row.x84UnitPrice!==null)e.x84++;if(e.examples.length<2)e.examples.push({project:project.code,pos:row.posNr,unit:row.einheit,text:raw.slice(0,220),x84:row.x84UnitPrice});}
   }
 }
 console.log(JSON.stringify({allLatestRows:all,textRows,blankRows:all-textRows,x84TextRows:x84,resolved,unresolved,status,topFamilies:Object.entries(families).sort((a:any,b:any)=>b[1]-a[1]).slice(0,80),topZeroFamilies:Object.entries(zeroFamilies).sort((a:any,b:any)=>b[1].count-a[1].count).slice(0,120),topMissingFamilies:Object.entries(gaps).sort((a:any,b:any)=>b[1].count-a[1].count).slice(0,120)},null,2)); await prisma.$disconnect();
})().catch(async e=>{console.error(e);await prisma.$disconnect();process.exit(1)});

import { PrismaClient } from '@prisma/client';
import { calculateAutonomousUrkalkulation as calc } from '../kalkulation/autonomous/autonomousUrkalkulationEngine';
import { calcRecipeKalkulationRow } from '../kalkulation/kalkulationsRecipeEngine';
const prisma=new PrismaClient();
const ctx:any={projectType:'Tiefbau',trade:'Tiefbau',difficulty:'medium',logisticsRisk:'medium',trafficRisk:'medium',durationRisk:'medium',marketFactor:1,distanceFactor:1,confidence:.9,warnings:[]};
(async()=>{
 const projects=await prisma.project.findMany({select:{code:true,companyId:true,lvSets:{take:1,orderBy:{version:'desc'},select:{positions:{select:{position:true,kurztext:true,langtext:true,einheit:true,menge:true}}}}}});
 const zeros:any[]=[];
 for(const p of projects){const rows:any[]=(p.lvSets[0]?.positions||[]).map(r=>({posNr:r.position,kurztext:r.kurztext,langtext:r.langtext||'',einheit:r.einheit,menge:Number(r.menge)}));for(const row of rows){const a:any=calc(row,ctx,rows);if(!(Number(a?.unitPrice||0)>0)&&String(row.kurztext||row.langtext||'').trim())zeros.push({p,row});}}
 let checked=0,positiveAny=0,resolvedRecipe=0;const sources:Record<string,number>={};const examples:any[]=[];
 for(let i=0;i<zeros.length;i+=30){const batch=zeros.slice(i,i+30);const outs=await Promise.all(batch.map(async({p,row})=>{try{return await calcRecipeKalkulationRow(row,{companyId:p.companyId,projectCode:p.code});}catch{return null;}}));
 for(let j=0;j<outs.length;j++){const o:any=outs[j];checked++;const ep=Number(o?.finalUnitPrice||o?.suggestedUnitPrice||o?.rlcKiUnitPrice||0);if(ep>0)positiveAny++;if(o?.source==='recipe'&&o?.resourceResolutionStatus==='RESOLVED'&&ep>0)resolvedRecipe++;const src=String(o?.source||'null');sources[src]=(sources[src]||0)+1;if(examples.length<20&&ep>0)examples.push({text:batch[j].row.kurztext,unit:batch[j].row.einheit,ep,source:src,status:o?.resourceResolutionStatus});}}
 console.log(JSON.stringify({sample:zeros.length,checked,positiveAny,resolvedRecipe,rateAny:positiveAny/Math.max(1,checked),rateResolvedRecipe:resolvedRecipe/Math.max(1,checked),sources,examples},null,2));
 await prisma.$disconnect();
})().catch(async e=>{console.error(e);await prisma.$disconnect();process.exit(1)});
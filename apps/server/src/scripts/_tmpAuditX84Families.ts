import { PrismaClient } from '@prisma/client';
import { calculateAutonomousUrkalkulation } from '../kalkulation/autonomous/autonomousUrkalkulationEngine';
async function main(){
const prisma=new PrismaClient();
const ctx:any={projectType:'Tiefbau',trade:'Tiefbau',difficulty:'medium',logisticsRisk:'medium',trafficRisk:'medium',durationRisk:'medium',marketFactor:1,distanceFactor:1,confidence:.9,warnings:[]};
const rows:any[]=await prisma.lVPosition.findMany({where:{x84UnitPrice:{gt:0}},include:{lv:{include:{project:true}}}});
const agg=new Map<string,{n:number,abs:number,sumPct:number,gt10:number,gt25:number,gt50:number,samples:any[]}>();
let ok=0,zero=0;
for(const p of rows){
 const row:any={posNr:p.position,kurztext:p.kurztext,langtext:p.langtext||'',einheit:p.einheit,menge:Number(p.menge),x84UnitPrice:Number(p.x84UnitPrice||0)};
 const res:any=calculateAutonomousUrkalkulation(row,ctx,[row]);
 if(!res || !(Number(res.unitPrice)>0)){zero++;continue}
 ok++;
 const x=Number(p.x84UnitPrice), r=Number(res.unitPrice), pct=((r-x)/x)*100, ap=Math.abs(pct), fam=String(res.leistungsart||'UNKNOWN');
 const a=agg.get(fam)||{n:0,abs:0,sumPct:0,gt10:0,gt25:0,gt50:0,samples:[]};
 a.n++;a.abs+=ap;a.sumPct+=pct;if(ap>10)a.gt10++;if(ap>25)a.gt25++;if(ap>50)a.gt50++;
 if(a.samples.length<4 && ap>25)a.samples.push({project:p.lv.project.name,pos:p.position,text:p.kurztext,x84:x,rlc:r,pct:Number(pct.toFixed(1))});
 agg.set(fam,a);
}
console.log('X84_AUDIT|ROWS='+rows.length+'|CALC_OK='+ok+'|ZERO='+zero+'|FAMILIES='+agg.size);
const out=[...agg.entries()].map(([family,a])=>({family,...a,meanAbs:a.abs/a.n,bias:a.sumPct/a.n})).sort((a,b)=>b.gt50-a.gt50||b.meanAbs-a.meanAbs||b.n-a.n);
for(const a of out.slice(0,120)){
 console.log(['FAMILY',a.n,a.gt10,a.gt25,a.gt50,a.meanAbs.toFixed(1),a.bias.toFixed(1),a.family].join('|'));
 for(const s of a.samples) console.log('SAMPLE|'+JSON.stringify(s));
}
await prisma.$disconnect();
}
main().catch(e=>{console.error(e);process.exit(1)});

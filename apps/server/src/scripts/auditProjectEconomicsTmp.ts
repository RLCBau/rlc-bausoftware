import fs from "fs";
import { calculateAutonomousUrkalkulation } from "../kalkulation/autonomous/autonomousUrkalkulationEngine";
const ctx:any={projectType:"Tiefbau",trade:"Tiefbau",difficulty:"medium",logisticsRisk:"medium",trafficRisk:"medium",durationRisk:"medium",marketFactor:1,distanceFactor:1,confidence:0.9,warnings:[]};
function run(code:string,file:string){
 const lines=fs.readFileSync(file,"utf8").trim().split(/\n/).filter(Boolean);
 const rows=lines.map(l=>{const [position,kurztext,langtext,einheit,menge]=l.split("\t");return {posNr:position,kurztext,langtext,einheit,menge:Number(menge||0)}});
 const out:any[]=[];
 for(const row of rows){
   const x:any=calculateAutonomousUrkalkulation(row as any,ctx,rows as any[]);
   if(!x) continue;
   const ep=Number(x.unitPrice||0), qty=Number(row.menge||0), total=ep*qty;
   out.push({pos:row.posNr,text:row.kurztext,unit:row.einheit,qty,ep,total,trade:x.trade,art:x.leistungsart,conf:x.confidence});
 }
 out.sort((a,b)=>b.total-a.total);
 console.log("\nTOP_TOTAL|"+code);
 for(const x of out.slice(0,35)) console.log([x.total.toFixed(2),x.ep.toFixed(2),x.qty,x.unit,x.pos,x.trade,x.art,x.text].join("|"));
 console.log("\nTOP_EP|"+code);
 for(const x of [...out].sort((a,b)=>b.ep-a.ep).slice(0,30)) console.log([x.ep.toFixed(2),x.qty,x.unit,x.pos,x.trade,x.art,x.text].join("|"));
}
run("BA-2026-028","/tmp/ba028.tsv");
run("BA-2026-001","/tmp/ba001.tsv");

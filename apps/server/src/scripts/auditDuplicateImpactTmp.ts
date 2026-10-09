import * as fs from "fs";
import {calculateAutonomousUrkalkulation} from "../kalkulation/autonomous/autonomousUrkalkulationEngine";
const ctx:any={projectType:"Tiefbau",trade:"Tiefbau",difficulty:"medium",logisticsRisk:"medium",trafficRisk:"medium",durationRisk:"medium",marketFactor:1,distanceFactor:1,confidence:0.9,warnings:[]};
const norm=(s:string)=>s.toLowerCase().replace(/\s+/g," ").trim();
for(const [code,path] of [["BA002","/tmp/ba002.psv"],["BA003","/tmp/ba003.psv"]] as const){
 const rows=fs.readFileSync(path,"utf8").trim().split(/\r?\n/).map(l=>{const p=l.split("|");return {posNr:p[0],kurztext:p[1]||"",langtext:p[2]||"",einheit:p[3]||"",menge:Number(p[4]||0)}})
 const groups=new Map<string,any[]>();
 for(const row of rows){const k=[norm(row.kurztext),norm(row.langtext),norm(row.einheit)].join("|");const a=groups.get(k)||[];a.push(row);groups.set(k,a)}
 let extra=0, allDup=0;
 const gs=[...groups.values()].filter(a=>a.length>1);
 for(const a of gs){
   const calc=a.map(row=>{const x:any=calculateAutonomousUrkalkulation(row as any,ctx,rows as any[]);return {...row,ep:Number(x?.unitPrice||0),sum:Number(x?.unitPrice||0)*row.menge}});
   const subtotal=calc.reduce((s,x)=>s+x.sum,0);
   const keep=Math.max(...calc.map(x=>x.sum));
   extra += subtotal-keep; allDup += subtotal;
   console.log(["DUP",code,"COUNT="+calc.length,"SUB="+subtotal.toFixed(2),"EXTRA_IF_KEEP_MAX="+(subtotal-keep).toFixed(2),...calc.map(x=>x.posNr+":"+x.menge+"x"+x.ep.toFixed(2)+"="+x.sum.toFixed(2))].join("|"));
 }
 console.log(`DUP_SUM|${code}|GROUPS=${gs.length}|ALL_DUP_SUM=${allDup.toFixed(2)}|EXTRA_IF_KEEP_ONE=${extra.toFixed(2)}`);
}

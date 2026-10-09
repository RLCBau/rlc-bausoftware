import * as fs from "fs";
import { calculateAutonomousUrkalkulation } from "../kalkulation/autonomous/autonomousUrkalkulationEngine";
const ctx:any={projectType:"Tiefbau",trade:"Tiefbau",difficulty:"medium",logisticsRisk:"medium",trafficRisk:"medium",durationRisk:"medium",marketFactor:1,distanceFactor:1,confidence:0.9,warnings:[]};
for(const [code,path] of [["BA-2026-002","/tmp/ba002.psv"],["BA-2026-003","/tmp/ba003.psv"]] as const){
 const rows=fs.readFileSync(path,"utf8").trim().split(/\r?\n/).map(l=>{const p=l.split("|");return {posNr:p[0],kurztext:p[1]||"",langtext:p[2]||"",einheit:p[3]||"",menge:Number(p[4]||0)}})
 const m=new Map<string,number>();
 let total=0;
 for(const row of rows){
  const x:any=calculateAutonomousUrkalkulation(row as any,ctx,rows as any[]);
  const sum=Number(x?.unitPrice||0)*row.menge;
  total+=sum;
  const k=String(x?.trade||"NULL");
  m.set(k,(m.get(k)||0)+sum);
 }
 console.log("TRADE_SUM|"+code+"|TOTAL="+total.toFixed(2));
 [...m.entries()].sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log([code,k,v.toFixed(2),(v/total*100).toFixed(1)+"%"].join("|")));
}

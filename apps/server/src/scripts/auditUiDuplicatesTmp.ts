import * as fs from "fs";
import {calculateAutonomousUrkalkulation} from "../kalkulation/autonomous/autonomousUrkalkulationEngine";
const ctx:any={projectType:"Tiefbau",trade:"Tiefbau",difficulty:"medium",logisticsRisk:"medium",trafficRisk:"medium",durationRisk:"medium",marketFactor:1,distanceFactor:1,confidence:0.9,warnings:[]};
const norm=(v:string)=>v.toLowerCase().normalize("NFKD").replace(/[^a-z0-9äöüß]+/gi," ").replace(/\s+/g," ").trim();
const r2=(x:number)=>Math.round(x*100)/100;
for(const [code,path] of [["BA002","/tmp/ba002.psv"],["BA003","/tmp/ba003.psv"]] as const){
 const rows=fs.readFileSync(path,"utf8").trim().split(/\r?\n/).map(l=>{const p=l.split("|");return {posNr:p[0],kurztext:p[1]||"",langtext:p[2]||"",einheit:p[3]||"",menge:Number(p[4]||0)}})
 const map=new Map<string,any[]>();
 for(const row of rows){
  const x:any=calculateAutonomousUrkalkulation(row as any,ctx,rows as any[]);
  const ep=Number(x?.unitPrice||0);
  const text=norm(row.kurztext+" "+row.langtext).slice(0,140);
  const key=[text,row.einheit.trim().toLowerCase(),r2(row.menge),r2(ep)].join("|");
  const a=map.get(key)||[]; a.push({...row,ep,sum:ep*row.menge}); map.set(key,a);
 }
 let count=0, impact=0;
 for(const a of map.values()) if(a.length>1){
   count += a.length-1;
   impact += a.slice(1).reduce((s,x)=>s+x.sum,0);
   console.log(["UI_DUP",code,"DEL="+(a.length-1),"IMPACT="+a.slice(1).reduce((s,x)=>s+x.sum,0).toFixed(2),...a.map(x=>x.posNr+":"+x.menge+"x"+x.ep.toFixed(2))].join("|"));
 }
 console.log(`UI_DUP_SUM|${code}|DELETE_COUNT=${count}|IMPACT=${impact.toFixed(2)}`);
}

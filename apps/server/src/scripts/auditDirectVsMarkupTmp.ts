import * as fs from "fs";
import {calculateAutonomousUrkalkulation} from "../kalkulation/autonomous/autonomousUrkalkulationEngine";
const ctx:any={projectType:"Tiefbau",trade:"Tiefbau",difficulty:"medium",logisticsRisk:"medium",trafficRisk:"medium",durationRisk:"medium",marketFactor:1,distanceFactor:1,confidence:0.9,warnings:[]};
for(const [code,path,bench] of [["BA002","/tmp/ba002.psv",355000],["BA003","/tmp/ba003.psv",1071000]] as const){
 const rows=fs.readFileSync(path,"utf8").trim().split(/\r?\n/).map(l=>{const p=l.split("|");return {posNr:p[0],kurztext:p[1],langtext:p[2],einheit:p[3],menge:Number(p[4])}});
 let direct=0,bgk=0,risk=0,profit=0,total=0;
 for(const row of rows){const x:any=calculateAutonomousUrkalkulation(row as any,ctx,rows as any[]);for(const l of x?.costLines||[]){const v=Number(l.unitPrice||0)*row.menge; if(l.group==="Gemeinkosten"&&String(l.name).includes("Baustellengemeinkosten"))bgk+=v; else if(l.group==="Risiko")risk+=v; else if(l.group==="Gewinn")profit+=v; else direct+=v;} total+=Number(x?.unitPrice||0)*row.menge;}
 console.log([code,"DIRECT="+direct.toFixed(2),"BGK="+bgk.toFixed(2),"RISK="+risk.toFixed(2),"PROFIT="+profit.toFixed(2),"TOTAL="+total.toFixed(2),"BENCH="+bench,"DIRECT_DELTA="+(direct-bench).toFixed(2),"TOTAL_DELTA="+(total-bench).toFixed(2)].join("|"));
}

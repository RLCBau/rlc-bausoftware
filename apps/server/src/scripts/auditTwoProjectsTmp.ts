import * as fs from "fs";
import { calculateAutonomousUrkalkulation } from "../kalkulation/autonomous/autonomousUrkalkulationEngine";
const ctx:any={projectType:"Tiefbau",trade:"Tiefbau",difficulty:"medium",logisticsRisk:"medium",trafficRisk:"medium",durationRisk:"medium",marketFactor:1,distanceFactor:1,confidence:0.9,warnings:[]};
const generic=new Set(["Kanalbauleistung","Wasserleitungsbau","Oberflächenwiederherstellung","Oberflächenbau","Erdbau/Schüttgut","Sonderbauverfahren","Grabenloser Leitungsbau","Sicherungsleistung","Dokumentationsleistung","Entsorgungsleistung","Prüfleistung","Logistikleistung","Gasleitungsbau","Fernwärmebau","Glasfaser-Kabelbau","Kabelbau","Leitungskreuzung"]);
for(const [code,path] of [["BA-2026-002","/tmp/ba002.psv"],["BA-2026-003","/tmp/ba003.psv"]] as const){
 const rows=fs.readFileSync(path,"utf8").trim().split(/\r?\n/).map(l=>{const p=l.split("|");return {posNr:p[0],kurztext:p[1]||"",langtext:p[2]||"",einheit:p[3]||"",menge:Number(p[4]||0)}})
 let total=0,zero=0,gen=0,mismatch=0; const out:any[]=[];
 for(const row of rows){
   const x:any=calculateAutonomousUrkalkulation(row as any,ctx,rows as any[]);
   const ep=Number(x?.unitPrice||0), sum=ep*row.menge, pb=(x?.costLines||[]).reduce((s:number,l:any)=>s+Number(l.unitPrice||0),0);
   total+=sum;
   if(!(ep>0))zero++;
   if(!x||generic.has(String(x?.leistungsart||"")))gen++;
   if(ep>0 && Math.abs(pb*1.23-ep)>0.20 && Math.abs(pb-ep)>0.20)mismatch++;
   out.push({...row,ep,sum,trade:x?.trade||"",art:x?.leistungsart||"",lines:x?.costLines||[]});
 }
 out.sort((a,b)=>b.sum-a.sum);
 console.log(`PROJECT|${code}|POSITIONS=${rows.length}|TOTAL=${total.toFixed(2)}|ZERO=${zero}|GENERIC=${gen}|MISMATCH=${mismatch}`);
 for(const x of out.slice(0,35)) console.log(["TOP",code,x.posNr,x.kurztext,x.menge,x.einheit,x.ep.toFixed(2),x.sum.toFixed(2),x.trade,x.art].join("|"));
 for(const x of out.filter(x=>x.ep===0).slice(0,80)) console.log(["ZERO",code,x.posNr,x.kurztext,x.einheit,x.trade,x.art].join("|"));
}

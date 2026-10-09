import * as fs from "fs";
import { calculateAutonomousUrkalkulation } from "../kalkulation/autonomous/autonomousUrkalkulationEngine";
const ctx:any={projectType:"Tiefbau",trade:"Tiefbau",difficulty:"medium",logisticsRisk:"medium",trafficRisk:"medium",durationRisk:"medium",marketFactor:1,distanceFactor:1,confidence:0.9,warnings:[]};
const generic=new Set(["Kanalbauleistung","Wasserleitungsbau","Oberflächenwiederherstellung","Oberflächenbau","Erdbau/Schüttgut","Sonderbauverfahren","Grabenloser Leitungsbau","Sicherungsleistung","Dokumentationsleistung","Entsorgungsleistung","Prüfleistung","Logistikleistung","Gasleitungsbau","Fernwärmebau","Glasfaser-Kabelbau","Kabelbau","Leitungskreuzung"]);
for(const [code,path] of [["BA-2026-002","/tmp/ba002.psv"],["BA-2026-003","/tmp/ba003.psv"]] as const){
 const rows=fs.readFileSync(path,"utf8").trim().split(/\r?\n/).map(l=>{const p=l.split("|");return {posNr:p[0],kurztext:p[1]||"",langtext:p[2]||"",einheit:p[3]||"",menge:Number(p[4]||0)}})
 const out:any[]=[];
 for(const row of rows){
  const x:any=calculateAutonomousUrkalkulation(row as any,ctx,rows as any[]);
  const ep=Number(x?.unitPrice||0), sum=ep*row.menge;
  if(!x||generic.has(String(x?.leistungsart||""))) out.push({...row,ep,sum,trade:x?.trade||"",art:x?.leistungsart||""});
 }
 out.sort((a,b)=>b.sum-a.sum);
 console.log("GENERIC_TOP|"+code+"|COUNT="+out.length+"|SUM="+out.reduce((s,x)=>s+x.sum,0).toFixed(2));
 for(const x of out.slice(0,40)) console.log(["G",code,x.posNr,x.kurztext,x.menge,x.einheit,x.ep.toFixed(2),x.sum.toFixed(2),x.trade,x.art].join("|"));
}

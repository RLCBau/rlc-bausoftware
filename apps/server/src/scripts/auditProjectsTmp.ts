import fs from "fs";
import { calculateAutonomousUrkalkulation } from "../kalkulation/autonomous/autonomousUrkalkulationEngine";
const ctx:any={projectType:"Tiefbau",trade:"Tiefbau",difficulty:"medium",logisticsRisk:"medium",trafficRisk:"medium",durationRisk:"medium",marketFactor:1,distanceFactor:1,confidence:0.9,warnings:[]};
const generic=new Set(["Kanalbauleistung","Wasserleitungsbau","Oberflächenwiederherstellung","Oberflächenbau","Erdbau/Schüttgut","Sonderbauverfahren","Grabenloser Leitungsbau","Sicherungsleistung","Dokumentationsleistung","Entsorgungsleistung","Prüfleistung","Logistikleistung","Gasleitungsbau","Fernwärmebau","Glasfaser-Kabelbau","Kabelbau","Leitungskreuzung"]);
function run(code:string,file:string){
 const lines=fs.readFileSync(file,"utf8").trim().split(/\n/).filter(Boolean);
 let total=0,zero=0,gen=0,mismatch=0; const bad:any[]=[];
 const rows=lines.map((l,i)=>{const [position,kurztext,langtext,einheit,menge]=l.split("\t"); return {posNr:position,kurztext,langtext,einheit,menge:Number(menge||0)}});
 for(const row of rows){
  const x:any=calculateAutonomousUrkalkulation(row as any,ctx,rows as any[]);
  const ep=Number(x?.unitPrice||0); const qty=Number(row.menge||0); total+=ep*qty;
  const pb=(x?.costLines||[]).reduce((s:number,l:any)=>s+Number(l.unitPrice||0),0);
  if(!(ep>0)) zero++;
  if(!x || generic.has(x.leistungsart||"")) gen++;
  if(ep>0 && Math.abs(pb*1.23-ep)>0.20 && Math.abs(pb-ep)>0.20) mismatch++;
  if(!x || !(ep>0) || generic.has(x.leistungsart||"")) bad.push({pos:row.posNr,text:row.kurztext,ep,trade:x?.trade,art:x?.leistungsart});
 }
 console.log(["PROJECT",code,"POSITIONS="+rows.length,"TOTAL="+total.toFixed(2),"ZERO="+zero,"GENERIC="+gen,"MISMATCH="+mismatch].join("|"));
 for(const b of bad.slice(0,120)) console.log("GAP|"+code+"|"+b.pos+"|"+b.ep+"|"+(b.trade||"NULL")+"|"+(b.art||"NULL")+"|"+b.text);
}
run("BA-2026-028","/tmp/ba028.tsv");
run("BA-2026-001","/tmp/ba001.tsv");

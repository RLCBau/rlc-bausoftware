import { calculateAutonomousUrkalkulation } from "../kalkulation/autonomous/autonomousUrkalkulationEngine";
import { TIEFBAU_COVERAGE_CASES } from "../kalkulation/autonomous/tiefbauCoverageCases";
const ctx:any={projectType:"Tiefbau",trade:"Tiefbau",difficulty:"medium",logisticsRisk:"medium",trafficRisk:"medium",durationRisk:"medium",marketFactor:1,distanceFactor:1,confidence:0.9,warnings:[]};
type R={text:string;unit:string;ep:number;trade:string;art:string;bau:string};
const rows:R[]=[];
for (const c of TIEFBAU_COVERAGE_CASES){
 const row:any={posNr:"A",kurztext:c.text,langtext:c.text,einheit:c.unit,menge:1};
 const r:any=calculateAutonomousUrkalkulation(row,ctx,[row]); if(!r) continue;
 rows.push({text:c.text,unit:c.unit,ep:Number(r.unitPrice||0),trade:String(r.trade||""),art:String(r.leistungsart||""),bau:String(r.bauverfahren||"")});
}
for(const unit of ["m","m²","m³","t","St","h"]){
 const a=rows.filter(x=>x.unit===unit&&x.ep>0).sort((x,y)=>y.ep-x.ep);
 console.log("\nUNIT",unit,"TOP");
 for(const x of a.slice(0,25)) console.log([x.ep.toFixed(2),x.text,x.trade,x.art].join("|"));
}

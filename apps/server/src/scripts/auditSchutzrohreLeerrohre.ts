import { calculateAutonomousUrkalkulation } from "../kalkulation/autonomous/autonomousUrkalkulationEngine";

const ctx:any={projectType:"Tiefbau",trade:"Tiefbau",difficulty:"medium",logisticsRisk:"medium",trafficRisk:"medium",durationRisk:"medium",marketFactor:1,distanceFactor:1,confidence:0.9,warnings:[]};
type C={group:string,text:string,unit:string};
const cases:C[]=[];

// Generic cable ducts: material x size x class.
for(const mat of ["PE-HD","PP","PVC-U"]){
  for(const dn of [40,50,63,75,90,110,125,160,200,250]){
    for(const cls of mat==="PE-HD"?["SDR17","SDR11"]:["SN4","SN8","SN16"]){
      cases.push({group:"KSR",text:`${mat} Kabelschutzrohr DN${dn} ${cls} liefern und verlegen`,unit:"m"});
    }
  }
}
// General protection pipes for utilities / crossings.
for(const mat of ["PE-HD","PP","PVC-U","Stahl"]){
  for(const dn of [63,90,110,160,200,250,315,400]){
    cases.push({group:"SCHUTZ",text:`${mat} Schutzrohr DN${dn} für Leitungsquerung liefern und verlegen`,unit:"m"});
  }
}
// Empty conduits.
for(const use of ["Strom","Beleuchtung","LSA","Telekommunikation"]){
  for(const mat of ["PE-HD","PP","PVC-U"]){
    for(const dn of [40,50,63,75,90,110,125,160]){
      cases.push({group:"LEER",text:`${mat} Leerrohr DN${dn} für ${use} liefern und verlegen`,unit:"m"});
    }
  }
}
// Multiple duct banks.
for(const count of [2,3,4,6,8,12]){
  for(const dn of [50,63,110,125,160]){
    cases.push({group:"VERBAND",text:`Rohrverband ${count}x DN${dn} PE-HD Kabelschutzrohre mit Abstandhaltern herstellen`,unit:"m"});
  }
}
// Operator specific.
for(const op of ["Bayernwerk","Telekom","Vodafone"]){
  for(const mat of ["PE-HD","PP","PVC-U"]){
    for(const dn of [50,63,110,125,160,200]){
      cases.push({group:"OP",text:`${op} Kabelschutzrohr ${mat} DN${dn} verlegen`,unit:"m"});
    }
  }
}
// Speedpipes and microduct bundles.
for(const od of [7,10,12,14,16,20]){
  for(const wall of [1.5,2.0]){
    cases.push({group:"SPEEDPIPE",text:`Telekom Speedpipe ${od}x${wall.toString().replace(".",",")} mm verlegen`,unit:"m"});
  }
}
for(const count of [4,7,12,24]){
  for(const od of [7,10,12,14]){
    cases.push({group:"MICRO-BUNDLE",text:`Telekom Mikrorohrverbund ${count}x${od} mm liefern und verlegen`,unit:"m"});
  }
}
// Installation variants.
for(const dn of [63,110,160,200]){
  cases.push({group:"METHOD",text:`PE-HD Kabelschutzrohr DN${dn} SDR17 im vorhandenen Graben mitverlegen`,unit:"m"});
  cases.push({group:"METHOD",text:`PE-HD Kabelschutzrohr DN${dn} SDR17 unter Fahrbahn verlegen`,unit:"m"});
  cases.push({group:"METHOD",text:`PE-HD Kabelschutzrohr DN${dn} SDR17 betonummantelt verlegen`,unit:"m"});
}

const generic=new Set(["Kabelbau","Kabelleistung","Leitungsbauleistung","Sonderbauverfahren"]);
let fail=0,zero=0,mismatch=0;
const rows:any[]=[];
for(let i=0;i<cases.length;i++){
 const c=cases[i]; const row:any={posNr:`SR.${String(i+1).padStart(4,"0")}`,kurztext:c.text,langtext:c.text,einheit:c.unit,menge:1};
 const x:any=calculateAutonomousUrkalkulation(row,ctx,[row]);
 const ep=Number(x?.unitPrice||0), pb=(x?.costLines||[]).reduce((s:number,l:any)=>s+Number(l.unitPrice||0),0);
 const bad=!x || generic.has(String(x?.leistungsart||"")) || /unparametrisiert|generic/i.test(String(x?.leistungsart||""));
 if(bad){fail++; console.log("GAP|"+c.group+"|"+c.text+"|"+(x?.trade||"NULL")+"|"+(x?.leistungsart||"NULL")+"|"+ep);}
 if(!(ep>0)) zero++;
 if(ep>0 && Math.abs(pb*1.23-ep)>0.20 && Math.abs(pb-ep)>0.20) mismatch++;
 rows.push({group:c.group,text:c.text,ep,trade:x?.trade,art:x?.leistungsart});
}
console.log(`SCHUTZROHR_AUDIT|CASES=${cases.length}|FAIL=${fail}|ZERO=${zero}|MISMATCH=${mismatch}`);

// Show representative price gradients.
for(const g of ["KSR","SCHUTZ","LEER","VERBAND","OP","SPEEDPIPE","MICRO-BUNDLE","METHOD"]){
 console.log("GROUP|"+g);
 for(const r of rows.filter(x=>x.group===g).slice(0,18)) console.log(["ROW",g,r.ep.toFixed(2),r.trade,r.art,r.text].join("|"));
}
if(fail||zero||mismatch) process.exitCode=1;

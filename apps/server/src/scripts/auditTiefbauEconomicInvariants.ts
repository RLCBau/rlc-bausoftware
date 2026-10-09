import { calculateAutonomousUrkalkulation } from "../kalkulation/autonomous/autonomousUrkalkulationEngine";

const ctx:any={projectType:"Tiefbau",trade:"Tiefbau",difficulty:"medium",logisticsRisk:"medium",trafficRisk:"medium",durationRisk:"medium",marketFactor:1,distanceFactor:1,confidence:0.9,warnings:[]};

function calc(text:string, unit:string, qty=1){
  const row:any={posNr:"INV",kurztext:text,langtext:text,einheit:unit,menge:qty};
  return calculateAutonomousUrkalkulation(row,ctx,[row]) as any;
}
function assert(cond:boolean, msg:string){ if(!cond){ console.error("ECON_FAIL|"+msg); failures++; } }
let failures=0;

const fence10=calc("Bauzaun 2,00 m aufstellen warten räumen Vorhaltung 10 Wochen","m");
const fenceDust=calc("Bauzaun Zulage Staubschutz an vorhandenem Bauzaun","m");
const fenceHold=calc("Bauzaun Vorhaltung zusätzlich Abrechnung Meter x Wochen","mWo");
const gate=calc("Toröffnung Bauzaun bis 3,5m abschließbar Zufahrt Baustellenverkehr","St");
const toilet=calc("Transportable Toilette mit Waschmöglichkeit, wöchentliche Leerung und Reinigung, Vorhaltung 10 Wochen","psch");
const toiletHold=calc("Transportable Toilette Vorhaltung zusätzlich Abrechnung nach Wochen","Wo");

const ep=(x:any)=>Number(x?.unitPrice||0);

assert(ep(fence10)>12 && ep(fence10)<30, "Bauzaun 10 Wochen plausibility");
assert(ep(fenceDust)>5 && ep(fenceDust)<ep(fence10), "Staubschutz must be surcharge below full fence");
assert(ep(fenceHold)>0.8 && ep(fenceHold)<2.5, "Bauzaun additional holding per mWo");
assert(ep(gate)>250 && ep(gate)<1000, "Bauzauntor must be piece price, not linear fence EP");
assert(ep(gate)>ep(fence10)*8, "Bauzauntor must differ materially from linear fence");
assert(ep(toilet)>500 && ep(toilet)<1500, "10-week toilet incl. wash/service");
assert(ep(toiletHold)>30 && ep(toiletHold)<100, "weekly toilet holding");
assert(String(fenceDust?.leistungsart||"").toLowerCase().includes("staub"), "Staubschutz specific family");
assert(String(gate?.leistungsart||"").toLowerCase().includes("tor"), "Gate specific family");
assert(String(toilet?.leistungsart||"").toLowerCase().includes("toilet"), "Toilet specific family");

console.log([
  "ECON_INVARIANTS",
  "FAILURES="+failures,
  "BAUZAUN10="+ep(fence10).toFixed(2),
  "STAUB="+ep(fenceDust).toFixed(2),
  "VORHALT="+ep(fenceHold).toFixed(2),
  "TOR="+ep(gate).toFixed(2),
  "WC10="+ep(toilet).toFixed(2),
  "WC_HOLD="+ep(toiletHold).toFixed(2),
].join("|"));

if(failures) process.exitCode=1;

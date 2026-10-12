import assert from "node:assert/strict";
import {calculateRlcMotorWithContext} from "../../src/kalkulation/rlcMotor";
import {analyzeRlcProjectContext} from "../../src/kalkulation/autonomous/projectContextAnalyzer";
import {inspectRlcMotorConsumptionIntegrity} from "../../src/kalkulation/autonomous/rlcMotorConsumptionIntegrity";
const examples=[
 {posNr:"1",kurztext:"Zwischenplanum im Rohrgraben herstellen",einheit:"m",menge:100},
 {posNr:"2",kurztext:"Rückverfüllung mit Sieblöffel, Vorsortierung Rohrzone",einheit:"m",menge:100},
 {posNr:"3",kurztext:"Wasserhaltungskosten 1001-2000 l/min",einheit:"m",menge:10}
];
const expected=[1.61,6.12,125.25];
let tagged=0;
for (const [index,row] of examples.entries()) {
 const context=analyzeRlcProjectContext([row], "Tiefbau");
 const result=calculateRlcMotorWithContext(row,context,[row]);
 assert(result,"RLC Motor returned no result");
 assert.equal(result.unitPrice,expected[index],"EP drift for V2 recipe");
 const assumptions=result.costLines.filter(l=>l.consumption?.status==="recipe_assumption");
 tagged+=assumptions.length;
 for (const line of assumptions){
  const c=line.consumption!;
  assert.equal(c.resourceUnit,"h");
  assert(Math.abs(c.resourceQtyPerGaebUnit!*c.resourceRateEUR!-line.unitPrice)<=0.015);
 }
 assert.equal(inspectRlcMotorConsumptionIntegrity(result).issues.filter(i=>i.startsWith("invalid_recipe_assumption")).length,0);
 console.log("CASE",row.kurztext,"EP",result.unitPrice,"ASSUMPTIONS",assumptions.length);
}
assert(tagged>0,"No assumptions reached RLC Motor");
console.log("RLC_V2_RECIPE_PRODUCTIVITY_PASS",tagged);

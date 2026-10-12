import assert from "node:assert/strict";
import {calculateRlcMotorWithContext} from "../../src/kalkulation/rlcMotor";
import {analyzeRlcProjectContext} from "../../src/kalkulation/autonomous/projectContextAnalyzer";
const rows=[{posNr:"1",kurztext:"Stahlschweißer mit Fahrzeug",einheit:"h",menge:2}];
const calc=calculateRlcMotorWithContext(rows[0],analyzeRlcProjectContext(rows,"Regie"),rows);
assert(calc);
assert(calc.costLines.some(x=>x.consumption?.status==="contract_hour_unit"));
for(const line of calc.costLines.filter(x=>x.consumption?.status==="contract_hour_unit")){
 assert.equal(line.consumption?.resourceQtyPerGaebUnit,1);
 assert.equal(line.consumption?.resourceUnit,"h");
 assert.equal(line.consumption?.resourceRateEUR,line.unitPrice);
}
assert.equal(calc.costLines.find(x=>x.group==="Maschinen")?.consumption?.status,"unverified_lump_rate");
assert.equal(calc.unitPrice,70.36);
console.log("RLC_REGIE_HOUR_CONSUMPTION_PASS",calc.unitPrice);

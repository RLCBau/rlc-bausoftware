import assert from "node:assert/strict";
import {calculateRlcMotorWithContext} from "../../src/kalkulation/rlcMotor";
import {analyzeRlcProjectContext} from "../../src/kalkulation/autonomous/projectContextAnalyzer";
import {inspectRlcMotorConsumptionIntegrity} from "../../src/kalkulation/autonomous/rlcMotorConsumptionIntegrity";
for(const [kurztext,einheit,expected] of [
 ["Kabel einbauen und einsanden","m",3.42],
 ["Sand Einbettung Kabel einbauen verdichten","m3",34.24],
] as const){
 const row={posNr:"01",kurztext,einheit,menge:12};
 const result=calculateRlcMotorWithContext(row,analyzeRlcProjectContext([row],"Kabeltiefbau"),[row]);
 assert(result,kurztext);
 const line=result.costLines.find(l=>l.name.includes("Kabelsand 0/4"));
 assert(line,kurztext);
 assert.equal(line.unitPrice,expected);
 assert.equal(line.consumption?.resourceUnit,"t");
 assert.equal(line.consumption?.status,"recipe_assumption");
 assert.equal(inspectRlcMotorConsumptionIntegrity(result).issues.length,0);
 assert.equal(result.total,Math.round(result.unitPrice*12*100)/100);
}
console.log("RLC_KABELSAND_URK_PASS");

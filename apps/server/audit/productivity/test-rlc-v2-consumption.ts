import assert from "node:assert/strict";
import {calculateRlcMotorWithContext} from "../../src/kalkulation/rlcMotor";
import {analyzeRlcProjectContext} from "../../src/kalkulation/autonomous/projectContextAnalyzer";
const rows=[{posNr:"01",kurztext:"PP KG2000 Bogen DN160 liefern und einbauen",einheit:"St",menge:2}];
const result=calculateRlcMotorWithContext(rows[0],analyzeRlcProjectContext(rows,"Kanalbau"),rows);
assert(result);
if(result.costLines.length){
 assert(result.costLines.every(line=>line.consumption?.status==="unverified_lump_rate"));
 assert(result.costLines.every(line=>line.consumption?.resourceQtyPerGaebUnit===null));
}
assert(result.unitPrice>=0);
console.log("RLC_V2_CONSUMPTION_METADATA_PASS",result.unitPrice,result.costLines.length);

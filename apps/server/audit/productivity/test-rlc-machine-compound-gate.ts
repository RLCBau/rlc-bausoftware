import assert from "node:assert/strict";
import {calculateRlcMotorWithContext} from "../../src/kalkulation/rlcMotor";
import {analyzeRlcProjectContext} from "../../src/kalkulation/autonomous/projectContextAnalyzer";
for(const kurztext of ["Auslegen von Baggermatten","Baggergut entwässern","Maschinenraum ausbauen"]){
 const row={posNr:"1",kurztext,einheit:"m2",menge:10};
 const r=calculateRlcMotorWithContext(row,analyzeRlcProjectContext([row],"Tiefbau"),[row]);
 assert.notEqual(r?.trade,"Maschinen/Geräte/Technische Klärung",kurztext);
}
const row={posNr:"1",kurztext:"Bereitstellung Hebegerät",einheit:"h",menge:6};
const r=calculateRlcMotorWithContext(row,analyzeRlcProjectContext([row],"Tiefbau"),[row]);
assert.equal(r?.unitPrice,0);
console.log("RLC_MACHINE_COMPOUND_GUARD_PASS");

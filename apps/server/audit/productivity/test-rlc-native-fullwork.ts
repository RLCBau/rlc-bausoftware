import assert from 'node:assert/strict';
import {calculateRlcMotorWithContext} from '../../src/kalkulation/rlcMotor';
import {analyzeRlcProjectContext} from '../../src/kalkulation/autonomous/projectContextAnalyzer';
const row={posNr:'01',kurztext:'Asphalt AC 11 D N liefern und einbauen',einheit:'t',menge:12};
const r=calculateRlcMotorWithContext(row,analyzeRlcProjectContext([row],'Straßenbau'),[row]);
assert.equal(r?.source,'rlc-motor-native-resources');
assert.equal(r?.calculationStatus,'needs_review');
assert.equal(r?.unitPrice,0);
assert.equal(r?.costLines.length,0);
assert.equal(r?.warnings.includes('RLC_MOTOR_REVIEW_PRICE_BLOCKED'),true);
assert.equal(r?.warnings.includes('RLC_NATIVE_COST_SCOPE_INCOMPLETE'),true);
for(const t of ['Asphalt AC 11 D N liefern und einbauen ab Werk','Zulage Asphalt AC 11 D N liefern und einbauen','Asphalt AC 11 D N Kleinmenge liefern und einbauen']) {
 const x={...row,kurztext:t};
 assert.notEqual(calculateRlcMotorWithContext(x,analyzeRlcProjectContext([x],'Straßenbau'),[x])?.trade,'Straßenbau/Asphalt-Einbau-nativ');
}
console.log('RLC_NATIVE_FULLWORK_ROUTING_PASS',r?.unitPrice);

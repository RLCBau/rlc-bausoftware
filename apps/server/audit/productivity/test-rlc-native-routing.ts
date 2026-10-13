import assert from 'node:assert/strict';
import {calculateRlcMotorWithContext} from '../../src/kalkulation/rlcMotor';
import {analyzeRlcProjectContext} from '../../src/kalkulation/autonomous/projectContextAnalyzer';
import {calculateRlcNativeRecipe} from '../../src/kalkulation/autonomous/rlcNativeRecipes';
const row={posNr:'1',kurztext:'Asphaltmischgut AC 11 D S liefern ab Werk',einheit:'t',menge:10};
const result=calculateRlcMotorWithContext(row,analyzeRlcProjectContext([row],'Straßenbau'),[row]);
assert.equal(result?.source,'rlc-motor-native-resources');
assert.equal(result?.unitPrice,140.9);
assert.equal(result?.total,1409);
assert.equal(result?.costLines.length,1);
assert.equal(result?.calculationStatus,'warning');
for(const text of [
 'Asphaltmischgut AC 11 D S liefern und einbauen ab Werk',
 'Asphaltmischgut AC 11 D S frei Baustelle liefern ab Werk',
 'Zulage Asphaltmischgut AC 11 D S liefern ab Werk'
])assert.equal(calculateRlcNativeRecipe({...row,kurztext:text}),null,text);
assert.equal(calculateRlcNativeRecipe({...row,einheit:'m2'}),null);
const sand={...row,kurztext:'Kabelsand 0/4 liefern ab Werk'};
const sandResult=calculateRlcMotorWithContext(sand,analyzeRlcProjectContext([sand],'Leitungsbau'),[sand]);
assert.equal(sandResult?.source,'rlc-motor-native-resources');
assert.equal(sandResult?.unitPrice,21.4);
assert.equal(calculateRlcNativeRecipe({...sand,kurztext:'Kabelsand 0/8 liefern ab Werk'}),null);
assert.equal(calculateRlcNativeRecipe({...sand,kurztext:'Kabelsand liefern ab Werk'}),null);
console.log('RLC_NATIVE_ROUTING_PASS');

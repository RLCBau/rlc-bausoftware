import assert from 'node:assert/strict';
import {calculateRlcMotorWithContext} from '../../src/kalkulation/rlcMotor';
import {calculateRlcNativeRecipe} from '../../src/kalkulation/autonomous/rlcNativeRecipes';
import {analyzeRlcProjectContext} from '../../src/kalkulation/autonomous/projectContextAnalyzer';
const a={posNr:'06.02.0100',kurztext:'Asphaltdecksch. aus AC 11 D S herstellen Dicke 4 cm Bitumen 50/70',einheit:'m2',menge:600};
const preview=calculateRlcNativeRecipe(a);
assert.equal(preview?.trade,'Straßenbau/Asphaltschicht-m2-nativ');
assert.equal(preview?.costLines[0].consumption?.resourceQtyPerGaebUnit,0.096);
assert.equal(preview?.calculationStatus,'needs_review');
const result=calculateRlcMotorWithContext(a,analyzeRlcProjectContext([a],'Straßenbau'),[a]);
assert.notEqual(result?.source,'rlc-motor-native-resources');
assert.equal(result?.warnings.includes('RLC_NATIVE_PREVIEW_INCOMPLETE_KEEP_V2_FALLBACK'),true);
for (const short of [
 'Asphaltdeckschicht AC 11 D S herstellen',
 'Asphaltdeckschicht AC 11 D S herstellen Dicke 4 cm Zulage',
 'Asphaltdeckschicht AC 11 D S herstellen Dicke 4 cm Dicke 6 cm'
])assert.notEqual(calculateRlcNativeRecipe({...a,kurztext:short})?.trade,'Straßenbau/Asphaltschicht-m2-nativ');
console.log('RLC_NATIVE_ASPHALT_M2_SCOPE_PASS');

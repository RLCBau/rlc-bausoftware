import assert from 'node:assert/strict';
import {calculateRlcMotorWithContext} from '../../src/kalkulation/rlcMotor';
import {analyzeRlcProjectContext} from '../../src/kalkulation/autonomous/projectContextAnalyzer';
const rows=[
 {posNr:'01.01.0001',kurztext:'KG2000 Rohr DN160 liefern und verlegen',einheit:'m',menge:10},
 {posNr:'01.01.0002',kurztext:'Zulage zur Pos. 01.01.0001 für Rohrleitung DN200',einheit:'m',menge:10}
];
const ctx=analyzeRlcProjectContext(rows,'Kanalbau');
const variant=calculateRlcMotorWithContext(rows[1],ctx,rows);
assert(variant);
assert.equal(variant.unitPrice,0);
assert.equal(variant.calculationStatus,'needs_review');
assert(variant.warnings.includes('RLC_MOTOR_DEPENDENT_SURCHARGE_INCREMENT_UNVERIFIED'));
const base=calculateRlcMotorWithContext(rows[0],ctx,rows);
assert(base&&base.unitPrice>0);
console.log('RLC_EXPLICIT_DEPENDENT_ZULAGE_PASS');

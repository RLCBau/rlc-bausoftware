import assert from 'node:assert/strict';
import {calculateRlcMotorWithContext} from '../../src/kalkulation/rlcMotor';
import {analyzeRlcProjectContext} from '../../src/kalkulation/autonomous/projectContextAnalyzer';
const variants=[
 'Zulage zur Grundposition 01.01.0001 DN200',
 'Zulage zur Hauptposition 01.01.0001 DN200',
 'Zulage zur Basisposition 01.01.0001 DN200',
 'Zulage zu Pos. 01.01.0001 DN200',
];
for(const kurztext of variants){
 const rows=[{posNr:'01.01.0001',kurztext:'KG2000 Rohr DN160 liefern und verlegen',einheit:'m',menge:10},
  {posNr:'01.01.0002',kurztext,einheit:'m',menge:10}];
 const r=calculateRlcMotorWithContext(rows[1],analyzeRlcProjectContext(rows,'Kanalbau'),rows);
 assert(r);
 assert.equal(r.unitPrice,0);
 assert.equal(r.calculationStatus,'needs_review');
 assert(r.warnings.includes('RLC_MOTOR_DEPENDENT_SURCHARGE_INCREMENT_UNVERIFIED'),kurztext);
}
console.log('RLC_MOTOR_GROUND_POSITION_GUARD_PASS',variants.length);

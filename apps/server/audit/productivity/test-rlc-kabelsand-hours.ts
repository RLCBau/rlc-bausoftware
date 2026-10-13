import assert from 'node:assert/strict';
import {calculateRlcMotorWithContext} from '../../src/kalkulation/rlcMotor';
import {analyzeRlcProjectContext} from '../../src/kalkulation/autonomous/projectContextAnalyzer';
import {diagnoseRlcEconomicEvidence} from '../../src/kalkulation/autonomous/rlcEconomicEvidenceGate';
for(const [short,unit] of [['Kabel einbauen und einsanden','m'],['Sand Einbettung Kabel einbauen verdichten','m3']]){
 const row={posNr:'1',kurztext:short,einheit:unit,menge:12};
 const r=calculateRlcMotorWithContext(row,analyzeRlcProjectContext([row],'Kabeltiefbau'),[row]);
 assert(r);
 const hours=r.costLines.filter(l=>l.consumption?.resourceUnit==='h');
 assert.equal(hours.length,2,short);
 for(const line of hours){
   assert.equal(line.consumption?.status,'recipe_assumption');
   assert((line.consumption?.resourceQtyPerGaebUnit||0)>0);
   assert((line.consumption?.resourceRateEUR||0)>0);
 }
 const diagnosis=diagnoseRlcEconomicEvidence(r.costLines);
 assert.equal(diagnosis.unresolvedComponents,0);
 assert.equal(diagnosis.eligibleForAutomaticEconomicApproval,false);
 console.log('RLC_KABELSAND_HOURS_PASS',short,'ep',r.unitPrice,'assumptions',diagnosis.assumptions);
}

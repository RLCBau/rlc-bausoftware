import assert from 'node:assert/strict';
import {traceV3UrkEvidence} from '../../src/kalkulation/autonomous/v3UrkEvidenceTrace';
const r=traceV3UrkEvidence({costLines:[
 {id:'1',group:'Material',name:'Rohr',qty:2,unit:'m',unitPrice:10,total:20,note:'RLC 2026 PP resource table'},
 {id:'2',group:'Lohn',name:'Einbau',qty:1,unit:'h',unitPrice:30,total:30}
]} as any);
assert.equal(r.total,2);
assert.equal(r.withSourceNote,1);
assert.equal(r.missingSourceNote,1);
assert.equal(r.internalReferences,1);
assert.equal(r.invalidArithmetic,0);
assert.equal(r.certifiedResourceCount,0);
assert.equal(r.approvedForEP,false);
assert.equal(r.productionWriteAllowed,false);
assert.equal(traceV3UrkEvidence(null).total,0);
console.log('URK_EVIDENCE_TRACE_TEST_PASS');

import assert from "node:assert/strict";
import {inspectRlcMotorEvidence} from "../../src/kalkulation/autonomous/rlcMotorEvidenceQuality";
const mock={costLines:[
 {id:"a",group:"Material",name:"Rohr",unit:"m",qty:1,unitPrice:10,total:10,provenance:{origin:"rlc_v2_family_catalog",family:"Kanalbau",evidenceStatus:"catalog_rate_unverified"}},
 {id:"b",group:"Lohn",name:"Montage",unit:"h",qty:1,unitPrice:20,total:20,note:"Internet evidence: https://example.org/price (2026-08-01)"}
]} as any;
const result=inspectRlcMotorEvidence(mock);
assert.equal(result.counts.catalog_without_source,1);
assert.equal(result.counts.dated_external_reference,1);
assert.equal(result.verified,0);
assert.equal(result.approvedForEP,false);
assert.equal(result.productionWriteAllowed,false);
assert.equal(inspectRlcMotorEvidence(null).details.length,0);
console.log("RLC_MOTOR_EVIDENCE_QUALITY_PASS");

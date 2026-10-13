import assert from 'node:assert/strict';
import {previewRlcMotorAsphaltProject} from '../../src/kalkulation/rlcMotor';
import {calculateCompleteAsphaltLayerM2,AsphaltProjectResources} from '../../src/kalkulation/autonomous/rlcAsphaltProductionModel';
const basis=Object.fromEntries(['material','density','thickness','fracht','fertiger','walze','lohn','baustellenlogistik','productivity'].map(x=>[x,'Testprojektbeleg '+x])) as AsphaltProjectResources['basis'];
const input:AsphaltProjectResources={mixRateEURPerT:145,compactedDensityTPerM3:2.4,compactedThicknessM:0.04,
freightEURPerT:18,paverEURPerHour:175,rollerEURPerHour:62,
workerEURPerHour:48.36,asphaltTonnesPerHour:16,workers:3,siteLogisticsEURPerM2:2.5,basis};
const r=calculateCompleteAsphaltLayerM2(input);
assert.equal(r.lines.length,6);
assert.equal(r.physicalTonnesPerM2,0.096);
assert.equal(r.economicallyApproved,false);
assert(r.unitPrice>0);
const controlled=previewRlcMotorAsphaltProject(input);
assert.equal(controlled.authority,'RLC_MOTOR');
assert.equal(controlled.productionWriteAllowed,false);
assert.equal(controlled.unitPrice,r.unitPrice);
assert.throws(()=>calculateCompleteAsphaltLayerM2({...input,freightEURPerT:0}),/INCOMPLETE/);
assert.throws(()=>calculateCompleteAsphaltLayerM2({...input,basis:{...basis,fertiger:''}}),/MISSING_SOURCE_BASIS/);
console.log('RLC_ASPHALT_PROJECT_RESOURCE_MODEL_PASS',r.unitPrice);

import assert from 'node:assert/strict';
import {composeRlcResourceLines} from '../../src/kalkulation/autonomous/rlcResourceComposer';
const lines=composeRlcResourceLines('m',[
 {group:'Material',name:'Kabelsand 0/4',resourceUnit:'t',quantityPerGaebUnit:0.16,netRateEUR:21.4,basis:'0.1m3 per m x 1.6 t/m3'},
 {group:'Lohn',name:'Facharbeiter',resourceUnit:'h',quantityPerGaebUnit:1/14,netRateEUR:48.36,basis:'estimated 14m/h'}
]);
assert.deepEqual(lines.map(l=>l.unitPrice),[3.42,3.45]);
assert.equal(lines[1].consumption?.resourceUnit,'h');
assert.throws(()=>composeRlcResourceLines('m',[{group:'Material',name:'wrong',resourceUnit:'t',quantityPerGaebUnit:0,netRateEUR:20,basis:'given'}]),/INVALID_CONSUMPTION/);
assert.throws(()=>composeRlcResourceLines('m',[{group:'Material',name:'wrong',resourceUnit:'t',quantityPerGaebUnit:1,netRateEUR:20,basis:''}]),/MISSING_BASIS/);
console.log('RLC_RESOURCE_COMPOSER_PASS');

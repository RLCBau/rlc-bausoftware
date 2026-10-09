// Run against the compiled costCenterAnalysis.ts module; keeps the production calculation under test.
const assert=require('node:assert/strict');const {cents,analyzeCostCenters,csvCell}=require(process.argv[2]);
const source=items=>({available:true,items});const unavailable={available:false,items:[]};
const masters=source([{id:'m',code:'KS',description:'Earthwork',mainArea:'Tiefbau',budgetText:'100.00',active:true}]);
const bills=source([{status:'booked',netAmount:'0.10',grossAmount:'0.12',data:{costCenter:'KS'}},{status:'booked',netAmount:'0.20',grossAmount:'0.24',data:{costCenter:'KS'}},{status:'captured',netAmount:'999.99',data:{costCenter:'KS'}},{status:'booked',netAmount:'-0.05',data:{costCenter:'KS'}}]);
let d=analyzeCostCenters(masters,bills,source([{costCenter:'KS',personnelCost:1.235}]),source([{costCenter:'KS',amount:'2.30'}]));
assert.equal(d.rows[0].supplier,25n);assert.equal(d.rows[0].labor,124n);assert.equal(d.rows[0].actual,379n);assert.equal(d.rows[0].variance,9621n);assert.equal(d.draftCount,1);
d=analyzeCostCenters(masters,unavailable,source([]),source([]));assert.equal(d.rows[0].supplier,null);assert.equal(d.rows[0].actual,null);assert.equal(d.rows[0].variance,null);
assert.equal(cents('90071992547409.93'),9007199254740993n);assert.equal(cents('-0.01'),-1n);assert.throws(()=>cents('1.001'));assert.throws(()=>cents(null));assert.equal(csvCell('  =HYPERLINK("x")'),'"\'  =HYPERLINK(""x"")"');
assert.throws(()=>analyzeCostCenters(masters,source([]),source([{personnelCost:null}]),source([])));
d=analyzeCostCenters(source([]),source([{status:'booked',netAmount:'10.00',data:{}}]),source([]),source([]));assert.equal(d.rows[0].code,'OHNE-KOSTENSTELLE');assert.equal(d.rows[0].supplier,1000n);
console.log('PASS cost-center analysis: exact cents, booked net costs, drafts excluded, labor rounded per row, unavailable sources remain null, unassigned costs visible, invalid personnel amounts rejected, CSV formula protection.');

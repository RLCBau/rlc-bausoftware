const fs=require('fs');
const x=JSON.parse(fs.readFileSync('/tmp/rlc-v3-152-technical-audit.json','utf8'));
const input=x.sourceInventory.entries;
const reasons={
 Lohn:'requires_verified_hours_per_unit_and_tariff_group',
 Maschinen:'requires_verified_machine_hours_per_unit_and_equipment_class',
 Material:'requires_specification_and_supplier_net_quote',
};
const output=input.map((e,i)=>{
 const unit=String(e.unit).toLowerCase().replace('.','');
 const direct=e.group==='Lohn'&&['h','std'].includes(unit);
 return {priority:i+1,group:e.group,resource:e.name,unit:e.unit,originalCostEUR:e.unitPrice,occurrences:e.withoutNotes,
   comparisonEligibility:direct?'hourly_tariff_comparison_possible':'not_comparable_without_extra_inputs',
   reason:direct?'tariff_group_and_employer_burden_required':reasons[e.group]||'supporting_quote_required',
   sourceUrl:e.group==='Lohn'?'https://igbau.de/Bau-Einkommen-35-Jahre-nach-Wiedervereinigung-bundeseinheitlich.html':null,
   benchmarkEUR:null,deviationPct:null,verified:false,approvedForEP:false};
});
const summary={total:output.length,nonComparable:output.filter(o=>o.comparisonEligibility==='not_comparable_without_extra_inputs').length,byGroup:{},priceChanges:0};
for(const e of output)summary.byGroup[e.group]=(summary.byGroup[e.group]||0)+1;
fs.writeFileSync('/tmp/rlc-36-benchmark-eligibility.json',JSON.stringify({summary,resources:output},null,2));
console.log('BENCHMARK',JSON.stringify(summary));

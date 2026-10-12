const fs=require('fs');
const x=JSON.parse(fs.readFileSync('/tmp/rlc-v3-152-technical-audit.json','utf8'));
const inventory=x.sourceInventory.entries;
const results=inventory.map((entry,i)=>{
 const unit=String(entry.unit||'').toLowerCase().replace(/\.$/,'');
 const kind=entry.group==='Lohn'?'personnel':entry.group==='Maschinen'?'machine':'material';
 const requirements=kind==='personnel'?['tariffGroup','crewSize','verifiedWorkHoursPerGaebUnit']:
  kind==='machine'?['machineClass','verifiedOperatingHoursPerGaebUnit','fuelAndServiceBasis']:
  ['materialSpecification','verifiedPhysicalQuantityPerGaebUnit','purchaseUnit','verifiedSupplierNetRate'];
 return {priority:i+1,group:entry.group,resource:entry.name,gaebUnit:unit,existingCostEURPerGaebUnit:entry.unitPrice,
  occurrences:entry.withoutNotes,kind,existingCatalogQuantityPerUnit:null,
  existingCatalogTimeHoursPerUnit:null,assumptionsAllowed:false,
  reason:'catalog_cost_line_only_not_a_physical_consumption_recipe',
  requiredEvidence:requirements,quantityOrTimeVerified:false,unitPriceVerified:false,productionWriteAllowed:false};
});
const summary={resources:results.length,personnel:results.filter(v=>v.kind==='personnel').length,
 machine:results.filter(v=>v.kind==='machine').length,material:results.filter(v=>v.kind==='material').length,
 physicalConsumptionsVerified:0,priceChanges:0};
fs.writeFileSync('/tmp/rlc-36-resource-consumption-audit.json',JSON.stringify({summary,results},null,2));
console.log(JSON.stringify(summary));

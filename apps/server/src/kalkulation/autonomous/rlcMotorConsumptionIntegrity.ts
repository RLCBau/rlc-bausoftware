import type {RlcAutonomousCalcResult} from "./types";
export function inspectRlcMotorConsumptionIntegrity(result:RlcAutonomousCalcResult|null) {
 const issues:string[]=[];
 let nominal=0,hourly=0,unverified=0,measured=0;
 for(const [i,line] of (result?.costLines||[]).entries()){
  const c=line.consumption;
  if(!c){issues.push("missing_consumption_metadata:"+i);continue;}
  if(c.status==="unverified_lump_rate"){
   unverified++;
   if(c.resourceQtyPerGaebUnit!==null||c.resourceUnit!==null||c.resourceRateEUR!==null)
    issues.push("unverified_with_fabricated_components:"+i);
   continue;
  }
  if(c.status==="recipe_assumption"){
   const amount=c.resourceQtyPerGaebUnit,rate=c.resourceRateEUR;
   if(!(typeof amount==="number"&&Number.isFinite(amount)&&amount>0&&typeof rate==="number"&&Number.isFinite(rate)&&rate>0&&["h","m3","t"].includes(c.resourceUnit||"")&&
     typeof c.basis==="string"&&c.basis.length>0&&Math.abs(amount*rate-line.unitPrice)<=0.015))
      issues.push("invalid_recipe_assumption:"+i);
   // A consistent calculation is not independent proof of productivity.
   unverified++;
   continue;
  }
  if(c.status==="measured_consumption"){
   measured++;
   issues.push("measured_consumption_without_authenticated_record:"+i);
   continue;
  }
  if(c.status==="contract_nominal_length")nominal++;
  else if(c.status==="contract_hour_unit")hourly++;
  if(!(c.resourceQtyPerGaebUnit===1&&c.resourceRateEUR===line.unitPrice&&c.resourceUnit===(c.status==="contract_hour_unit"?"h":"m")))
    issues.push("contract_basis_inconsistent:"+i);
  if(c.status==="contract_nominal_length"&&line.group!=="Material")
    issues.push("nominal_length_not_material:"+i);
  if(c.status==="contract_hour_unit"&&!["Lohn","Maschinen"].includes(line.group))
    issues.push("hour_unit_not_personnel_or_equipment:"+i);
 }
 return {issues,nominal,hourly,unverified,measured,consumptionCertified:false as const,approvedForEP:false as const,productionWriteAllowed:false as const};
}

/**
 * Diagnostic only: calculation is not economic approval.
 * All cost components must have documented physical consumption and rates,
 * while recipe assumptions require independent approval.
 */
export function diagnoseRlcEconomicEvidence(costLines: Array<{
  name?:string;
  group?:string;
  consumption?:{
    status?:string;
    resourceQtyPerGaebUnit?:number|null;
    resourceRateEUR?:number|null;
    basis?:string|null;
  } | null;
}>): {
  status:"no_cost_breakdown"|"unverified_lump_components"|"recipe_assumptions_require_validation"|"resource_evidence_requires_validation";
  eligibleForAutomaticEconomicApproval:false;
  unresolvedComponents:number;
  assumptions:number;
  resourcesWithBasis:number;
  missingBasis:number;
}{
  if(!costLines.length)return {status:"no_cost_breakdown",eligibleForAutomaticEconomicApproval:false,unresolvedComponents:0,assumptions:0,resourcesWithBasis:0,missingBasis:0};
  let unresolvedComponents=0,assumptions=0,resourcesWithBasis=0,missingBasis=0;
  for(const line of costLines){
    const c=line.consumption;
    const physical=!!c && Number.isFinite(c.resourceQtyPerGaebUnit) && Number(c.resourceQtyPerGaebUnit)>0
      && Number.isFinite(c.resourceRateEUR) && Number(c.resourceRateEUR)>0;
    if(!physical || c?.status==="unverified_lump_rate"){unresolvedComponents++;continue;}
    if(c?.status==="recipe_assumption")assumptions++;
    if(String(c?.basis||"").trim())resourcesWithBasis++;else missingBasis++;
  }
  const status=unresolvedComponents?"unverified_lump_components":
    assumptions?"recipe_assumptions_require_validation":
    missingBasis?"resource_evidence_requires_validation":"resource_evidence_requires_validation";
  return {status,eligibleForAutomaticEconomicApproval:false,unresolvedComponents,assumptions,resourcesWithBasis,missingBasis};
}

import {calculateBeddingMaterialScenario} from './v3BeddingMaterialCost';
import {PERSONNEL_INTERNAL_COST_2026} from './tiefbauCostRates2026';
export type VerifiedBeddingInputs={transportEURPerT:number;transportEvidence:string;transportApprovedBy:string;teamHoursPerM2:number;productivityEvidence:string;productivityApprovedBy:string;teamSize:number};
const good=(v:number)=>Number.isFinite(v)&&v>0;
const round=(v:number)=>Math.round(v*1000)/1000;
/** Quantity-based direct cost range, NEVER a commercial EP. All external inputs require approvals. */
export function calculateBeddingInstalledCost(row:{shortText:string;longText:string;unit:string},marketPath:string,supplierId:string,params?:Partial<VerifiedBeddingInputs>){
 const material=calculateBeddingMaterialScenario(row,marketPath,supplierId);
 const missing:string[]=[];
 if(!material.materialOnly)missing.push('supplier_material_unresolved');
 if(!params||!good(params.transportEURPerT!)||!params.transportEvidence||!params.transportApprovedBy)missing.push('transport_quote_not_approved');
 if(!params||!good(params.teamHoursPerM2!)||!params.productivityEvidence||!params.productivityApprovedBy)missing.push('productivity_not_approved');
 if(!params||!good(params.teamSize!)||!Number.isInteger(params.teamSize))missing.push('team_composition_unverified');
 if(missing.length)return {status:'needs_review' as const,directCostEURPerM2:null,materialOnly:material.materialOnly,missing:[...new Set([...missing,...material.missing])],epEUR:null};
 const m=material.materialOnly!;
 const transport=m.tonnesPerM2.map(q=>round(q*params!.transportEURPerT!));
 const labour=round(params!.teamHoursPerM2!*params!.teamSize!*PERSONNEL_INTERNAL_COST_2026.facharbeiter_lg4);
 const low=round(m.costEURPerM2[0]+transport[0]+labour),high=round(m.costEURPerM2[1]+transport[1]+labour);
 return {status:'needs_review' as const,directCostEURPerM2:[low,high],materialOnly:m,transportEURPerM2:transport,labourEURPerM2:labour,sourceRefs:[material.source,params!.transportEvidence,params!.productivityEvidence],missing:['equipment_and_ancillary_scope_review','overheads_and_profit','contract_thickness_range_selection'],epEUR:null};
}

import type { RlcAutonomousCalcInput, RlcAutonomousCalcResult } from "./types";
import { diagnoseV3VariantCostOverlap } from "./v3VariantCostOverlap";

export type SurchargeScopeEvidence = {
  contractBasePosition: string;
  contractScopeEvidenceId: string;
  incrementDescription: string;
  unitCompatibilityEvidenceId: string;
  quantityEvidenceId: string;
  productivityEvidenceId: string;
  resourceEvidenceIds: Record<string,string>;
  overlapResolutionEvidenceIds: Record<string,string>;
};

/** Independent proof gate: diagnostics cannot create contractual evidence or approve EP. */
export function checkV3SurchargeScope(input:{
  base: RlcAutonomousCalcInput;
  surcharge: RlcAutonomousCalcInput;
  baseCalculation: RlcAutonomousCalcResult|null;
  surchargeCalculation: RlcAutonomousCalcResult|null;
  evidence?: Partial<SurchargeScopeEvidence>;
}){
 const {base,surcharge,evidence}=input;
 const missing:string[]=[];
 const required=(value:unknown,code:string)=>{
   if(typeof value!=="string"||!value.trim())missing.push(code);
 };
 required(evidence?.contractBasePosition,"base_position_not_confirmed");
 if(evidence?.contractBasePosition&&evidence.contractBasePosition!==String(base.posNr||""))
   missing.push("base_position_mismatch");
 required(evidence?.contractScopeEvidenceId,"incremental_scope_unverified");
 required(evidence?.incrementDescription,"increment_description_missing");
 required(evidence?.unitCompatibilityEvidenceId,"unit_compatibility_unverified");
 required(evidence?.quantityEvidenceId,"quantity_evidence_missing");
 required(evidence?.productivityEvidenceId,"productivity_evidence_missing");
 if(!surcharge.einheit||!base.einheit)missing.push("contract_units_missing");
 const baseQty=Number(base.menge),surchargeQty=Number(surcharge.menge);
 if(!Number.isFinite(baseQty)||baseQty<=0)missing.push("base_contract_quantity_missing");
 if(!Number.isFinite(surchargeQty)||surchargeQty<=0)missing.push("contract_quantity_missing");
 const normalizeUnit=(unit:unknown)=>String(unit||"").trim().toLowerCase().replace(/\.$/,"").replace("m²","m2").replace("m³","m3");
 if(base.einheit&&surcharge.einheit&&normalizeUnit(base.einheit)!==normalizeUnit(surcharge.einheit))
   missing.push("contract_unit_mismatch_requires_scope_evidence");
 // A surcharge quantity may legitimately differ from the base quantity.
 // Record the discrepancy for review rather than assuming identical quantities.
 const quantityRelation=Number.isFinite(baseQty)&&baseQty>0&&Number.isFinite(surchargeQty)&&surchargeQty>0
   ? (Math.abs(baseQty-surchargeQty)<1e-6?"same":"different") : "unknown";
 const lines=input.surchargeCalculation?.costLines||[];
 if(!lines.length)missing.push("surcharge_cost_lines_missing");
 for(const [i,line] of lines.entries()){
   if(!evidence?.resourceEvidenceIds?.[String(i)])missing.push("resource_evidence_missing:"+i);
   if(!Number.isFinite(line.qty)||line.qty<0||!Number.isFinite(line.unitPrice)||line.unitPrice<0)
     missing.push("invalid_resource_values:"+i);
 }
 const overlap=diagnoseV3VariantCostOverlap(input.baseCalculation,input.surchargeCalculation);
 for(const index of new Set(overlap.possibleOverlaps.map(x=>x.variantLine)))
   if(!evidence?.overlapResolutionEvidenceIds?.[String(index)])
     missing.push("overlap_resolution_missing:"+index);
 return {missing,documentaryComplete:missing.length===0,quantityRelation,overlapCount:overlap.possibleOverlaps.length,
   // This gate only recognizes supplied evidence references; it cannot authenticate them.
   evidenceAuthenticityVerified:false as const,incrementalEP:null,approvedForEP:false as const,
   productionWriteAllowed:false as const};
}

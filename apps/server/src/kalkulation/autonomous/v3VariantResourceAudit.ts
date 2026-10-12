import type { RlcAutonomousCalcInput } from "./types";

export type VariantGap = {
  category: "base_scope" | "technical_delta" | "resource_evidence" | "productivity" | "billing";
  code: string;
  required: boolean;
};
const present = (v: unknown) => typeof v === "string" && v.trim().length > 0;

/** Strict read-only evidence checklist; lexical references are never certified resources. */
export function auditV3VariantResources(input: {
  base: RlcAutonomousCalcInput;
  variant: RlcAutonomousCalcInput;
  baseFamilies: number;
  variantFamilies: number;
  resourceEvidence?: Array<{group:string;quantityPerUnit:number|null;rateEUR:number|null;evidenceId:string|null;approved:boolean}>;
  productivity?: {quantityPerHour:number|null;evidenceId:string|null;approved:boolean};
}) {
  const {base,variant}=input;
  const gaps: VariantGap[]=[];
  const add=(category:VariantGap["category"],code:string)=>gaps.push({category,code,required:true});
  if(!input.baseFamilies)add("base_scope","base_family_unresolved");
  if(!input.variantFamilies)add("base_scope","variant_family_unresolved");
  if(!present(base.kurztext)&&!present(base.langtext))add("base_scope","base_description_missing");
  if(!present(variant.kurztext)&&!present(variant.langtext))add("technical_delta","variant_description_missing");
  const a=(String(base.kurztext||"")+" "+String(base.langtext||""));
  const b=(String(variant.kurztext||"")+" "+String(variant.langtext||""));
  const dn=(t:string)=>t.match(/\b(?:DN|DA)\s*(\d{2,4})\b/i)?.[1]||null;
  const material=(t:string)=>t.match(/\b(PP|PVC|PE-HD|PE|Beton|Granit|Asphalt|Kalksandstein)\b/i)?.[1]?.toUpperCase()||null;
  const delta={baseDN:dn(a),variantDN:dn(b),baseMaterial:material(a),variantMaterial:material(b)};
  if(delta.baseDN&&delta.variantDN&&delta.baseDN!==delta.variantDN)add("technical_delta","diameter_difference_requires_design_validation");
  if(delta.baseMaterial&&delta.variantMaterial&&delta.baseMaterial!==delta.variantMaterial)add("technical_delta","material_difference_requires_specification_validation");
  if(!present(variant.einheit))add("billing","variant_billing_unit_missing");
  if(!Number.isFinite(variant.menge)||Number(variant.menge)<=0)add("billing","variant_contract_quantity_not_verified");
  const groups=["Lohn","Material","Maschinen","Entsorgung","Nachunternehmer"] as const;
  const evidence=input.resourceEvidence||[];
  const resources=groups.map(group=>{
    const entries=evidence.filter(v=>v.group===group);
    const certified=entries.length>0&&entries.every(v=>v.approved===true&&!!v.evidenceId&&Number.isFinite(v.quantityPerUnit)&&Number(v.quantityPerUnit)>0&&Number.isFinite(v.rateEUR)&&Number(v.rateEUR)>=0);
    if(!certified)add("resource_evidence",group.toLowerCase()+"_unverified_or_not_required");
    return {group,submitted:entries.length,verified:certified};
  });
  const productivity=!!input.productivity?.approved&&!!input.productivity.evidenceId&&Number.isFinite(input.productivity.quantityPerHour)&&Number(input.productivity.quantityPerHour)>0;
  if(!productivity)add("productivity","productivity_rate_unverified");
  return {delta,gaps,resources,productivityVerified:productivity,readyForCostReview:gaps.length===0,
    epApproved:false as const,productionWriteAllowed:false as const,priceSource:"RLC_MOTOR_URKALKULATION_ONLY" as const};
}

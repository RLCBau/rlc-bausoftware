import type { RlcAutonomousCalcResult } from "./types";
import {diagnoseV3VariantCostOverlap} from "./v3VariantCostOverlap";

/** Quantitative screening only: a surcharge is never base EP minus variant EP. */
export function auditV3IncrementalCosts(base:RlcAutonomousCalcResult|null,variant:RlcAutonomousCalcResult|null){
 const overlap=diagnoseV3VariantCostOverlap(base,variant);
 const baseLines=base?.costLines||[],variantLines=variant?.costLines||[];
 const finite=(n:number)=>Number.isFinite(n)&&n>=0&&Number.isSafeInteger(Math.round(n*100));
 const flags:string[]=[];
 if(!baseLines.length||!variantLines.length)flags.push("cost_breakdown_missing");
 if(baseLines.some(l=>!finite(l.qty)||!finite(l.unitPrice)||!finite(l.total))||
    variantLines.some(l=>!finite(l.qty)||!finite(l.unitPrice)||!finite(l.total)))flags.push("invalid_cost_lines");
 if(overlap.possibleOverlaps.length)flags.push("possible_base_service_duplication");
 const groups=["Lohn","Material","Maschinen","Entsorgung","Nachunternehmer","Gemeinkosten","Risiko","Gewinn"];
 const compare=groups.map(group=>{
   const sum=(lines:typeof baseLines)=>lines.filter(l=>l.group===group).reduce((v,l)=>v+l.total,0);
   const b=sum(baseLines),v=sum(variantLines);
   return {group,baseCostPerUnit:finite(b)?Math.round(b*100)/100:null,
     variantCostPerUnit:finite(v)?Math.round(v*100)/100:null,
     arithmeticDifference:finite(b)&&finite(v)?Math.round((v-b)*100)/100:null,
     incrementCertified:false as const};
 });
 flags.push("base_and_variant_billing_comparability_unverified");
 flags.push("incremental_scope_and_productivity_unverified");
 return {compare,overlap,flags,incrementalEP:null,approvedForEP:false as const,
   productionWriteAllowed:false as const,status:"technical_validation_required" as const};
}

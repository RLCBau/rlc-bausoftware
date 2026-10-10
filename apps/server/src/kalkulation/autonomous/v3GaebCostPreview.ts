import {determineBillingBasis} from './v3BillingQuantityBasis';
export type CostResource={type:string;task?:string;quantityPerUnit:number|null;rateEUR:number|null;evidenceId:string|null;approved:boolean};
export type CostRecipe={id:string;gaebPosition:string;components:CostResource[];productivity?:{quantityPerHour:number|null;evidenceId:string|null;approved:boolean}};
export type CostPosition={id:string;position:string;unit:string;quantity:number|string};
/** Read-only calculation preview. Never extrapolate missing quantities or use historical EP/X84. */
export function previewGaebResourceCosts(gaeb:CostPosition,recipe:CostRecipe){
 if(!gaeb||!recipe||gaeb.id!==recipe.id||gaeb.position!==recipe.gaebPosition)throw Error('recipe_gaeb_identity_mismatch');
 const basis=determineBillingBasis(gaeb.unit,gaeb.quantity);
 const missing:string[]=[];
 if(!basis.contractQuantityUsable)missing.push('contract_quantity_invalid');
 if(!Array.isArray(recipe.components)||recipe.components.length===0)missing.push('resource_plan_missing');
 let subtotal=0;const lines=[] as {type:string;costPerUnitEUR:number|null;missing:string|null}[];
 for(const [i,c] of (recipe.components||[]).entries()){
  const ok=!!c&&c.approved===true&&!!c.evidenceId&&typeof c.type==='string'&&Number.isFinite(c.quantityPerUnit)&&c.quantityPerUnit!>0&&Number.isFinite(c.rateEUR)&&c.rateEUR!>=0;
  if(!ok){missing.push('resource_evidence_missing:'+i);lines.push({type:c?.type||'unknown',costPerUnitEUR:null,missing:'resource_evidence_missing'});continue;}
  const cost=c.quantityPerUnit!*c.rateEUR!;
  if(!Number.isFinite(cost)){missing.push('resource_cost_overflow:'+i);lines.push({type:c.type,costPerUnitEUR:null,missing:'overflow'});continue;}
  subtotal+=cost;lines.push({type:c.type,costPerUnitEUR:Math.round(cost*100)/100,missing:null});
 }
 if(!recipe.productivity?.approved||!recipe.productivity.evidenceId||!Number.isFinite(recipe.productivity.quantityPerHour)||recipe.productivity.quantityPerHour!<=0)missing.push('productivity_unverified');
 if(!Number.isFinite(subtotal)||!Number.isSafeInteger(Math.round(subtotal*100)))missing.push('subtotal_overflow');
 const total= basis.contractQuantityUsable ? subtotal*basis.contractQuantity! : NaN;
 if(basis.contractQuantityUsable&&(!Number.isFinite(total)||!Number.isSafeInteger(Math.round(total*100))))missing.push('contract_cost_overflow');
 const complete=missing.length===0;
 return {id:gaeb.id,contractQuantity:basis.contractQuantity,unit:gaeb.unit,lines,documentedSubtotalEUR:Number.isFinite(subtotal)&&Number.isSafeInteger(Math.round(subtotal*100))?Math.round(subtotal*100)/100:null,completeDirectCostPerUnitEUR:complete?Math.round(subtotal*100)/100:null,completeContractCostEUR:complete?Math.round(total*100)/100:null,missing,unitPriceEUR:null,productionWriteAllowed:false,status:'needs_review' as const};
}

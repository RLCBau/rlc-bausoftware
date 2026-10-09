import {determineBillingBasis} from './v3BillingQuantityBasis';
type Gaeb={id:string;position:string;unit:string;quantity:number|string;shortText:string};
type Recipe={id:string;gaebPosition:string;workKind:string;components:{type:string;quantityPerUnit:number|null;rateEUR:number|null;evidenceId:string|null;approved:boolean}[];productivity:{quantityPerHour:number|null;evidenceId:string|null;approved:boolean}};
/** Explicit identifier and unit match only; never map one billable unit to an arbitrary resource unit. */
export function linkGaebToRecipe(row:Gaeb,recipe:Recipe){
 if(row.id!==recipe.id||row.position!==recipe.gaebPosition)throw Error('gaeb_recipe_identity_mismatch');
 const basis=determineBillingBasis(row.unit,row.quantity);
 const missing=[...basis.missing];
 if(!basis.contractQuantityUsable)missing.push('quantity_unusable');
 if(!recipe.components?.length)missing.push('no_resource_plan');
 for(const [i,c] of (recipe.components||[]).entries())if(!c.approved||!c.evidenceId||c.quantityPerUnit===null||c.rateEUR===null||!Number.isFinite(c.quantityPerUnit)||!Number.isFinite(c.rateEUR)||c.quantityPerUnit<=0||c.rateEUR<0)missing.push('unverified_resource:'+i);
 if(!recipe.productivity?.approved||!recipe.productivity.evidenceId||!Number.isFinite(recipe.productivity.quantityPerHour)||recipe.productivity.quantityPerHour!<=0)missing.push('unverified_productivity');
 return {gaebId:row.id,position:row.position,workKind:recipe.workKind,contractQuantity:basis.contractQuantity,billingUnit:row.unit,resourceTypes:recipe.components.map(c=>c.type),missing:[...new Set(missing)],status:'needs_review' as const,unitPriceEUR:null,productionWriteAllowed:false};
}

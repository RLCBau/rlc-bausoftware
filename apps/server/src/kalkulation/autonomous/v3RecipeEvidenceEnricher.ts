import {calculateBeddingMaterialScenario} from './v3BeddingMaterialCost';
export type RecipeDraft={id:string;workKind:string;gaebPosition:string;components:any[]};
export type GaebOriginal={id:string;unit:string;shortText:string;longText:string};
/** Evidence-backed supplier scenario, never a verified site EP. */
export function enrichRecipeWithMarketEvidence(recipe:RecipeDraft,gaeb:GaebOriginal,marketPath:string){
 if(recipe.id!==gaeb.id)throw Error('gaeb_recipe_identity_mismatch');
 if(recipe.workKind!=='fine_aggregate_bedding')return {id:recipe.id,status:'needs_review' as const,materialScenario:null,missing:['technical_material_mapping_needed'],unitPriceEUR:null};
 const supplier='lampersberger_aiging_2026';
 const material=calculateBeddingMaterialScenario(gaeb,marketPath,supplier);
 return {id:recipe.id,status:'needs_review' as const,materialScenario:material.materialOnly?{...material.materialOnly,source:material.source,supplierId:supplier,sourceStatus:'published_reference_not_order_confirmation'}:null,missing:material.missing,unitPriceEUR:null};
}

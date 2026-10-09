export type RecipeCostLine={type:string;quantityPerUnit:number|null;rateEUR:number|null;evidenceId:string|null;approved:boolean};
export type DraftRecipe={id:string;gaebPosition:string;components:RecipeCostLine[];productivity:{quantityPerHour:number|null;evidenceId:string|null;approved:boolean};status:string;commercialEP:null};
/** Fail closed: distinguish a documented subtotal from a complete, approved price. */
export function evaluateDraftRecipe(recipe:DraftRecipe){
 const missing:string[]=[];let documentedSubtotalEUR=0;
 if(!recipe?.id||!recipe.gaebPosition||!Array.isArray(recipe.components)||!recipe.components.length)missing.push('invalid_recipe');
 for(const [i,line] of (recipe?.components||[]).entries()){
  if(line.approved!==true||!line.evidenceId||!Number.isFinite(line.quantityPerUnit)||!Number.isFinite(line.rateEUR)||line.quantityPerUnit!<=0||line.rateEUR!<0){missing.push('resource_unverified:'+i);continue;}
  documentedSubtotalEUR+=line.quantityPerUnit!*line.rateEUR!;
 }
 if(!recipe?.productivity?.approved||!recipe.productivity.evidenceId||!Number.isFinite(recipe.productivity.quantityPerHour)||recipe.productivity.quantityPerHour!<=0)missing.push('productivity_unverified');
 return {id:recipe?.id,status:'needs_review' as const,documentedSubtotalEUR:Math.round(documentedSubtotalEUR*100)/100,completeDirectCostEUR:missing.length?null:Math.round(documentedSubtotalEUR*100)/100,unitPriceEUR:null,missing,productionWriteAllowed:false};
}

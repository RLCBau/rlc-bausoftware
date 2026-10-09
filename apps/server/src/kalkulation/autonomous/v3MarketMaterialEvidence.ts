import fs from 'fs';
export type MaterialQuote={status:'matched'|'needs_review';material:string;unitPriceEURPerT:number|null;sourceId:string|null;reason:string[]};
/** Read supplier net list prices, NEVER a completed EP or historical X84 price. */
export function lookupMaterial2026(shortText:string,marketFile:string):MaterialQuote {
 const s=shortText.toLowerCase();
 const key=/splittbettung|feinsplitt/.test(s)&&/2\s*\/\s*5/.test(s)?'splitt_2_5':/frostschutz/.test(s)&&/0\s*\/\s*32/.test(s)?'frostschutz_0_32':null;
 if(!key)return {status:'needs_review',material:'unknown',unitPriceEURPerT:null,sourceId:null,reason:['material_signature_unresolved']};
 const sources=JSON.parse(fs.readFileSync(marketFile,'utf8')).sources as any[];
 const quotes=sources.filter(q=>Number.isFinite(q.materialPricesEURPerT?.[key])&&q.url);
 if(!quotes.length)return {status:'needs_review',material:key,unitPriceEURPerT:null,sourceId:null,reason:['no_documented_supplier_quote']};
 // Multiple regional suppliers: don't guess which applies to the project.
 if(quotes.length!==1)return {status:'needs_review',material:key,unitPriceEURPerT:null,sourceId:null,reason:['supplier_location_or_choice_missing',...quotes.map(q=>`${q.id}:${q.materialPricesEURPerT[key]} EUR/t`)]};
 return {status:'matched',material:key,unitPriceEURPerT:quotes[0].materialPricesEURPerT[key],sourceId:quotes[0].id,reason:[]};
}

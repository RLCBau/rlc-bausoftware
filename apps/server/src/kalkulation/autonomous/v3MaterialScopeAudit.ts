/** Independent takeoff of explicitly stated layer thickness; no guessed density or supplier. */
export function auditMaterialScope(workKind:string,shortText:string,longText:string,unit:string){
 const text=(shortText+' '+longText).toLowerCase();
 const u=unit.toLowerCase();
 const evidence:string[]=[];const missing:string[]=[];
 let volumeM3PerUnit:number|null=null;
 const explicit=text.match(/(?:schichtdicke|bettungsdicke|stärke|staerke)\s*:?\s*(\d+(?:[,.]\d+)?)\s*cm/);
 const inline=workKind==='coarse_aggregate_placement'?text.match(/\b(\d+(?:[,.]\d+)?)\s*cm\b/):null;
 const m=explicit||inline;
 if(m&&(u==='m²'||u==='m2')){volumeM3PerUnit=Number(m[1].replace(',','.'))/100;evidence.push('thickness_from_gaeb');}
 else missing.push('confirmed_thickness_and_area_unit');
 if(workKind==='fine_aggregate_bedding'&&/2\s*\/\s*5\s*mm/.test(text))evidence.push('grain_2_5_from_gaeb');
 else if(workKind!=='unbound_path_breakup')missing.push('material_grade_exact_match_needed');
 if(workKind==='unbound_path_breakup')missing.push('excavation_productivity','disposal_or_reuse_route','waste_density_if_mass_priced');
 else missing.push('supplier_approval','density_or_mass_evidence','transport','crew_productivity');
 return {workKind,volumeM3PerUnit,unit,source:'gaeb_text',evidence,missing,status:'needs_review' as const,unitPriceEUR:null};
}

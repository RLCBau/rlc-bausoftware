/** Extract only physical volumes from explicit layer thickness, never infer a density. */
export function quantifyBeddingPerSquareMetre(shortText:string,longText:string,unit:string){
 const full=(shortText+' '+longText).toLowerCase();
 const grain=/\b2\s*\/\s*5\s*mm\b/.test(full);
 const range=full.match(/bettungsdicke\s*:\s*(\d{1,2})\s*[-–]\s*(\d{1,2})\s*cm/);
 const reasons:string[]=[];
 if(!grain)reasons.push('grain_unconfirmed');
 if(!['m2','m²'].includes(unit.toLowerCase()))reasons.push('billing_unit_not_square_metre');
 if(!range)reasons.push('thickness_range_missing');
 const low=range?Number(range[1])/100:null;
 const high=range?Number(range[2])/100:null;
 if(low!==null&&(low<=0||high===null||high<low))reasons.push('invalid_thickness');
 // A volume is calculable, but kilograms and full EP require verified density and productivity.
 return {material:'splitt_2_5',volumeM3PerM2Low:reasons.length?null:low,volumeM3PerM2High:reasons.length?null:high,quantityBasis:'contract_text',unitPriceEUR:null,missing:['material_density_t_per_m3','supplier_selection','transport_eur_per_t','placement_team_hours_per_m2','overheads_and_profit',...reasons],status:'needs_review'} as const;
}

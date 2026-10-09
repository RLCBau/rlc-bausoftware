import fs from 'fs';
import {quantifyBeddingPerSquareMetre} from './v3QuantityTakeoff';
/** One documented supplier scenario, not an approved commercial EP. */
export function calculateBeddingMaterialScenario(row:{shortText:string;longText:string;unit:string},marketPath:string,supplierId:string){
 const takeoff=quantifyBeddingPerSquareMetre(row.shortText,row.longText,row.unit);
 const missing:string[]=[...takeoff.missing.filter(x=>x!=='material_density_t_per_m3'&&x!=='supplier_selection')];
 const supplier=(JSON.parse(fs.readFileSync(marketPath,'utf8')).sources as any[]).find(s=>s.id===supplierId);
 const density=supplier?.materialDensityTPerM3?.splitt_2_5;
 const price=supplier?.materialPricesEURPerT?.splitt_2_5;
 if(!supplier?.url||!Number.isFinite(density)||density<=0||!Number.isFinite(price)||price<=0)missing.push('supplier_density_or_price_missing');
 if(takeoff.volumeM3PerM2Low===null||takeoff.volumeM3PerM2High===null)missing.push('volume_missing');
 const available=!!supplier?.url&&Number.isFinite(density)&&density>0&&Number.isFinite(price)&&price>0&&takeoff.volumeM3PerM2Low!==null&&takeoff.volumeM3PerM2High!==null&&takeoff.missing.every(x=>['material_density_t_per_m3','supplier_selection','transport_eur_per_t','placement_team_hours_per_m2','overheads_and_profit'].includes(x));
 const round=(n:number)=>Math.round(n*1000)/1000;
 return {status:'needs_review' as const,scenarioSupplier:supplierId,source:supplier?.url||null,materialOnly:available?{densityTPerM3:density,priceEURPerT:price,tonnesPerM2:[round(takeoff.volumeM3PerM2Low!*density),round(takeoff.volumeM3PerM2High!*density)],costEURPerM2:[round(takeoff.volumeM3PerM2Low!*density*price),round(takeoff.volumeM3PerM2High!*density*price)]}:null,epEUR:null,missing};
}

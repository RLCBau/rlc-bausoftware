import {decomposeTechnicalPosition} from './technicalPositionDecomposer';
import {PERSONNEL_INTERNAL_COST_2026,MACHINE_MARKET_2026} from './tiefbauCostRates2026';
import type {RlcAutonomousCalcInput} from './types';

export type ComposedResource={type:'Lohn'|'Maschinen'|'Material'|'Transport'|'Entsorgung';name:string;quantity:number;unit:string;rateEUR:number;totalEUR:number;source:string};
export type TechnicalCostResult={status:'calculated'|'needs_review';unitPriceEUR:number|null;lines:ComposedResource[];reason:string[];scope:string;};
const money=(x:number)=>Math.round(x*100)/100;
/** Strict cost composer: rates only from central verified RLC 2026 anchors.
 * Nothing is priced if the recognized scope requires an unknown resource or output rate.
 * Internal personnel hourly costs are NOT commercial Regie selling rates.
 */
export function composeTechnicalCost(row:RlcAutonomousCalcInput):TechnicalCostResult {
 const d=decomposeTechnicalPosition(row);
 const short=String(row.kurztext||'').toLowerCase();
 const lines:ComposedResource[]=[];
 const reason=[...d.missing];
 const add=(type:ComposedResource['type'],name:string,qty:number,unit:string,rateEUR:number,source:string)=>{
   lines.push({type,name,quantity:qty,unit,rateEUR,totalEUR:money(qty*rateEUR),source});
 };
 if(d.object==='labour_hour'&&d.unit==='h'&&!/zulage|pauschal|zuschlag/.test(short)) {
   const role=/vorarbeiter|polier/.test(short)?'polier_lg6':/facharbeiter|spezial/.test(short)?'facharbeiter_lg4':/fachwerker|werker|helfer/.test(short)?'worker_lg3':null;
   if(role){add('Lohn',role,1,'h',PERSONNEL_INTERNAL_COST_2026[role],'RLC internal tariff 2026');}
   else reason.push('wage_group_not_identified');
 } else if(d.object==='excavator_hour'&&d.unit==='h') {
   const mass=short.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})\s*t\b/);
   const match14=mass&&Number(mass[1])<=14&&Number(mass[2])>=14;
   if(match14){add('Maschinen','excavator_14t',1,'h',MACHINE_MARKET_2026.excavator_14t.internalPerHour,'RLC 2026 machine internal cost');
     if(/fahrer|bediener|mit personal/.test(short)){add('Lohn','machine_operator_lg4',1,'h',PERSONNEL_INTERNAL_COST_2026.machine_operator_lg4,'RLC 2026 tariff internal cost');}}
   else reason.push('excavator_size_or_operator_scope_unverified');
 }else reason.push('resource_recipe_or_productivity_missing');
 if(!lines.length||reason.length)return {status:'needs_review',unitPriceEUR:null,lines,reason,scope:`${d.object}/${d.operation}`};
 return {status:'calculated',unitPriceEUR:money(lines.reduce((sum,l)=>sum+l.totalEUR,0)),lines,reason:[],scope:`${d.object}/${d.operation}`};
}

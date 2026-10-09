import {validateEvidence,type EvidenceBundle} from './technicalEvidence';
import {decomposeTechnicalPosition} from './technicalPositionDecomposer';
import {PERSONNEL_INTERNAL_COST_2026,MACHINE_MARKET_2026} from './tiefbauCostRates2026';
import type {RlcAutonomousCalcInput} from './types';
import type {TechnicalCostResult,ComposedResource} from './technicalCostComposer';

export type FrostschutzParameters={densityTPerCompactedM3:number;materialEURPerT:number;transportEURPerT:number;loaderM3PerHour:number;rollerM3PerHour:number;workerM3PerHour:number;materialSource:string;transportSource:string;productionSource:string;materialVerified:boolean;transportVerified:boolean;productionVerified:boolean;evidence:EvidenceBundle};
const round=(n:number)=>Math.round(n*100)/100;
/** Auditable productivity calculation; parameter evidence is mandatory. No heuristic fallback. */
export function calculateFrostschutzProduction(row:RlcAutonomousCalcInput,params?:Partial<FrostschutzParameters>):TechnicalCostResult {
 const d=decomposeTechnicalPosition(row);
 const reasons:string[]=[];
 const required:(keyof FrostschutzParameters)[]=['densityTPerCompactedM3','materialEURPerT','transportEURPerT','loaderM3PerHour','rollerM3PerHour','workerM3PerHour','materialSource','transportSource','productionSource','materialVerified','transportVerified','productionVerified','evidence'];
 if(d.object!=='frostschutz_layer'||!['m3','m³'].includes(d.unit)||!['install','construct'].includes(d.operation)) reasons.push('not_frostschutz_m3_construction');
 if(!d.dimensions.grain) reasons.push('grain_size_unknown');
 for(const key of required)if(params?.[key]===undefined||params?.[key]===null||params[key]==='')reasons.push('missing_'+key);
 for(const key of ['materialVerified','transportVerified','productionVerified'] as const)if(params?.[key]!==true)reasons.push('unverified_'+key);
 for(const key of required.slice(0,6))if(params?.[key]!==undefined&&(!(typeof params[key]==='number')||!Number.isFinite(params[key] as number)||(params[key] as number)<=0))reasons.push('invalid_'+key);
 const checks:[keyof EvidenceBundle,string,number|undefined][]=[['density','t/m3',params?.densityTPerCompactedM3],['material','EUR/t',params?.materialEURPerT],['transport','EUR/t',params?.transportEURPerT],['loaderProductivity','m3/h',params?.loaderM3PerHour],['rollerProductivity','m3/h',params?.rollerM3PerHour],['workerProductivity','m3/h',params?.workerM3PerHour]];
 for(const [key,unit,value] of checks)if(value!==undefined){
   const evidence=params?.evidence?.[key];
   if(!evidence)reasons.push('evidence_missing_'+key);
   else reasons.push(...validateEvidence(evidence,unit,value).map(issue=>key+'_'+issue));
 }
 if(reasons.length)return {status:'needs_review',unitPriceEUR:null,lines:[],reason:reasons,scope:'frostschutz_layer/construct'};
 const p=params as FrostschutzParameters;
 const lines:ComposedResource[]=[];
 const add=(type:ComposedResource['type'],name:string,quantity:number,unit:string,rateEUR:number,source:string)=>lines.push({type,name,quantity,unit,rateEUR,totalEUR:round(quantity*rateEUR),source});
 add('Material',`Frostschutz ${d.dimensions.grain} ex works`,p.densityTPerCompactedM3,'t',p.materialEURPerT,p.materialSource);
 add('Transport','Material transport',p.densityTPerCompactedM3,'t',p.transportEURPerT,p.transportSource);
 add('Maschinen','Wheel loader',1/p.loaderM3PerHour,'h',MACHINE_MARKET_2026.wheel_loader_09.internalPerHour,p.productionSource);
 add('Maschinen','Compaction roller',1/p.rollerM3PerHour,'h',MACHINE_MARKET_2026.roller_14t.internalPerHour,p.productionSource);
 add('Lohn','Facharbeiter',1/p.workerM3PerHour,'h',PERSONNEL_INTERNAL_COST_2026.facharbeiter_lg4,p.productionSource);
 return {status:'calculated',unitPriceEUR:round(lines.reduce((a,b)=>a+b.totalEUR,0)),lines,reason:[],scope:'frostschutz_layer/construct_direct_cost'};
}

export type AsphaltCutParameters={cuttingMPerHour:number;bladeWearEURPerM:number;operatorHoursPerMachineHour:number;evidence:{speed:import('./technicalEvidence').TechnicalEvidence;blade:import('./technicalEvidence').TechnicalEvidence;operator:import('./technicalEvidence').TechnicalEvidence}};
/** Road-saw output: EUR per linear metre, equipment, blade wear and labour. */
export function calculateAsphaltCutProduction(row:RlcAutonomousCalcInput,params?:Partial<AsphaltCutParameters>):TechnicalCostResult {
 const d=decomposeTechnicalPosition(row);
 const reasons:string[]=[];
 if(d.object!=='asphalt_cut'||!['m','lfm'].includes(d.unit)||d.operation!=='install')reasons.push('not_asphalt_cut_linear_metre');
 for(const k of ['cuttingMPerHour','bladeWearEURPerM','operatorHoursPerMachineHour'] as const){const value=params?.[k];if(value===undefined||!Number.isFinite(value)||value<=0)reasons.push('missing_or_invalid_'+k);}
 const checks:[keyof AsphaltCutParameters['evidence'],string,number|undefined][]=[['speed','m/h',params?.cuttingMPerHour],['blade','EUR/m',params?.bladeWearEURPerM],['operator','h/h',params?.operatorHoursPerMachineHour]];
 for(const [key,unit,value] of checks)if(value!==undefined){const proof=params?.evidence?.[key];if(!proof)reasons.push('missing_evidence_'+key);else reasons.push(...validateEvidence(proof,unit,value).map(x=>key+'_'+x));}
 if(reasons.length)return {status:'needs_review',unitPriceEUR:null,lines:[],reason:reasons,scope:'asphalt_cut/installation'};
 const p=params as AsphaltCutParameters;
 const hours=1/p.cuttingMPerHour;
 const lines:ComposedResource[]=[
  {type:'Maschinen',name:'Asphalt saw',quantity:hours,unit:'h',rateEUR:MACHINE_MARKET_2026.joint_saw.internalPerHour,totalEUR:round(hours*MACHINE_MARKET_2026.joint_saw.internalPerHour),source:p.evidence.speed.id},
  {type:'Material',name:'Diamond blade wear',quantity:1,unit:'m',rateEUR:p.bladeWearEURPerM,totalEUR:round(p.bladeWearEURPerM),source:p.evidence.blade.id},
  {type:'Lohn',name:'Saw operator',quantity:hours*p.operatorHoursPerMachineHour,unit:'h',rateEUR:PERSONNEL_INTERNAL_COST_2026.facharbeiter_lg4,totalEUR:round(hours*p.operatorHoursPerMachineHour*PERSONNEL_INTERNAL_COST_2026.facharbeiter_lg4),source:p.evidence.operator.id}
 ];
 return {status:'calculated',unitPriceEUR:round(lines.reduce((sum,line)=>sum+line.totalEUR,0)),lines,reason:[],scope:'asphalt_cut/direct_cost'};
}

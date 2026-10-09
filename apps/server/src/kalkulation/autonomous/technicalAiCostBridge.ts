import type {ComposedResource,TechnicalCostResult} from './technicalCostComposer';
import {checkTechnicalAiScope} from './technicalAiScopeGate';
export type ApprovedCostEvidence={type:string;task:string;qty:number;unit:string;rateEUR:number;sourceId:string;approvedBy:string;approvedAt:string};
const types:Record<string,ComposedResource['type']>={material:'Material',labour:'Lohn',equipment:'Maschinen',transport:'Transport',disposal:'Entsorgung'};
export function calculateApprovedAiResources(input:{shortText:string;longText:string;unit:string},ai:any,evidence:ApprovedCostEvidence[]):TechnicalCostResult {
 const problems=checkTechnicalAiScope(input.shortText,input.longText,input.unit,ai);
 const lines:ComposedResource[]=[];
 if(!Array.isArray(ai?.resourcePlan)||ai.resourcePlan.length===0)problems.push('empty_plan');
 for(const item of ai?.resourcePlan||[]){
  if(!types[item.type]){problems.push('unknown_resource');continue;}
  const matches=evidence.filter(x=>x.type===item.type&&x.task===item.task);
  if(matches.length!==1){problems.push('missing_or_ambiguous_approval');continue;}
  const x=matches[0];
  if(!x.sourceId||!x.approvedBy||!x.approvedAt||!x.unit||!Number.isFinite(x.qty)||x.qty<=0||!Number.isFinite(x.rateEUR)||x.rateEUR<0){problems.push('invalid_approved_resource');continue;}
  lines.push({type:types[x.type],name:x.task,quantity:x.qty,unit:x.unit,rateEUR:x.rateEUR,totalEUR:Math.round(x.qty*x.rateEUR*100)/100,source:x.sourceId});
 }
 if(problems.length)return {status:'needs_review',unitPriceEUR:null,lines,reason:problems,scope:'ai_direct_cost'};
 return {status:'calculated',unitPriceEUR:Math.round(lines.reduce((s,x)=>s+x.totalEUR,0)*100)/100,lines,reason:[],scope:'ai_direct_cost'};
}

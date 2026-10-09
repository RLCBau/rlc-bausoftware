import {checkTechnicalAiScope} from './technicalAiScopeGate';
export function proposeTechnicalScopeRepair(shortText:string,longText:string,unit:string,answer:any){
 const before=checkTechnicalAiScope(shortText,longText,unit,answer);
 const suggested=JSON.parse(JSON.stringify(answer||{}));
 const resources=Array.isArray(suggested.resourcePlan)?suggested.resourcePlan:[];
 suggested.resourcePlan=resources;
 const added:string[]=[];
 for(const [issue,type] of [['transport_missing','transport'],['disposal_missing','disposal']]){
  if(before.includes(issue)&&!resources.some((x:any)=>x.type===type)){
   resources.push({type,task:'Contractual requirement: '+type,quantityPerUnit:null,quantityUnit:'unknown',reason:'Requires site and quantity verification'});
   added.push(type);
  }
 }
 if(before.includes('existing_material_purchase_risk')){
  for(const x of resources)if(x.type==='material')x.reason='EXISTING MATERIAL: purchase not permitted without verification';
  added.push('existing_material_warning');
 }
 suggested.needsReview=true;
 return {suggested,added,before,after:checkTechnicalAiScope(shortText,longText,unit,suggested),requiresApproval:true};
}

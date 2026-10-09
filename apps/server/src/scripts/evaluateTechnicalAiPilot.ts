import fs from 'fs';
import {checkTechnicalAiScope} from '../kalkulation/autonomous/technicalAiScopeGate';
const sample=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const answers=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
const reference=new Map<string,any>(sample.positions.map((p:any)=>[p.id,p]));
const detail:any[]=[];
for(const answer of answers.responses){
 const p=reference.get(answer.id);
 if(!p)continue;
 const a=answer.result;
 const issues=a?checkTechnicalAiScope(p.shortText,p.longText,p.unit,a):['no_model_answer'];
 const format=[...(answer.validationErrors||[])].filter((x:string)=>!issues.includes(x));
 const workUnderstood=Boolean(a?.mainWork&&a?.operation)&&!issues.some((x:string)=>x.includes('misread')||x.includes('operation')||x.includes('unit'));
 const resourcesComplete=workUnderstood&&Array.isArray(a.resourcePlan)&&a.resourcePlan.length>0&&!issues.some((x:string)=>x.includes('missing')||x.includes('purchase_risk'))&&!format.some((x:string)=>x.includes('resource')||x.includes('missing_inputs'));
 const documentedCost=false; // no supplier evidence, measured productivity and signed off Urkalkulation provided by model
 detail.push({id:p.id,trade:p.trade,position:p.position,workUnderstood,resourcesComplete,documentedCost,formatValid:format.length===0,scopeIssues:issues,formatIssues:format,requiresHumanReview:true});
}
const sum=(field:string)=>detail.filter((p:any)=>p[field]).length;
const output={evaluated:detail.length,workUnderstoodPreliminary:sum('workUnderstood'),resourceCompletePreliminary:sum('resourcesComplete'),documentedCost:sum('documentedCost'),formatValid:sum('formatValid'),caveat:'Heuristic gates only; not human technical ground truth',detail};
fs.writeFileSync(process.argv[4],JSON.stringify(output,null,2));
console.log(JSON.stringify({evaluated:output.evaluated,workUnderstoodPreliminary:output.workUnderstoodPreliminary,resourceCompletePreliminary:output.resourceCompletePreliminary,documentedCost:output.documentedCost,formatValid:output.formatValid}));

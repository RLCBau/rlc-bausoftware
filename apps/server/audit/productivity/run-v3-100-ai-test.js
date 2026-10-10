const fs=require('fs');
const {analyzeWithLunaV3}=require('../../src/kalkulation/autonomous/v3LunaAiAnalysis');
const src=JSON.parse(fs.readFileSync(__dirname+'/v3-100-reference-audit.json','utf8')).rows;
const outfile='/tmp/rlc-v3-100-ai-results.jsonl';
const previous=fs.existsSync(outfile)?fs.readFileSync(outfile,'utf8').trim().split('\n').filter(Boolean).map(s=>JSON.parse(s)):[];
const entries=new Array(src.length);
for(const row of previous) entries[row.index]=row;
const pending=src.map((_,i)=>i).filter(i=>!entries[i]).slice(0,15);
let next=0,done=0;
async function worker(){
 while(next<pending.length){
  const i=pending[next++],r=src[i];
  const row={index:i,id:r.id,trade:r.trade,position:r.position,shortText:r.shortText};
  try {
   const x=await analyzeWithLunaV3({trade:r.trade,kurztext:r.shortText,langtext:r.longText||"",einheit:String(r.unit||r.einheit||'')});
   Object.assign(row,{ok:true,provider:x.provider,model:x.model,operation:x.interpretation.operation,
    mainWork:x.interpretation.mainWork,resources:x.interpretation.resourcePlan,
    missing:x.interpretation.missingTechnicalInputs,topFamilies:x.candidate.candidates.slice(0,3).map(c=>({family:c.family,score:c.score,eligible:c.eligible})),
    approved:x.approvedForEP,ep:x.unitPrice});
  } catch(e){Object.assign(row,{ok:false,error:String(e.message||e).slice(0,220)})}
  entries[i]=row;fs.appendFileSync(outfile,JSON.stringify(row)+'\n');
  done++;if(done%10===0)console.log('PROGRESS',done);
 }
}
(async()=>{await Promise.all(Array.from({length:3},worker));const o={count:entries.filter(Boolean).length,pending:src.length-entries.filter(Boolean).length,success:entries.filter(r=>r&&r.ok).length,errors:entries.filter(r=>r&&!r.ok).length,
provider:[...new Set(entries.filter(r=>r&&r.ok).map(r=>r.provider))],model:[...new Set(entries.filter(r=>r&&r.ok).map(r=>r.model))],
resourcesFound:entries.filter(r=>r&&r.ok&&r.resources.length>0).length,candidatesFound:entries.filter(r=>r&&r.ok&&r.topFamilies.length>0).length,
operationResolved:entries.filter(r=>r&&r.ok&&r.operation!=='unknown').length,
approvedEP:entries.filter(r=>r&&r.approved).length};
fs.writeFileSync('/tmp/rlc-v3-100-ai-summary.json',JSON.stringify(o,null,2));console.log('FINAL',JSON.stringify(o));})().catch(e=>{console.error('FATAL',e);process.exitCode=1});

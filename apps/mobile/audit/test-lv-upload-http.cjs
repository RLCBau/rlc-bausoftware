const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),ts=require('typescript');
const src=fs.readFileSync(path.resolve(__dirname,'../src/screens/LvImportScreen.tsx'),'utf8');
const start=src.indexOf('async function uploadImportFile('),end=src.indexOf('export default function LvImportScreen(',start);
assert(start>=0&&end>start);
const compiled=ts.transpileModule(src.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
class FormDataFake{constructor(){this.files=[]}append(...x){this.files.push(x)}}
async function scenario(token,status,payload,expected){
 let requests=[];const fetchFake=async(url,opts)=>{requests.push({url,opts});return {status,ok:status>=200&&status<300,text:async()=>JSON.stringify(payload)}};
 const fun=Function('getToken','resolveApiBase','FormData','guessMimeType','fetch',compiled+';return uploadImportFile;')(
 async()=>token,async()=>'https://fake.invalid',FormDataFake,()=> 'application/xml',fetchFake
 );
 const args={projectCode:'QA BA/2026',file:{uri:'file:///qa.x83',name:'qa.x83'},sourceType:'x83'};
 if(expected==='success'){const r=await fun(args);assert(r.ok);assert.equal(requests.length,1);assert.equal(requests[0].opts.headers.Authorization,'Bearer '+token);assert(requests[0].url.includes('QA%20BA%2F2026'));assert.equal(requests[0].opts.body.files.length,1)}
 else {await assert.rejects(()=>fun(args),expected);assert.equal(requests.length,token?1:0)}
}
(async()=>{await scenario(null,200,{ok:true},/Anmeldung erforderlich/);await scenario('qa-token',401,{error:'Kein Token'},/Kein Token/);await scenario('qa-token',403,{error:'PROJECT_LV_WRITE_FORBIDDEN'},/PROJECT_LV_WRITE_FORBIDDEN/);await scenario('qa-token',200,{ok:true,count:16},'success');console.log('PASS LV upload functional auth + 401/403/200, real request payload verified')})().catch(e=>{console.error(e);process.exitCode=1});

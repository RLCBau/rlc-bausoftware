const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
let calls=0,valid=false,lastRow=null;
const files=[{uri:'file:///local/a.jpg',name:'same.jpg',type:'image/jpeg'},{uri:'file:///local/b.jpg',name:'same.jpg',type:'image/jpeg'}];
const item={id:'ls1',kind:'LIEFERSCHEIN',projectId:'BA-2026-QA',status:'PENDING',tries:0,payload:{date:'2026-10-16',files,row:{id:'doc1',date:'2026-10-16',photos:[files[0]],attachments:files,workflowStatus:'EINGEREICHT'}}};
const queue={queueList:async()=>[{...item}],queueUpdate:async(id,patch)=>Object.assign(item,patch)};
const api={api:{projects:async()=>[],getApiUrl:async()=> 'https://test.invalid',pushLieferscheinToServer:async(pk,row)=>{
  calls++;assert.equal(pk,'BA-2026-QA');lastRow=row;
  return valid?{ok:true,docId:'doc1'}:{ok:false,docId:'doc1'};
},commitLieferscheinLegacy:async()=>{throw Error('APPROVAL_ROUTE_MUST_NOT_RUN');}}};
const source=path.resolve(__dirname,'../src/lib/sync.ts'),js=ts.transpileModule(fs.readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const mod=new Module(source,module);mod.filename=source;mod.paths=Module._nodeModulePaths(path.dirname(source));
mod.require=name=>name==='./api'?api:name==='./offlineQueue'?queue:name==='./auth'?{getServerToken:async()=> 'test'}:require(name);
mod._compile(js,source);
(async()=>{
let r=await mod.exports.syncAll();assert.deepEqual(r,{ok:0,fail:1});assert.equal(item.status,'ERROR');
assert.equal(lastRow.workflowStatus,'EINGEREICHT');assert.equal(lastRow.attachments.length,2);assert.equal(lastRow.photos.length,0);
assert.equal(lastRow.id,'doc1');assert.equal(lastRow.projectCode,'BA-2026-QA');
item.nextTryAt=0;valid=true;
r=await mod.exports.syncAll();assert.deepEqual(r,{ok:1,fail:0});assert.equal(item.status,'DONE');
assert.equal(calls,2);
console.log('PASS LS: queue routes to Eingang/Pruefung, never approval; server rejection remains retryable; 2 attachments retained');
})().catch(e=>{console.error(e);process.exitCode=1;});
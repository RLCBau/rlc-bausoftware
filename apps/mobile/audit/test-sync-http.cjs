const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const items = [
  {id:"a",kind:"RECHNUNG", projectId:"BA-2026-A", status:"PENDING", tries:0,payload:{row:{id:"invoice-a"}}},
  {id:"b",kind:"RECHNUNG", projectId:"BA-2026-B", status:"PENDING", tries:0,payload:{row:{id:"invoice-b"}}}
];
let response=200;
const calls=[];
const mockQueue = {
  queueList: async () => items.map(x=>({...x})),
  queueUpdate: async (id, patch) => Object.assign(items.find(x=>x.id===id),patch)
};
const mockApi={api:{ projects: async()=>[], getApiUrl: async()=>"https://api.test.invalid" }};
global.fetch=async (url,init)=>{
  calls.push({url,body:JSON.parse(init.body)});
  if(response===0) throw new Error("Network request failed");
  return {ok:response===200,status:response,text:async()=>response===200?'{"ok":true}':"invalid request"};
};
const source=path.resolve(__dirname,"../src/lib/sync.ts");
const js=ts.transpileModule(fs.readFileSync(source,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const mod=new Module(source,module); mod.filename=source; mod.paths=Module._nodeModulePaths(path.dirname(source));
mod.require=(name)=>name==="./api"?mockApi:name==="./offlineQueue"?mockQueue:name==="./auth"?{getServerToken:async()=>"test"}:require(name);
mod._compile(js,source);
(async()=>{
  let r=await mod.exports.syncAll({projectCode:"BA-2026-A"});
  assert.deepEqual(r,{ok:1,fail:0});
  assert.equal(items[0].status,"DONE");
  assert.equal(items[1].status,"PENDING");
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/BA-2026-A\/RECHNUNG\/submit/);
  response=500;
  r=await mod.exports.syncAll({projectCode:"BA-2026-B"});
  assert.deepEqual(r,{ok:0,fail:1});
  assert.equal(items[1].status,"ERROR");
  assert.equal(items[1].tries,1);
  assert.ok(items[1].nextTryAt > Date.now());
  r=await mod.exports.syncAll({projectCode:"BA-2026-B"});
  assert.deepEqual(r,{ok:0,fail:0});
  assert.equal(calls.length,2,"no HTTP repeat before backoff");
  items[1].nextTryAt=Date.now()-100;
  response=0;
  r=await mod.exports.syncAll({projectCode:"BA-2026-B"});
  assert.deepEqual(r,{ok:0,fail:1});
  assert.equal(items[1].status,"PENDING");
  assert.equal(items[1].tries,1,"offline rollback retry count");
  assert.ok(items[1].nextTryAt > Date.now());
  console.log("PASS syncAll: project isolation, server errors/backoff, offline handling");
})().catch(e=>{console.error(e);process.exitCode=1;});

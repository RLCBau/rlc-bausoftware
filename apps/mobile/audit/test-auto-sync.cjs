const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
let mode='NUR_APP',token='good',due=true,online=true,called=0;
const mock={
'./api':{api:{health:async()=>({ok:online})}},
'./auth':{getAuthMode:async()=>mode,getServerToken:async()=>token},
'./offlineQueue':{queueList:async()=>[{status:'PENDING',tries:0,nextTryAt:due?null:Date.now()+120000}]},
'./sync':{syncAll:async()=>{called++;return {ok:1,fail:0}}}};
const file=path.resolve(__dirname,'../src/lib/autoSync.ts');
const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m.require=name=>mock[name]??require(name);m._compile(js,file);
(async()=>{
assert.equal(await m.exports.resumePendingServerSync(),false);
mode='SERVER_SYNC';token='';assert.equal(await m.exports.resumePendingServerSync(),false);
token='good';due=false;assert.equal(await m.exports.resumePendingServerSync(),false);
due=true;online=false;assert.equal(await m.exports.resumePendingServerSync(),false);
online=true;assert.equal(await m.exports.resumePendingServerSync(),true);
assert.equal(called,1,'only eligible authenticated foreground work triggers sync');
console.log('PASS auto recovery: local mode blocked, missing auth blocked, backoff respected, health gate, eligible retry');
})().catch(e=>{console.error(e);process.exitCode=1});
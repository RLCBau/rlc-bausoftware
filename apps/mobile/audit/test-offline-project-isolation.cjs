const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const memory = new Map();
let idCounter = 0;
const storage = {
  getJson: async (key, fallback) => memory.has(key) ? memory.get(key) : fallback,
  setJson: async (key, value) => { memory.set(key, value); },
  uid: (prefix) => prefix + "_" + (++idCounter),
};
const source = path.resolve(__dirname, "../src/lib/offlineQueue.ts");
const javascript = ts.transpileModule(fs.readFileSync(source, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;
const loaded = new Module(source, module);
loaded.filename = source;
loaded.paths = Module._nodeModulePaths(path.dirname(source));
loaded.require = (name) => name === "./storage" ? storage : require(name);
loaded._compile(javascript, source);
const q = loaded.exports;
(async () => {
  const a = await q.queueAdd({kind:"RECHNUNG",projectId:"BA-2026-ALFA",payload:{row:{id:"invoice_a"}}});
  const b = await q.queueAdd({kind:"RECHNUNG",projectId:"BA-2026-BETA",payload:{row:{id:"invoice_b"}}});
  const calls=[];
  const r=await q.queueFlushProject("BA-2026-ALFA",async item=>{calls.push(item.projectId); return {accepted:true};});
  assert.equal(r.done,1);
  assert.deepEqual(calls,["BA-2026-ALFA"]);
  const after=await q.queueList();
  assert.equal(after.find(x=>x.id===a.id).status,"DONE");
  assert.equal(after.find(x=>x.id===b.id).status,"PENDING");
  const other=await q.queueFlushProject("BA-2026-BETA",async item=>{calls.push(item.projectId); return {accepted:true};});
  assert.equal(other.done,1);
  assert.deepEqual(calls,["BA-2026-ALFA","BA-2026-BETA"]);
  assert.equal((await q.queueList()).find(x=>x.id===b.id).status,"DONE");
  console.log("PASS isolated project sync: no false DONE for other company/project");
})().catch(e=>{console.error(e);process.exitCode=1;});

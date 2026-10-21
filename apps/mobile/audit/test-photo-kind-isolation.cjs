const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const memory = new Map();
let sequence = 0;
const storage = {
  getJson: async (key, fallback) => memory.has(key) ? memory.get(key) : fallback,
  setJson: async (key, value) => { memory.set(key, value); },
  uid: prefix => prefix + (++sequence),
};
const source = path.resolve(__dirname, "../src/lib/offlineQueue.ts");
const javascript = ts.transpileModule(fs.readFileSync(source, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;
const loaded = new Module(source, module);
loaded.filename = source;
loaded.paths = Module._nodeModulePaths(path.dirname(source));
loaded.require = name => name === "./storage" ? storage : require(name);
loaded._compile(javascript, source);

(async () => {
  const q = loaded.exports;
  const photo = await q.queueAdd({kind:"PHOTO_NOTE",projectId:"BA-2026-ALFA",payload:{row:{id:"p1"}}});
  const invoice = await q.queueAdd({kind:"RECHNUNG",projectId:"BA-2026-ALFA",payload:{row:{id:"i1"}}});
  const otherPhoto = await q.queueAdd({kind:"PHOTO_NOTE",projectId:"BA-2026-BETA",payload:{row:{id:"p2"}}});
  const executed = [];
  const result = await q.queueProcessPending(async item => {
    executed.push(item.id);
    return {ok:true};
  }, {projectId:"BA-2026-ALFA",kinds:["PHOTO_NOTE","FOTOS_NOTIZEN"]});
  const after = await q.queueList();
  assert.equal(result.done,1);
  assert.deepEqual(executed,[photo.id]);
  assert.equal(after.find(i=>i.id===photo.id).status,"DONE");
  assert.equal(after.find(i=>i.id===invoice.id).status,"PENDING","Invoice must not be acknowledged by photos");
  assert.equal(after.find(i=>i.id===otherPhoto.id).status,"PENDING","Other project must stay pending");
  console.log("PASS photo queue kind/project isolation: no false DONE for invoice or other project");
})().catch(e=>{console.error(e);process.exitCode=1;});

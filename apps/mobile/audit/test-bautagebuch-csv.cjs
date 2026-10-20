const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),ts=require("typescript");
const source=fs.readFileSync(path.join(__dirname,"../src/screens/BautagebuchScreen.tsx"),"utf8").replace(/\r\n/g,"\n");
const match=source.match(/const esc = \(v: any\) => \{[\s\S]*?\n      \};/);
assert(match,"Bautagebuch CSV cell escaping missing");
const transformed=ts.transpileModule(match[0].replace("const esc", "var esc"),{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
const esc=new Function(transformed+";return esc;")();
for(const value of ["=1+1","+SUM(1,2)","-2+3","@cmd"," =CMD"]) {
 const cell=esc(value);
 assert(cell.startsWith('"\''),JSON.stringify({value,cell}));
}
assert.equal(esc('Mitarbeiter "A"; B'),'"Mitarbeiter ""A""; B"');
assert.equal(esc("normal"),'"normal"');
console.log("PASS Bautagebuch CSV: formula protection and RFC-style quotes");

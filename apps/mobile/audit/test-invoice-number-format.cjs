const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
for(const file of ['RechnungEditorScreen.tsx','AbschlagEditorScreen.tsx']){
 const source=fs.readFileSync(path.resolve(__dirname,'../src/screens',file),'utf8');
 const match=source.match(/function num\(v: string \| number \| null \| undefined\) \{[\s\S]*?\n\}/);assert(match,file+' parser missing');
 const js=ts.transpileModule(match[0],{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
 const num=new Function(js+';return num;')();
 for(const [raw,want] of [['1.234,56',1234.56],['2,5',2.5],['12.5',12.5],['-100,25',-100.25],['',0]])assert.equal(num(raw),want,file+' '+raw);
 const net=num('2,5')*num('1.234,56');assert(Math.abs(net-3086.4)<0.000001);
 assert.equal(Math.round(net*.19*100)/100,586.42);
 assert.equal(net*0,0);
 console.log('PASS invoice parser',file,'netto',net,'VAT19',586.42,'VAT0',0);
}

import iconv from "iconv-lite";
import { buildGaeb90 } from "../gaeb/gaeb90";
import { buildGaeb2000 } from "../gaeb/gaeb2000";
import { parseGaeb90TextImport, parseGaeb2000TextImport, gaebImportRole } from "../routes/projectLv";
import fs from "fs";

const rows:any[] = [
  { posNr:"01.01.0001", kurztext:"Flächen prüfen für Öl", langtext:"Straße öffnen – fachgerecht prüfen.", einheit:"m3", menge:12.345, preis:67.89 },
  { posNr:"01.01.0002", kurztext:"Bauzaun stellen", langtext:"Bauzaun liefern und vorhalten.", einheit:"m", menge:25, preis:14.5 }
];
const project:any={code:"TEST-001",name:"GAEB Legacy Test"};
const company:any={name:"RLC Test GmbH",address:"Musterstraße 1, 83435 Bad Reichenhall",email:"test@example.de",phone:"000"};
const owner:any={name:"Auftraggeber Test",street:"Hauptstraße 2",pcode:"83435",city:"Bad Reichenhall"};

let failures=0;
function ok(cond:boolean,msg:string){ if(!cond){ failures++; console.error("FAIL",msg); } else console.log("OK  ",msg); }
function near(a:any,b:number,tol=0.001){ return Math.abs(Number(a)-b)<=tol; }

const dFormats=["D81","D82","D83","D84","D85","D86"] as const;
for(const format of dFormats){
  const built=buildGaeb90({format,rows,project,company,owner,createdAt:new Date("2026-10-06T08:00:00Z")});
  const decoded=iconv.decode(iconv.encode(built,"cp850"),"cp850");
  const parsed=parseGaeb90TextImport(decoded);
  ok(parsed.items.length===2,`${format}: 2 Positionen`);
  ok(parsed.items[0]?.pos==="01.01.0001",`${format}: OZ 01.01.0001`);
  if(format === "D84") {
    ok(parsed.items[0]?.quantity == null,`${format}: Menge standardmäßig leer`);
    ok(!parsed.items[0]?.unit,`${format}: ME standardmäßig leer`);
    ok(!parsed.items[0]?.text,`${format}: Text standardmäßig leer`);
  } else {
    ok(near(parsed.items[0]?.quantity,12.345),`${format}: Menge 12,345`);
    ok(parsed.items[0]?.unit==="m3",`${format}: ME m3`);
    ok(String(parsed.items[0]?.text||"").includes("Flächen"),`${format}: Umlaut/Text`);
  }
  const shouldPrice=["D82","D84","D85","D86"].includes(format);
  ok(shouldPrice ? near(parsed.items[0]?.ep,67.89,0.01) : parsed.items[0]?.ep==null,`${format}: EP ${shouldPrice?"67,89":"leer"}`);
  if(format==="D84"){
    ok(parseGaeb90TextImport(decoded.replace(/\r\n/g,"\r")).items.length===2,"D84: CR-only");
    ok(parseGaeb90TextImport(decoded.replace(/\r\n/g,"")).items.length===2,"D84: 80-Zeichen ohne Zeilenumbruch");
  }
}

const pFormats=["P81","P82","P83","P84","P85","P86"] as const;
for(const format of pFormats){
  const built=buildGaeb2000({format,rows,project,company,owner,createdAt:new Date("2026-10-06T08:00:00Z")});
  const decoded=iconv.decode(iconv.encode(built,"win1252"),"win1252");
  const parsed=parseGaeb2000TextImport(decoded);
  ok(parsed.items.length===2,`${format}: 2 Positionen`);
  if(format === "P84") {
    ok(parsed.items[0]?.quantity == null,`${format}: Menge standardmäßig leer`);
    ok(!parsed.items[0]?.unit,`${format}: ME standardmäßig leer`);
    ok(!parsed.items[0]?.text,`${format}: Text standardmäßig leer`);
  } else {
    ok(near(parsed.items[0]?.quantity,12.345),`${format}: Menge 12,345`);
    ok(parsed.items[0]?.unit==="m3",`${format}: ME m3`);
    ok(String(parsed.items[0]?.text||"").includes("Flächen"),`${format}: Windows-1252/Umlaut`);
  }
  const shouldPrice=["P82","P84","P85","P86"].includes(format);
  ok(shouldPrice ? near(parsed.items[0]?.ep,67.89,0.01) : parsed.items[0]?.ep==null,`${format}: EP ${shouldPrice?"67,89":"leer"}`);
}

const roles:Record<string,string>={
  D81:"technical",D82:"technical",D83:"technical",D84:"bid-reference",D85:"transaction",D86:"transaction",
  P81:"technical",P82:"technical",P83:"technical",P84:"bid-reference",P85:"transaction",P86:"transaction",P94:"trade-price-reference",
  X84:"bid-reference",X89:"transaction"
};
for(const [fmt,role] of Object.entries(roles)) ok(gaebImportRole(fmt)===role,`${fmt}: Rolle ${role}`);

const realP83="data/projects/GAEB-ERDBAU/imports/Erdbau.P83";
if(fs.existsSync(realP83)){
  const parsed=parseGaeb2000TextImport(iconv.decode(fs.readFileSync(realP83),"win1252"));
  const hit=parsed.items.find((x:any)=>String(x.text||"").startsWith("Grabenaushub neben Gebäude"));
  ok(!!hit,"P83 real: Referenzposition gefunden");
  ok(hit?.pos==="01.01.03.1.1.0010","P83 real: LVGlied -> 01.01.03.1.1.0010");
}

const projectRoot="data/projects";
if(fs.existsSync(projectRoot)){
  const files:string[]=[];
  for(const projectDir of fs.readdirSync(projectRoot)){
    const imports=`${projectRoot}/${projectDir}/imports`;
    if(!fs.existsSync(imports)) continue;
    for(const name of fs.readdirSync(imports)){
      if(/\.(?:d8[1-6]|p8[1-6]|p94)$/i.test(name)) files.push(`${imports}/${name}`);
    }
  }
  let realOk=0, realEmpty=0;
  for(const file of files){
    const isD=/\.d8[1-6]$/i.test(file);
    try{
      const parsed=isD
        ? parseGaeb90TextImport(iconv.decode(fs.readFileSync(file),"cp850"))
        : parseGaeb2000TextImport(iconv.decode(fs.readFileSync(file),"win1252"));
      if(parsed.items.length>0) realOk++; else { realEmpty++; console.error("EMPTY REAL",file); }
    }catch(e:any){ realEmpty++; console.error("ERROR REAL",file,e?.message||e); }
  }
  console.log(`REAL LEGACY SCAN: ${realOk}/${files.length} mit Positionen, ${realEmpty} leer/fehlerhaft`);
  ok(realEmpty===0,"Reale D/P-Dateien: keine Parser-Leerläufe");
}

if(failures){ console.error(`\nRESULT: ${failures} FAIL`); process.exit(1); }
console.log("\nRESULT: ALL LEGACY GAEB IMPORT TESTS PASS");

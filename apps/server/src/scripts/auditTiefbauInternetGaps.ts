import { calculateAutonomousUrkalkulation } from "../kalkulation/autonomous/autonomousUrkalkulationEngine";
const ctx:any={projectType:"Tiefbau",trade:"Tiefbau",difficulty:"medium",logisticsRisk:"medium",trafficRisk:"medium",durationRisk:"medium",marketFactor:1,distanceFactor:1,confidence:0.9,warnings:[]};
type C={group:string,text:string,unit:string};
const cases:C[]=[];

for(const mat of ["Beton","Kunststoff"]) for(const w of [150,200,300,400,500,600]) for(const cover of [""," mit Deckel"])
  cases.push({group:"DB-KANAL",text:`${mat} Kabelkanaltrog B ${w} mm${cover} verlegen`,unit:"m"});
for(const a of ["Kabelkanal öffnen","Kabelkanal aufdeckeln","Kabelkanal reinigen","Kabelkanal schließen"])
  cases.push({group:"DB-BESTAND",text:a,unit:"m"});
for(const t of ["Niederspannung","Mittelspannung 20 kV","Telekom","LWL"])
  for(const what of ["Muffengrube herstellen","Muffenbausatz liefern und einbauen"])
    cases.push({group:"MUFFE",text:`${t} ${what}`,unit:what.includes("Grube")?"St":"St"});
for(const dn of [63,90,110,125,160,200,250])
  cases.push({group:"GETEILT-KSR",text:`Zweigeteiltes flexibles Kabelschutzrohr DN${dn} um Bestandskabel montieren`,unit:"m"});
for(const loc of ["Außenbereich","Innenbereich"]) cases.push({group:"LWL-SCHRANK",text:`LWL-Muffenschrank ${loc} mit Sockel aufstellen`,unit:"St"});
for(const dn of [50,63,90,110,125,160,200])
  cases.push({group:"ZUGDRAHT",text:`Kabelziehdraht in Leerrohr DN${dn} einziehen`,unit:"m"});
for(const dn of [50,63,90,110,125,160,200])
  for(const a of ["Schutzrohr reinigen","Rohr kalibrieren"])
    cases.push({group:"ROHR-PRUEF",text:`${a} DN${dn}`,unit:"m"});

for(const dn of [300,400,500,600]) for(const len of [4,6,8,10])
  cases.push({group:"RW-BEHANDLUNG",text:`Regenwasserbehandlungsanlage Sedimentationsanlage DN${dn} L = ${len},00 m herstellen`,unit:"St"});
for(const dn of [1000,1200,1500]) for(const cls of ["B125","D400"])
  cases.push({group:"RW-FILTER",text:`Regenwasser-Filterschacht DN${dn} Klasse ${cls} liefern und setzen`,unit:"St"});
for(const dn of [100,125,150,200,250,300])
  cases.push({group:"RUECKSTAU",text:`Rückstauklappe DN${dn} liefern und einbauen`,unit:"St"});
for(const ns of [3,6,10,15,20,30])
  cases.push({group:"ABSCHEIDER",text:`Leichtflüssigkeitsabscheider NS ${ns} mit Koaleszenzeinsatz liefern und setzen`,unit:"St"});
for(const dn of [800,1000,1200,1500,2000])
  cases.push({group:"DRUCKENTSP",text:`Druckentspannungsschacht DN${dn} herstellen`,unit:"St"});

for(const med of ["Trinkwasser","Abwasser"]) for(const dn of [50,80,100,150])
  cases.push({group:"BEG",text:`${med} Be- und Entlüftungsgarnitur DN${dn} liefern und einbauen`,unit:"St"});
for(const use of ["Hydrant","Schieber","Armatur","Universal"])
  for(const typ of ["Straßenkappe","Straßenkappe einwalzbar VE"])
    cases.push({group:"KAPPE",text:`${typ} für ${use} liefern und setzen`,unit:"St"});
for(const cm of [5,10,15,20,25,30])
  cases.push({group:"RING",text:`Distanzring Schachtabdeckung ${cm} cm liefern und setzen`,unit:"St"});
for(const cm of [10,15,20,25,30])
  cases.push({group:"SCHACHT-ANPASS",text:`Schachtabdeckung anpassen Höhe ${cm}-${cm+5} cm in Pflasterfläche`,unit:"St"});

for(const d of [0.6,0.8,1.0,1.2,1.5])
  cases.push({group:"WURZEL",text:`Wurzelvorhang ${d.toString().replace(".",",")} m tief herstellen`,unit:"m"});
for(const dia of [3,5,8,12,20])
  cases.push({group:"WURZEL",text:`Wurzelrückschnitt an Wurzeln bis ${dia} cm Durchmesser fachgerecht durchführen`,unit:"St"});
for(const v of [6,9,12,15,18,24])
  cases.push({group:"BAUMGRUBE",text:`Baumpflanzgrube ${v} m3 herstellen`,unit:"St"});
for(const typ of ["Baumsubstrat","Baumsubstrat strukturstabil überbaubar Bauweise 2"])
  for(const q of ["Liefern und einbauen","Nachverdichten und profilieren"])
    cases.push({group:"BAUMSUBSTRAT",text:`${typ} ${q}`,unit:"m³"});
for(const phase of ["Fertigstellungspflege","Entwicklungspflege"])
  for(const obj of ["Bäume","Sträucher","Rasen","Staudenflächen"])
    cases.push({group:"PFLEGE",text:`${phase} ${obj} durchführen`,unit:"m²"});

for(const cls of ["C250","D400","F900"]) for(const typ of ["Guss","Edelstahl"])
  cases.push({group:"BRUECKE",text:`Brückenablauf ${typ} Klasse ${cls} liefern und einbauen`,unit:"St"});

const generic = new Set(["Kanalbauleistung","Wasserleitungsbau","Oberflächenwiederherstellung","Oberflächenbau","Erdbau/Schüttgut","Sonderbauverfahren","Grabenloser Leitungsbau","Sicherungsleistung","Dokumentationsleistung","Entsorgungsleistung","Prüfleistung","Logistikleistung","Gasleitungsbau","Fernwärmebau","Glasfaser-Kabelbau","Kabelbau","Leitungskreuzung"]);
let fail=0,zero=0,mismatch=0; const seen=new Set<string>(); let dup=0;
for(let i=0;i<cases.length;i++){
  const c=cases[i], key=c.text.toLowerCase()+"|"+c.unit.toLowerCase(); if(seen.has(key)) dup++; else seen.add(key);
  const row:any={posNr:`WEB.${String(i+1).padStart(4,"0")}`,kurztext:c.text,langtext:c.text,einheit:c.unit,menge:1};
  const x:any=calculateAutonomousUrkalkulation(row,ctx,[row]);
  const ep=Number(x?.unitPrice||0), pb=(x?.costLines||[]).reduce((s:number,l:any)=>s+Number(l.unitPrice||0),0);
  const bad=!x || generic.has(String(x?.leistungsart||""));
  if(bad){fail++; console.log("GAP|"+c.group+"|"+c.text+"|"+(x?.trade||"NULL")+"|"+(x?.leistungsart||"NULL")+"|"+ep);}
  if(!(ep>0)) zero++;
  if(ep>0 && Math.abs(pb*1.23-ep)>0.20 && Math.abs(pb-ep)>0.20) mismatch++;
}
console.log(`INTERNET_GAPS_AUDIT|CASES=${cases.length}|UNIQUE=${seen.size}|DUPLICATES=${dup}|FAIL=${fail}|ZERO=${zero}|MISMATCH=${mismatch}`);
if(dup||fail||zero||mismatch) process.exitCode=1;

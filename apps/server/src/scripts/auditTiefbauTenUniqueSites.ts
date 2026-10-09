import { calculateAutonomousUrkalkulation } from "../kalkulation/autonomous/autonomousUrkalkulationEngine";
import { TIEFBAU_COVERAGE_CASES } from "../kalkulation/autonomous/tiefbauCoverageCases";

type Pos = { group:string; text:string; unit:string; qty:number };
type Site = { id:string; name:string; positions:Pos[] };

const ctx:any={projectType:"Tiefbau",trade:"Tiefbau",difficulty:"medium",logisticsRisk:"medium",trafficRisk:"medium",durationRisk:"medium",marketFactor:1,distanceFactor:1,confidence:0.9,warnings:[]};
const generic=new Set(["Kanalbauleistung","Wasserleitungsbau","Oberflächenwiederherstellung","Oberflächenbau","Erdbau/Schüttgut","Sonderbauverfahren","Grabenloser Leitungsbau","Sicherungsleistung","Dokumentationsleistung","Entsorgungsleistung","Prüfleistung","Logistikleistung","Gasleitungsbau","Fernwärmebau","Glasfaser-Kabelbau","Kabelbau","Leitungskreuzung"]);

function norm(s:string){return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9äöüß]+/g," ").trim();}
function hash(s:string){let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function qtyFor(text:string,unit:string){
  const h=hash(text+"|"+unit), u=unit.toLowerCase();
  if(["m","lfm"].includes(u)) return 40+(h%1761);
  if(["m²","m2"].includes(u)) return 80+(h%3921);
  if(["m³","m3","cbm"].includes(u)) return 40+(h%1961);
  if(["t","to"].includes(u)) return 20+(h%1481);
  if(u==="kg") return 500+(h%19501);
  if(["st","stk","stck","stück","stueck"].includes(u)) return 1+(h%40);
  if(["h","std"].includes(u)) return 8+(h%233);
  if(["tag","d"].includes(u)) return 1+(h%60);
  if(["wo","woche"].includes(u)) return 1+(h%24);
  if(u==="monat") return 1+(h%12);
  if(["psch","pausch"].includes(u)) return 1;
  if(u==="mwo") return 200+(h%4801);
  return 1+(h%100);
}

const extra:{group:string;text:string;unit:string}[]=[];

// Schachtabdeckungen: Klassen, Geometrien, Werkstoffe und Funktionsvarianten.
for(const cls of ["A15","B125","C250","D400","E600","F900"]){
  for(const geom of ["DN625 rund","DN800 rund","600x600 quadratisch","800x800 quadratisch","1000x1000 quadratisch"]){
    for(const spec of ["Guss unbelüftet","Guss belüftet","Guss tagwasserdicht verriegelt","Edelstahl V2A tagwasserdicht","Guss gasdicht verschraubt"]){
      extra.push({group:"SCHACHT-DECKEL",text:`Schachtabdeckung ${geom} Klasse ${cls} ${spec} liefern und setzen`,unit:"St"});
    }
  }
}

// Rohrvarianten Wasser.
for(const da of [63,75,90,110,125,160,180,225,250,315,400,500]){
  for(const sdr of ["SDR17","SDR11","SDR9","SDR7.4"]){
    extra.push({group:"WASSER",text:`Trinkwasserleitung PE100-RC DA ${da} ${sdr} liefern und verlegen`,unit:"m"});
  }
}
// Kanalrohre echte Material-/DN-/SN-Varianten.
for(const mat of ["PP","PVC-U"]){
  for(const dn of [100,125,150,200,250,300,400,500,600,800]){
    for(const sn of mat==="PP"?["SN10","SN16"]:["SN8","SN12"]){
      extra.push({group:"KANAL",text:`Kanalrohr ${mat} DN${dn} ${sn} liefern und verlegen`,unit:"m"});
    }
  }
}
// Rinnen / Tragschichten / Kabelsand mit realer Parametrik.
for(const dn of [100,150,200,300]) for(const cls of ["B125","D400","F900"])
  extra.push({group:"ENTW",text:`Entwässerungsrinne DN${dn} Klasse ${cls} liefern und setzen`,unit:"m"});
for(const grain of ["0/32","0/45"]) for(const cm of [10,15,20,25,30,35,40,50])
  extra.push({group:"STRASSE",text:`Schottertragschicht ${grain} ${cm} cm herstellen`,unit:"m²"});
for(const grain of ["0/2","0/4"]) for(const cm of [5,10,15,20])
  extra.push({group:"BAY-KABEL",text:`Bayernwerk Kabelsand ${grain} ${cm} cm Bettung herstellen`,unit:"m²"});

// Bayernwerk NS/MS: verschiedene Kabeltypen, Querschnitte und Verlegearten.
for(const type of ["NAYY-J","NAY2Y-J","NA2YY-J","NA2XY-J","N2XY-J"]){
  for(const q of [50,95,150,185,240]){
    for(const method of ["direkt im Kabelgraben in Sandbett verlegen","in Kabelschutzrohr DN110 einziehen","unter Gehweg direkt verlegen"]){
      extra.push({group:"BAY-NS",text:`Bayernwerk Niederspannung ${type} 4x${q} mm2 ${method}`,unit:"m"});
    }
  }
}
for(const type of ["NA2XS2Y","NA2XS(F)2Y","NA2XS(FL)2Y"]){
  for(const q of [95,150,240,400]){
    for(const method of ["3x1x Kabel direkt im Sandbett verlegen","3x1x Kabel in Schutzrohre einziehen","3x1x Kabel im Kabelkanal verlegen"]){
      extra.push({group:"BAY-MS",text:`Bayernwerk Mittelspannung 20 kV ${type} 3x1x${q} mm2 ${method}`,unit:"m"});
    }
  }
}
// Entsorgung / Transport.
for(const cls of ["BM-0","BM-F0*","BM-F1","BM-F2","BM-F3","DK0"]){
  for(const km of [5,10,20,30]){
    extra.push({group:"ENTSORG",text:`Boden ${cls} laden, transportieren und entsorgen bis ${km} km`,unit:"t"});
  }
}
// Grabenlose Verfahren.
for(const dn of [200,300,400,600,800,1000]){
  extra.push({group:"SPEZIAL",text:`Rohrvortrieb Stahlbeton DN${dn} herstellen`,unit:"m"});
  extra.push({group:"SPEZIAL",text:`Microtunneling DN${dn} herstellen`,unit:"m"});
  extra.push({group:"SPEZIAL",text:`HDD Spülbohrung PE DA${dn} herstellen`,unit:"m"});
}
// Schächte / Versickerung.
for(const dn of [800,1000,1200,1500,2000]){
  extra.push({group:"SCHACHT",text:`Betonschacht DN${dn} mit Gerinne liefern und setzen`,unit:"St"});
  extra.push({group:"SCHACHT",text:`Kunststoffschacht PP DN${dn} liefern und setzen`,unit:"St"});
  extra.push({group:"RW",text:`Sickerschacht DN${dn} 3,00 m tief liefern und setzen`,unit:"St"});
}

// Schutzrohre / Leerrohre / Rohrverbände / Speedpipes.
for(const mat of ["PE-HD","PP","PVC-U"]){
  for(const dn of [40,50,63,75,90,110,125,160,200,250]){
    for(const cls of mat==="PE-HD"?["SDR17","SDR11"]:["SN4","SN8","SN16"]){
      extra.push({group:"KSR",text:`${mat} Kabelschutzrohr DN${dn} ${cls} liefern und verlegen`,unit:"m"});
    }
  }
}
for(const mat of ["PE-HD","PP","PVC-U","Stahl"]) for(const dn of [63,90,110,160,200,250,315,400])
  extra.push({group:"SCHUTZROHR",text:`${mat} Schutzrohr DN${dn} für Leitungsquerung liefern und verlegen`,unit:"m"});
for(const use of ["Strom","Beleuchtung","LSA","Telekommunikation"]) for(const mat of ["PE-HD","PP","PVC-U"]) for(const dn of [40,50,63,75,90,110,125,160])
  extra.push({group:"LEERROHR",text:`${mat} Leerrohr DN${dn} für ${use} liefern und verlegen`,unit:"m"});
for(const count of [2,3,4,6,8,12]) for(const dn of [50,63,110,125,160])
  extra.push({group:"ROHRVERBAND",text:`Rohrverband ${count}x DN${dn} PE-HD Kabelschutzrohre mit Abstandhaltern herstellen`,unit:"m"});
for(const od of [7,10,12,14,16,20]) for(const wall of [1.5,2.0])
  extra.push({group:"SPEEDPIPE",text:`Telekom Speedpipe ${od}x${wall.toString().replace(".",",")} mm verlegen`,unit:"m"});
for(const count of [4,7,12,24]) for(const od of [7,10,12,14])
  extra.push({group:"MIKROROHR",text:`Telekom Mikrorohrverbund ${count}x${od} mm liefern und verlegen`,unit:"m"});

// Internet-/Muster-LV-Erweiterungen.
for(const mat of ["Beton","Kunststoff"]) for(const w of [150,200,300,400,500,600]) for(const cover of [""," mit Deckel"])
  extra.push({group:"DB-KABELTROG",text:`${mat} Kabelkanaltrog B ${w} mm${cover} verlegen`,unit:"m"});
for(const a of ["Kabelkanal öffnen","Kabelkanal aufdeckeln","Kabelkanal reinigen","Kabelkanal schließen"])
  extra.push({group:"DB-KABELBESTAND",text:a,unit:"m"});
for(const t of ["Niederspannung","Mittelspannung 20 kV","Telekom","LWL"]) for(const what of ["Muffengrube herstellen","Muffenbausatz liefern und einbauen"])
  extra.push({group:"MUFFE",text:`${t} ${what}`,unit:"St"});
for(const dn of [63,90,110,125,160,200,250])
  extra.push({group:"GETEILT-KSR",text:`Zweigeteiltes flexibles Kabelschutzrohr DN${dn} um Bestandskabel montieren`,unit:"m"});
for(const loc of ["Außenbereich","Innenbereich"])
  extra.push({group:"LWL-SCHRANK",text:`LWL-Muffenschrank ${loc} mit Sockel aufstellen`,unit:"St"});
for(const dn of [50,63,90,110,125,160,200]) {
  extra.push({group:"ZUGDRAHT",text:`Kabelziehdraht in Leerrohr DN${dn} einziehen`,unit:"m"});
  extra.push({group:"ROHR-PRUEF",text:`Schutzrohr reinigen DN${dn}`,unit:"m"});
  extra.push({group:"ROHR-PRUEF",text:`Rohr kalibrieren DN${dn}`,unit:"m"});
}
for(const dn of [300,400,500,600]) for(const len of [4,6,8,10])
  extra.push({group:"RW-BEHANDLUNG",text:`Regenwasserbehandlungsanlage Sedimentationsanlage DN${dn} L = ${len},00 m herstellen`,unit:"St"});
for(const dn of [1000,1200,1500]) for(const cls of ["B125","D400"])
  extra.push({group:"RW-FILTER",text:`Regenwasser-Filterschacht DN${dn} Klasse ${cls} liefern und setzen`,unit:"St"});
for(const dn of [100,125,150,200,250,300])
  extra.push({group:"RUECKSTAU",text:`Rückstauklappe DN${dn} liefern und einbauen`,unit:"St"});
for(const ns of [3,6,10,15,20,30])
  extra.push({group:"ABSCHEIDER",text:`Leichtflüssigkeitsabscheider NS ${ns} mit Koaleszenzeinsatz liefern und setzen`,unit:"St"});
for(const dn of [800,1000,1200,1500,2000])
  extra.push({group:"DRUCKENTSP",text:`Druckentspannungsschacht DN${dn} herstellen`,unit:"St"});
for(const med of ["Trinkwasser","Abwasser"]) for(const dn of [50,80,100,150])
  extra.push({group:"BEG",text:`${med} Be- und Entlüftungsgarnitur DN${dn} liefern und einbauen`,unit:"St"});
for(const use of ["Hydrant","Schieber","Armatur","Universal"]) for(const typ of ["Straßenkappe","Straßenkappe einwalzbar VE"])
  extra.push({group:"KAPPE",text:`${typ} für ${use} liefern und setzen`,unit:"St"});
for(const cm of [5,10,15,20,25,30])
  extra.push({group:"RING",text:`Distanzring Schachtabdeckung ${cm} cm liefern und setzen`,unit:"St"});
for(const cm of [10,15,20,25,30])
  extra.push({group:"SCHACHT-ANPASS",text:`Schachtabdeckung anpassen Höhe ${cm}-${cm+5} cm in Pflasterfläche`,unit:"St"});
for(const d of [0.6,0.8,1.0,1.2,1.5])
  extra.push({group:"WURZEL",text:`Wurzelvorhang ${d.toString().replace(".",",")} m tief herstellen`,unit:"m"});
for(const dia of [3,5,8,12,20])
  extra.push({group:"WURZEL",text:`Wurzelrückschnitt an Wurzeln bis ${dia} cm Durchmesser fachgerecht durchführen`,unit:"St"});
for(const v of [6,9,12,15,18,24])
  extra.push({group:"BAUMGRUBE",text:`Baumpflanzgrube ${v} m3 herstellen`,unit:"St"});
for(const typ of ["Baumsubstrat","Baumsubstrat strukturstabil überbaubar Bauweise 2"]) for(const q of ["Liefern und einbauen","Nachverdichten und profilieren"])
  extra.push({group:"BAUMSUBSTRAT",text:`${typ} ${q}`,unit:"m³"});
for(const phase of ["Fertigstellungspflege","Entwicklungspflege"]) for(const obj of ["Bäume","Sträucher","Rasen","Staudenflächen"])
  extra.push({group:"PFLEGE",text:`${phase} ${obj} durchführen`,unit:"m²"});
for(const cls of ["C250","D400","F900"]) for(const typ of ["Guss","Edelstahl"])
  extra.push({group:"BRUECKE",text:`Brückenablauf ${typ} Klasse ${cls} liefern und einbauen`,unit:"St"});

const all:{group:string;text:string;unit:string}[]=[...TIEFBAU_COVERAGE_CASES,...extra];
const uniqueMap=new Map<string,{group:string;text:string;unit:string}>();
for(const p of all){const k=norm(p.text)+"|"+norm(p.unit); if(!uniqueMap.has(k)) uniqueMap.set(k,p);}
const unique=[...uniqueMap.values()];

const siteNames=[
 "Baugrube / Spezialtiefbau / Verbau",
 "Straßenbau / Verkehrsflächen / Entwässerung",
 "Kanalbau / Schächte / Pumpwerke",
 "Wasserleitungsbau / Druckleitungen",
 "Bayernwerk / Mittelspannung / Niederspannung",
 "Telekom / Vodafone / Glasfaser / Kabelschutz",
 "Gas / Fernwärme / Leitungsnetze",
 "Außenanlagen / Landschaftsbau / Versickerung",
 "Rückbau / Entsorgung / Bestand / Provisorien",
 "Großprojekt Mischinfrastruktur Tiefbau"
];
const sites:Site[]=siteNames.map((name,i)=>({id:"UNIQ-"+String(i+1).padStart(2,"0"),name,positions:[]}));

// Sort by group, then distribute cyclically: every site receives broad Tiefbau coverage,
// while every position globally remains unique.
unique.sort((a,b)=>(a.group+"|"+a.text).localeCompare(b.group+"|"+b.text,"de"));
for(let i=0;i<unique.length;i++){
  const p=unique[i], idx=i%sites.length;
  sites[idx].positions.push({...p,qty:qtyFor(p.text,p.unit)});
}

let globalTotal=0, totalFailures=0, totalZero=0, totalMismatch=0;
const globalKeys=new Set<string>(); let duplicates=0;
for(const site of sites){
  let total=0, zero=0, mismatch=0; const failures:string[]=[];
  for(let i=0;i<site.positions.length;i++){
    const p=site.positions[i], key=norm(p.text)+"|"+norm(p.unit);
    if(globalKeys.has(key)) duplicates++; else globalKeys.add(key);
    const row:any={posNr:site.id+"."+String(i+1).padStart(4,"0"),kurztext:p.text,langtext:p.text,einheit:p.unit,menge:p.qty};
    const r:any=calculateAutonomousUrkalkulation(row,ctx,[row]);
    const ep=Number(r?.unitPrice||0), pb=(r?.costLines||[]).reduce((s:number,l:any)=>s+Number(l.unitPrice||0),0);
    if(!r || generic.has(r.leistungsart||"")) failures.push(row.posNr+"|"+p.text+"|"+(r?.leistungsart||"NULL"));
    if(!(ep>0)) zero++;
    if(ep>0 && Math.abs(pb*1.23-ep)>0.20 && Math.abs(pb-ep)>0.20) mismatch++;
    total+=ep*p.qty;
  }
  globalTotal+=total; totalFailures+=failures.length; totalZero+=zero; totalMismatch+=mismatch;
  console.log(["UNIQUE_SITE",site.id,site.name,"POSITIONS="+site.positions.length,"TOTAL="+total.toFixed(2),"FAIL="+failures.length,"ZERO="+zero,"MISMATCH="+mismatch].join("|"));
  for(const f of failures.slice(0,80)) console.error("UNIQUE_GAP|"+site.id+"|"+f);
}
const minPositions=Math.min(...sites.map(s=>s.positions.length));
console.log(["UNIQUE_SUITE","SITES="+sites.length,"POSITIONS="+unique.length,"UNIQUE="+globalKeys.size,"DUPLICATES="+duplicates,"MIN_SITE_POS="+minPositions,"FAIL="+totalFailures,"ZERO="+totalZero,"MISMATCH="+totalMismatch,"TOTAL="+globalTotal.toFixed(2),"EXTRA_VARIANTS="+extra.length].join("|"));
if(duplicates || minPositions<200 || totalFailures || totalZero || totalMismatch || unique.length<2000) process.exitCode=1;

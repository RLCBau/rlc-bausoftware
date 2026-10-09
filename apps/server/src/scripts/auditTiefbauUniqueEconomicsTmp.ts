import { calculateAutonomousUrkalkulation } from "../kalkulation/autonomous/autonomousUrkalkulationEngine";
import { TIEFBAU_COVERAGE_CASES } from "../kalkulation/autonomous/tiefbauCoverageCases";

type P={group:string;text:string;unit:string};
const ctx:any={projectType:"Tiefbau",trade:"Tiefbau",difficulty:"medium",logisticsRisk:"medium",trafficRisk:"medium",durationRisk:"medium",marketFactor:1,distanceFactor:1,confidence:0.9,warnings:[]};
function norm(s:string){return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9äöüß]+/g," ").trim();}
const extra:P[]=[];
for(const cls of ["A15","B125","C250","D400","E600","F900"])for(const geom of ["DN625 rund","DN800 rund","600x600 quadratisch","800x800 quadratisch","1000x1000 quadratisch"])for(const spec of ["Guss unbelüftet","Guss belüftet","Guss tagwasserdicht verriegelt","Edelstahl V2A tagwasserdicht","Guss gasdicht verschraubt"])extra.push({group:"SCHACHT-DECKEL",text:`Schachtabdeckung ${geom} Klasse ${cls} ${spec} liefern und setzen`,unit:"St"});
for(const da of [63,75,90,110,125,160,180,225,250,315,400,500])for(const sdr of ["SDR17","SDR11","SDR9","SDR7.4"])extra.push({group:"WASSER",text:`Trinkwasserleitung PE100-RC DA ${da} ${sdr} liefern und verlegen`,unit:"m"});
for(const mat of ["PP","PVC-U"])for(const dn of [100,125,150,200,250,300,400,500,600,800])for(const sn of mat==="PP"?["SN10","SN16"]:["SN8","SN12"])extra.push({group:"KANAL",text:`Kanalrohr ${mat} DN${dn} ${sn} liefern und verlegen`,unit:"m"});
for(const dn of [100,150,200,300])for(const cls of ["B125","D400","F900"])extra.push({group:"ENTW",text:`Entwässerungsrinne DN${dn} Klasse ${cls} liefern und setzen`,unit:"m"});
for(const grain of ["0/32","0/45"])for(const cm of [10,15,20,25,30,35,40,50])extra.push({group:"STRASSE",text:`Schottertragschicht ${grain} ${cm} cm herstellen`,unit:"m²"});
for(const grain of ["0/2","0/4"])for(const cm of [5,10,15,20])extra.push({group:"BAY-KABEL",text:`Bayernwerk Kabelsand ${grain} ${cm} cm Bettung herstellen`,unit:"m²"});
for(const type of ["NAYY-J","NAY2Y-J","NA2YY-J","NA2XY-J","N2XY-J"])for(const q of [50,95,150,185,240])for(const method of ["direkt im Kabelgraben in Sandbett verlegen","in Kabelschutzrohr DN110 einziehen","unter Gehweg direkt verlegen"])extra.push({group:"BAY-NS",text:`Bayernwerk Niederspannung ${type} 4x${q} mm2 ${method}`,unit:"m"});
for(const type of ["NA2XS2Y","NA2XS(F)2Y","NA2XS(FL)2Y"])for(const q of [95,150,240,400])for(const method of ["3x1x Kabel direkt im Sandbett verlegen","3x1x Kabel in Schutzrohre einziehen","3x1x Kabel im Kabelkanal verlegen"])extra.push({group:"BAY-MS",text:`Bayernwerk Mittelspannung 20 kV ${type} 3x1x${q} mm2 ${method}`,unit:"m"});
for(const cls of ["BM-0","BM-F0*","BM-F1","BM-F2","BM-F3","DK0"])for(const km of [5,10,20,30])extra.push({group:"ENTSORG",text:`Boden ${cls} laden, transportieren und entsorgen bis ${km} km`,unit:"t"});
for(const dn of [200,300,400,600,800,1000]){extra.push({group:"SPEZIAL",text:`Rohrvortrieb Stahlbeton DN${dn} herstellen`,unit:"m"});extra.push({group:"SPEZIAL",text:`Microtunneling DN${dn} herstellen`,unit:"m"});extra.push({group:"SPEZIAL",text:`HDD Spülbohrung PE DA${dn} herstellen`,unit:"m"});}
for(const dn of [800,1000,1200,1500,2000]){extra.push({group:"SCHACHT",text:`Betonschacht DN${dn} mit Gerinne liefern und setzen`,unit:"St"});extra.push({group:"SCHACHT",text:`Kunststoffschacht PP DN${dn} liefern und setzen`,unit:"St"});extra.push({group:"RW",text:`Sickerschacht DN${dn} 3,00 m tief liefern und setzen`,unit:"St"});}

const mm=new Map<string,P>(); for(const p of [...TIEFBAU_COVERAGE_CASES,...extra]){const k=norm(p.text)+"|"+norm(p.unit);if(!mm.has(k))mm.set(k,p);}
const rows:any[]=[];
for(const p of mm.values()){
 const row:any={posNr:"A",kurztext:p.text,langtext:p.text,einheit:p.unit,menge:1};
 const x:any=calculateAutonomousUrkalkulation(row,ctx,[row]);
 rows.push({group:p.group,text:p.text,unit:p.unit,ep:Number(x?.unitPrice||0),trade:String(x?.trade||""),art:String(x?.leistungsart||""),lines:x?.costLines||[]});
}
const suspects:any[]=[];
function add(kind:string,r:any,reason:string){suspects.push({kind,ep:r.ep,unit:r.unit,trade:r.trade,art:r.art,text:r.text,reason});}
for(const r of rows){
 const t=norm(r.text), ta=norm(r.trade+" "+r.art);
 if(/zulage/.test(t) && /herstellen|liefern und verlegen|komplett/.test(ta)) add("ZULAGE_FULL",r,"Zulage classified as full work");
 if(/vorhaltung|vorhalten/.test(t) && /herstellen|liefern und setzen|liefern und verlegen/.test(ta)) add("VORHALT_FULL",r,"Vorhaltung classified as new installation");
 if(/rückbau|rueckbau|ausbauen|abbruch/.test(t) && /herstellen|neu bauen|liefern und setzen|liefern und verlegen/.test(ta)) add("RUECKBAU_NEW",r,"Rückbau classified as new installation");
 if(/druckprüfung|druckpruefung|druckprobe|dichtheitsprüfung|dichtheitspruefung/.test(t) && ["m","lfm"].includes(r.unit.toLowerCase()) && r.ep>50) add("PRUEFUNG_HIGH",r,"Per-m test service above 50 EUR/m");
 if(/markierung|warnband|trassenwarnband/.test(t) && ["m","lfm"].includes(r.unit.toLowerCase()) && r.ep>20) add("MARKIERUNG_HIGH",r,"Linear marking/warning band above 20 EUR/m");
 if(/vorhaltung/.test(t) && !["psch","pausch","st","stk","stck"].includes(r.unit.toLowerCase()) && r.ep>100) add("VORHALT_HIGH",r,"Non-lump-sum holding cost above 100");
 if(/entsorgen|verwerten/.test(t) && ["t","to"].includes(r.unit.toLowerCase()) && r.ep>400) add("ENTSORG_HIGH",r,"Disposal above 400 EUR/t");
}

// Same family+unit+EP despite differing dimensional numbers.
const groups=new Map<string,any[]>();
for(const r of rows){const k=[r.trade,r.art,r.unit,r.ep.toFixed(2)].join("|"); const a=groups.get(k)||[];a.push(r);groups.set(k,a);}
for(const a of groups.values()) if(a.length>1){
 const texts=[...new Set(a.map(x=>x.text))]; if(texts.length<2) continue;
 const numsets=new Set(texts.map(t=>(t.match(/\d+(?:[.,]\d+)?/g)||[]).join(",")));
 if(numsets.size>1 && a.length<=12){
   for(const r of a.slice(0,4)) add("SAME_EP_DIM",r,`same EP across ${texts.length} differing variants`);
 }
}

suspects.sort((a,b)=>b.ep-a.ep);
console.log("ECON_AUDIT|POSITIONS="+rows.length+"|SUSPECTS="+suspects.length);
for(const s of suspects.slice(0,300)) console.log(["SUSPECT",s.kind,s.ep.toFixed(2),s.unit,s.trade,s.art,s.reason,s.text].join("|"));

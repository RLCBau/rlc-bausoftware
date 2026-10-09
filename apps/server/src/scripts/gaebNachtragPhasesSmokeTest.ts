import { writeFileSync } from "fs";
import { buildGaebX85X87Xml } from "../gaeb/gaebXml33";
const rows=[{posNr:"007",kurztext:"Baustellendokumentation",langtext:"Dokumentation im Naturschutzgebiet.",einheit:"Psch",menge:1,preis:1600,gesamt:1600},{posNr:"012",kurztext:"Grenzsteine",langtext:"Grenzsteine aufnehmen und sichern.",einheit:"St",menge:50,preis:36.29,gesamt:1814.5}];
const base={rows,project:{code:"BA-2026-028",name:"Testprojekt"},company:{name:"LoCurto",address:"Hochlalterstraß 5, 64837 Bi"},owner:{name:"Auftraggeber GmbH",street:"Musterstraße 1",pcode:"12345",city:"Musterstadt"},createdAt:new Date("2026-10-05T12:00:00Z")};
for(const format of ["X85","X86","X87"] as const){const xml=buildGaebX85X87Xml({...base,format});writeFileSync(`/tmp/rlc-gaeb-${format.toLowerCase()}-smoke.${format.toLowerCase()}`,xml,"utf8");}
console.log("OK");

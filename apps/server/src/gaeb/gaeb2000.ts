import type { GaebExportRow, GaebProject, GaebCompany } from "./gaebXml33";

function s(v: unknown): string { return String(v ?? "").trim(); }
function n(v: unknown): number { const x = Number(v); return Number.isFinite(x) ? x : 0; }

function winText(v: unknown): string {
  return s(v).replace(/\[/g, "(").replace(/\]/g, ")").replace(/\r?\n+/g, " ");
}
function qty(v: unknown): string {
  return n(v).toFixed(3).replace(".", ",").padStart(15, "0");
}
function price(v: unknown): string {
  return n(v).toFixed(2).replace(".", ",");
}
function pos(v: unknown, index: number): string {
  const source=s(v);
  const raw=source.replace(/[^0-9]/g,"");
  if (source && /[A-Za-z]/.test(source)) {
    throw new Error(`GAEB2000_OZ_UNGUELTIG: Alphanumerische OZ "${source}" ist in GAEB 2000 nicht zulässig. Bitte GAEB DA XML verwenden.`);
  }
  const value=raw || String(index+1).padStart(4,"0");
  if (value.length > 14) {
    throw new Error(`GAEB2000_OZ_ZU_LANG: OZ "${source || value}" überschreitet 14 Stellen.`);
  }
  return value;
}
function field(name:string,value:unknown,indent="  "): string {
  return `${indent}[${name}]${winText(value)}[end]\n`;
}

type OzStructure = { levelWidths:number[]; positionWidth:number; hasIndex:boolean; segmented:boolean };
function analyzeOzStructure(rows:GaebExportRow[]): OzStructure {
  const parsed = rows.map((row,index) => {
    const source=s(row.posNr||row.pos||row.position||String(index+1));
    const parts=source.split('.').map(x=>x.trim()).filter(Boolean);
    if(!parts.length) throw new Error('GAEB2000_OZ_UNGUELTIG: Leere OZ.');
    return {source,parts};
  });
  const same=parsed.every(x=>x.parts.length===parsed[0].parts.length);
  if(!same) throw new Error('GAEB2000_OZ_STRUKTUR_UNEINHEITLICH: Alle Positionen müssen dieselbe OZ-Struktur verwenden.');
  const count=parsed[0].parts.length;
  const hasIndex=count>=2 && parsed.some(x=>!/^\d+$/.test(x.parts[count-1]));
  const posIdx=hasIndex ? count-2 : count-1;
  const levelCount=posIdx;
  if(levelCount>5) throw new Error(`GAEB2000_ZU_VIELE_LV_STUFEN: ${levelCount}; maximal 5.`);
  const levelWidths:number[]=[];
  for(let i=0;i<levelCount;i++){
    if(!parsed.every(x=>/^\d+$/.test(x.parts[i]))) throw new Error('GAEB2000_OZ_UNGUELTIG: LV-Stufen müssen numerisch sein.');
    levelWidths.push(Math.max(...parsed.map(x=>x.parts[i].length)));
  }
  if(!parsed.every(x=>/^\d+$/.test(x.parts[posIdx]))) throw new Error('GAEB2000_OZ_UNGUELTIG: Positionszähler muss numerisch sein.');
  const positionWidth=Math.max(...parsed.map(x=>x.parts[posIdx].length));
  if(hasIndex && !parsed.every(x=>x.parts[count-1].length===1 && /^[0-9A-Za-z]$/.test(x.parts[count-1]))) {
    throw new Error('GAEB2000_OZ_UNGUELTIG: Index muss genau einstellig sein.');
  }
  const total=levelWidths.reduce((a,b)=>a+b,0)+positionWidth+(hasIndex?1:0);
  if(total>14) throw new Error(`GAEB2000_OZ_ZU_LANG: OZ-Struktur benötigt ${total} Stellen; maximal 14.`);
  return {levelWidths,positionWidth,hasIndex,segmented:count>=2};
}

function ozPartsForRow(row:GaebExportRow,index:number, structure:OzStructure): string[] {
  const source=s(row.posNr||row.pos||row.position||String(index+1));
  const parts=source.split('.').map(x=>x.trim()).filter(Boolean);
  const expected=structure.levelWidths.length+1+(structure.hasIndex?1:0);
  if(parts.length!==expected) throw new Error(`GAEB2000_OZ_UNGUELTIG: OZ "${source}" passt nicht zur LVGliederung.`);
  structure.levelWidths.forEach((width,i)=>{
    if(!/^\d+$/.test(parts[i])||parts[i].length>width) throw new Error(`GAEB2000_OZ_UNGUELTIG: LV-Stufe in "${source}".`);
    parts[i]=parts[i].padStart(width,'0');
  });
  const posIdx=structure.levelWidths.length;
  if(!/^\d+$/.test(parts[posIdx])||parts[posIdx].length>structure.positionWidth) throw new Error(`GAEB2000_OZ_UNGUELTIG: Position in "${source}".`);
  parts[posIdx]=parts[posIdx].padStart(structure.positionWidth,'0');
  return parts;
}

export type Gaeb2000Owner = { name?: string|null; street?: string|null; pcode?: string|null; city?: string|null };
function splitAddress(raw: unknown): {street:string;pcode:string;city:string} {
  const value=s(raw).replace(/\s+/g," ");
  const m=value.match(/^(.+?)(?:,\s*|\s+)(\d{5})\s+(.+)$/);
  return m ? {street:s(m[1]),pcode:s(m[2]),city:s(m[3])} : {street:value,pcode:"",city:""};
}
export function buildGaeb2000(args:{
  format:"P81"|"P82"|"P83"|"P84"|"P85"|"P86"|"P94";
  rows:GaebExportRow[];
  project:GaebProject;
  company:GaebCompany;
  owner?:Gaeb2000Owner|null;
  createdAt?:Date;
}): string {
  const {format,rows,project,company}=args;
  if(!rows.length) throw new Error("Keine Exportpositionen vorhanden.");
  if(format === "P94") {
    throw new Error("GAEB2000_P94_EXPORT_NOT_IMPLEMENTED: P94 ist ein Handel-Preisangebot und kein LV-Export. Der Import bleibt unterstützt; für Export ist eine separate Warenwirtschaftsstruktur erforderlich.");
  }
  const d=args.createdAt || new Date();
  const date=d.toLocaleDateString("de-DE");
  const time=d.toTimeString().slice(0,5);
  const dp=format.slice(1);
  const projectCode=s(project.code||project.number||"RLC");
  const projectName=s(project.name||project.title||projectCode||"RLC Projekt");
  const includePrice=["P82","P84","P85","P86","P94"].includes(format);
  const owner=args.owner || {};
  const contractorAddress=splitAddress(company.address);
  const ownerComplete=Boolean(s(owner.name)&&s(owner.street)&&s(owner.pcode)&&s(owner.city));
  if (!ownerComplete) throw new Error("GAEB2000_AUFTRAGGEBER_UNVOLLSTAENDIG: Name, Straße, PLZ und Ort des Auftraggebers erforderlich.");
  const contractorComplete = Boolean(
    s(company.name) &&
    contractorAddress.street &&
    /^\d{5}$/.test(contractorAddress.pcode) &&
    contractorAddress.city.length >= 3
  );
  if (!contractorComplete) {
    throw new Error("GAEB2000_AUFTRAGNEHMER_UNVOLLSTAENDIG: Firmenname sowie vollständige Straße, 5-stellige PLZ und Ort in den Firmenstammdaten erforderlich.");
  }

  const ozStructure=analyzeOzStructure(rows);

  let out="";
  out+="#begin[GAEB]\n";
  out+="#begin[GAEBInfo]1\n";
  out+=field("Version","1.2");
  out+=field("VersMon","11");
  out+=field("VersJahr","2001");
  out+=field("Datum",date);
  out+=field("Uhrzeit",time);
  out+=field("ProgSystem","RLC Bausoftware");
  out+=field("ProgName","RLC-GAEB2000Export");
  out+=field("Zeichensatz","ANSI");
  out+="#end[GAEBInfo]1\n";
  out+="#begin[PrjInfo]2\n";
  out+=field("Name",projectCode);
  out+=field("Bez",projectName);
  out+=field("Beschreib",projectName);
  out+=field("Wae","EUR");
  out+=field("WaeBez","Euro");
  out+="#end[PrjInfo]2\n";
  out+="#begin[Vergabe]3\n";
  out+=field("DP",dp);
  out+="  #begin[VergabeInfo]4\n";
  out+=field("Wae","EUR","   ");
  out+=field("WaeBez","Euro","   ");
  out+="  #end[VergabeInfo]4\n";
  out+="  #begin[AG]5\n";
  out+="   #begin[Adresse]6\n";
  out+=field("Name1",owner.name,"    ");
  out+=field("Strasse",owner.street,"    ");
  out+=field("PLZ",owner.pcode,"    ");
  out+=field("Ort",owner.city,"    ");
  out+="   #end[Adresse]6\n";
  out+="  #end[AG]5\n";
  out+="  #begin[AN]7\n";
  out+="   #begin[Adresse]8\n";
  out+=field("Name1",company.name||"","    ");
  out+=field("Strasse",contractorAddress.street,"    ");
  out+=field("PLZ",contractorAddress.pcode,"    ");
  out+=field("Ort",contractorAddress.city,"    ");
  out+=field("Email",company.email||"","    ");
  out+=field("Telefon",company.phone||"","    ");
  out+="   #end[Adresse]8\n";
  out+="  #end[AN]7\n";
  out+="  #begin[LV]9\n";
  out+="   #begin[LVInfo]10\n";
  out+=field("Name",projectCode,"    ");
  out+=field("Bez",projectName,"    ");
  out+=field("Datum",date,"    ");
  out+=field("KurzLang","1","    ");
  let gliedBlock=11;
  for(const width of ozStructure.levelWidths){
    out+=`    #begin[LVGlied]${gliedBlock}\n`;
    out+=field("Typ","LVStufe","     ");
    out+=field("Bez","","     ");
    out+=field("Laenge",String(width),"     ");
    out+=`    #end[LVGlied]${gliedBlock}\n`;
    gliedBlock++;
  }
  out+=`    #begin[LVGlied]${gliedBlock}\n`;
  out+=field("Typ","Position","     ");
  out+=field("Laenge",String(ozStructure.positionWidth),"     ");
  out+=`    #end[LVGlied]${gliedBlock}\n`;
  gliedBlock++;
  if(ozStructure.hasIndex){
    out+=`    #begin[LVGlied]${gliedBlock}\n`;
    out+=field("Typ","Index","     ");
    out+=field("Laenge","1","     ");
    out+=`    #end[LVGlied]${gliedBlock}\n`;
  }
  out+="   #end[LVInfo]10\n";

  let block=Math.max(20,gliedBlock+1);
  let openPrefixes:string[]=[];
  rows.forEach((row,index)=>{
    const ozParts=ozPartsForRow(row,index,ozStructure);
    const p=ozParts.join("");
    const prefixCount=ozStructure.levelWidths.length;
    const prefixes=prefixCount ? ozParts.slice(0,prefixCount).map((_,i)=>ozParts.slice(0,i+1).join("")) : [];
    let common=0;
    while(common<openPrefixes.length && common<prefixes.length && openPrefixes[common]===prefixes[common]) common++;
    for(let level=openPrefixes.length-1; level>=common; level--) out+="    ".repeat(level+1)+"#end[LVBereich]\n";
    openPrefixes=openPrefixes.slice(0,common);
    for(let level=common; level<prefixes.length; level++){
      const prefix=prefixes[level];
      out+="    ".repeat(level+1)+`#begin[LVBereich]${block++}\n`;
      out+=field("OZ",prefix,"    ".repeat(level+1)+" ");
      out+=field("Bez","","    ".repeat(level+1)+" ");
      openPrefixes.push(prefix);
    }
    const q=n(row.menge ?? row.mengeDelta ?? row.quantity);
    const ep=n(row.preis ?? row.ep ?? row.finalUnitPrice);
    const unit=s(row.einheit||row.unit||row.me||"St").slice(0,4);
    const short=winText(row.kurztext||row.text||row.title||"Position");
    const long=winText(row.langtext||row.bemerkung||short);
    out+=`    #begin[Position]${block}\n`;
    out+=field("OZ",p,"     ");
    if(format === "P84") {
      out+=field("EP",price(ep),"     ");
      out+=field("GB",price(q*ep),"     ");
    } else {
      out+=field("Menge",qty(q),"     ");
      out+=field("ME",unit,"     ");
      if(includePrice){
        out+=field("EP",price(ep),"     ");
        out+=field("GB",price(q*ep),"     ");
      }
      out+=`     #begin[Beschreibung]${block+1}\n`;
      out+=field("StlNr","","      ");
      out+=field("Kurztext",short,"      ");
      out+=field("Langtext",long,"      ");
      out+=`     #end[Beschreibung]${block+1}\n`;
    }
    out+=`    #end[Position]${block}\n`;
    block+=2;
  });
  for(let level=openPrefixes.length-1; level>=0; level--) out+="    ".repeat(level+1)+"#end[LVBereich]\n";
  out+="  #end[LV]9\n";
  out+="#end[Vergabe]3\n";
  out+="#end[GAEB]\n";
  return out;
}

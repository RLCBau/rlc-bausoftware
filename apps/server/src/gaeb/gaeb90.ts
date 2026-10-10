import type { GaebExportRow, GaebProject, GaebCompany } from "./gaebXml33";

function s(v: unknown): string { return String(v ?? "").trim(); }
function n(v: unknown): number { const x=Number(v); return Number.isFinite(x)?x:0; }

export type Gaeb90Owner = { name?: string|null; street?: string|null; pcode?: string|null; city?: string|null };

function clean(v: unknown): string {
  return s(v).replace(/\r?\n+/g," ").replace(/\s+/g," ").trim();
}
function splitText(text:string,width:number): string[] {
  const src=clean(text);
  if(!src) return [];
  const out:string[]=[];
  let rest=src;
  while(rest.length>width){
    let cut=rest.lastIndexOf(" ",width);
    if(cut<Math.floor(width*0.6)) cut=width;
    out.push(rest.slice(0,cut).trimEnd());
    rest=rest.slice(cut).trimStart();
  }
  if(rest) out.push(rest);
  return out;
}
function rec(type:string, body:string, seq:number): string {
  const b=body.slice(0,72).padEnd(72," ");
  return type.slice(0,2).padEnd(2," ") + b + String(seq).padStart(6,"0");
}
function dateDDMMYY(d:Date): string {
  const dd=String(d.getDate()).padStart(2,"0"), mm=String(d.getMonth()+1).padStart(2,"0"), yy=String(d.getFullYear()).slice(-2);
  return `${dd}.${mm}.${yy}`;
}
function qty11(v:unknown): string {
  return Math.round(Math.max(0,n(v))*1000).toString().padStart(11,"0").slice(-11);
}
function price11(v:unknown): string {
  return Math.round(Math.max(0,n(v))*100).toString().padStart(11,"0").slice(-11);
}
function ep11Gaeb90(v:unknown): string {
  return Math.round(Math.max(0,n(v))*1000).toString().padStart(11,"0").slice(-11);
}
function total12Gaeb90(v:unknown): string {
  return Math.round(Math.max(0,n(v))*100).toString().padStart(12,"0").slice(-12);
}
type Gaeb90OzStructure = {
  levelWidths: number[];
  positionWidth: number;
  hasIndex: boolean;
  mask: string;
};

function analyzeOzStructure(rows: GaebExportRow[]): Gaeb90OzStructure {
  const allParts = rows.map((row, index) => {
    const original = s(row.posNr || row.pos || row.position || String(index + 1));
    const parts = original.split('.').map(x => x.trim()).filter(Boolean);
    if (!parts.length) throw new Error(`GAEB90_OZ_UNGUELTIG: Leere OZ.`);
    return { original, parts };
  });

  const sameSegments = allParts.every(x => x.parts.length === allParts[0].parts.length);
  if (!sameSegments) {
    throw new Error('GAEB90_OZ_STRUKTUR_UNEINHEITLICH: Alle Positionen müssen dieselbe OZ-Struktur verwenden.');
  }

  const segmentCount = allParts[0].parts.length;
  const lastIsIndex = segmentCount >= 2 && allParts.some(x => !/^\d+$/.test(x.parts[segmentCount - 1]));
  const positionSegment = lastIsIndex ? segmentCount - 2 : segmentCount - 1;
  const levelCount = positionSegment;
  if (levelCount > 4) throw new Error(`GAEB90_ZU_VIELE_LV_STUFEN: ${levelCount}; maximal 4.`);

  const levelWidths: number[] = [];
  for (let i = 0; i < levelCount; i++) {
    if (!allParts.every(x => /^\d+$/.test(x.parts[i]))) {
      throw new Error(`GAEB90_OZ_UNGUELTIG: Nur der Index darf alphanumerisch sein.`);
    }
    const width = Math.max(...allParts.map(x => x.parts[i].length));
    if (width < 1 || width > 4) throw new Error(`GAEB90_OZ_UNGUELTIG: LV-Stufe ${i + 1} hat ${width} Stellen; maximal 4.`);
    levelWidths.push(width);
  }

  if (!allParts.every(x => /^\d+$/.test(x.parts[positionSegment]))) {
    throw new Error(`GAEB90_OZ_UNGUELTIG: Positionsnummer P muss numerisch sein.`);
  }
  const positionWidth = Math.max(...allParts.map(x => x.parts[positionSegment].length));
  if (positionWidth < 1) throw new Error(`GAEB90_OZ_UNGUELTIG: Positionsnummer fehlt.`);

  if (lastIsIndex) {
    if (!allParts.every(x => x.parts[segmentCount - 1].length === 1 && /^[0-9A-Za-z]$/.test(x.parts[segmentCount - 1]))) {
      throw new Error(`GAEB90_OZ_UNGUELTIG: Index I muss genau einstellig alphanumerisch sein.`);
    }
  }

  const levelMask = levelWidths.map((width, i) => String(i + 1).repeat(width)).join('');
  const rawMask = levelMask + 'P'.repeat(positionWidth) + (lastIsIndex ? 'I' : '');
  if (rawMask.length > 9) {
    throw new Error(`GAEB90_OZ_ZU_LANG: OZ benötigt ${rawMask.length} Stellen; maximal 9.`);
  }
  const mask = rawMask.padEnd(9, '0');
  return { levelWidths, positionWidth, hasIndex: lastIsIndex, mask };
}

function parseOz(v:unknown,index:number, structure:Gaeb90OzStructure): {encoded:string; original:string; hierarchy:string[]} {
  const original=s(v || String(index + 1));
  const parts=original.split('.').map(x=>x.trim()).filter(Boolean);
  const expected = structure.levelWidths.length + 1 + (structure.hasIndex ? 1 : 0);
  if (parts.length !== expected) {
    throw new Error(`GAEB90_OZ_UNGUELTIG: OZ "${original}" passt nicht zur ermittelten Struktur ${structure.mask}.`);
  }

  const encodedParts:string[]=[];
  const hierarchy:string[]=[];
  let cumulative='';
  structure.levelWidths.forEach((width,i)=>{
    const value=parts[i];
    if(!/^\d+$/.test(value) || value.length>width) throw new Error(`GAEB90_OZ_UNGUELTIG: LV-Stufe in "${original}".`);
    const encoded=value.padStart(width,'0');
    encodedParts.push(encoded);
    cumulative+=encoded;
    hierarchy.push(cumulative);
  });
  const posPart=parts[structure.levelWidths.length];
  if(!/^\d+$/.test(posPart) || posPart.length>structure.positionWidth) throw new Error(`GAEB90_OZ_UNGUELTIG: Position in "${original}".`);
  encodedParts.push(posPart.padStart(structure.positionWidth,'0'));
  if(structure.hasIndex) encodedParts.push(parts[parts.length-1]);
  const encoded=encodedParts.join('').padEnd(9,' ');
  return {encoded,original,hierarchy};
}

export function buildGaeb90(args:{
  format:"D81"|"D82"|"D83"|"D84"|"D85"|"D86";
  rows:GaebExportRow[];
  project:GaebProject;
  company:GaebCompany;
  owner?:Gaeb90Owner|null;
  createdAt?:Date;
}): string {
  const {format,rows,project,company}=args;
  if(!rows.length) throw new Error("Keine Exportpositionen vorhanden.");
  const d=args.createdAt||new Date();
  const dp=format.slice(1);
  const projectCode=clean(project.code||project.number||"RLC");
  const projectName=clean(project.name||project.title||projectCode||"RLC Projekt");
  const owner=clean(args.owner?.name||"");
  const includePrice=["D82","D84","D85","D86"].includes(format);
  const ozStructure=analyzeOzStructure(rows);
  let seq=1;
  const lines:string[]=[];
  lines.push(rec("00",`        ${dp}L${projectCode.slice(0,24).padEnd(24," ")}999                      ${ozStructure.mask}90 `,seq++));
  lines.push(rec("01",`${projectName.slice(0,38).padEnd(38," ")}${dateDDMMYY(d)}${dateDDMMYY(d)}${d.toTimeString().slice(0,5)}${dateDDMMYY(d)}   `,seq++));
  lines.push(rec("02","",seq++));
  lines.push(rec("03",(owner||clean(company.name)).slice(0,72),seq++));
  lines.push(rec("08","EUR   Euro",seq++));

  const groupTotals=new Map<string,number>();
  if(includePrice){
    rows.forEach((row,index)=>{
      const ozInfo=parseOz(row.posNr||row.pos||row.position,index,ozStructure);
      const ep=n(row.preis ?? row.ep ?? row.finalUnitPrice);
      const qty=n(row.menge ?? row.mengeDelta ?? row.quantity);
      const total=n(row.gesamt ?? row.total ?? (qty * ep));
      for(const h of ozInfo.hierarchy) groupTotals.set(h,(groupTotals.get(h)||0)+total);
    });
  }

  let openHierarchy: string[]=[];
  rows.forEach((row,index)=>{
    const ozInfo=parseOz(row.posNr||row.pos||row.position,index,ozStructure);

    // GAEB 90 DA84 enthält nur OZ + Angebotswerte. Keine Menge, ME oder Texte.
    // Der Einheitspreis steht in ZA 22/23 (3 Nachkommastellen), der GB in 22/23.
    if(format === "D84") {
      let common=0;
      while(common<openHierarchy.length && common<ozInfo.hierarchy.length && openHierarchy[common]===ozInfo.hierarchy[common]) common++;
      for(let level=openHierarchy.length-1; level>=common; level--){
        const h=openHierarchy[level];
        lines.push(rec("32",`${h.padEnd(12," ")}${total12Gaeb90(groupTotals.get(h)||0)}`,seq++));
      }
      openHierarchy=ozInfo.hierarchy.slice();
      const ep = n(row.preis ?? row.ep ?? row.finalUnitPrice);
      const qty = n(row.menge ?? row.mengeDelta ?? row.quantity);
      const total = n(row.gesamt ?? row.total ?? (qty * ep));
      const ozField = ozInfo.encoded.padEnd(9," ").slice(0,9);
      const body = `${ozField}${ep11Gaeb90(ep)} ${total12Gaeb90(total)}`;
      lines.push(rec("23",body,seq++));
      return;
    }
    // Close hierarchy levels no longer shared with current position.
    let common=0;
    while(common<openHierarchy.length && common<ozInfo.hierarchy.length && openHierarchy[common]===ozInfo.hierarchy[common]) common++;
    for(let level=openHierarchy.length-1; level>=common; level--){
      const h=openHierarchy[level];
      lines.push(rec("31",h,seq++));
      if(includePrice) lines.push(rec("32",`${h.padEnd(12," ")}${total12Gaeb90(groupTotals.get(h)||0)}`,seq++));
    }
    openHierarchy=openHierarchy.slice(0,common);
    for(let level=common; level<ozInfo.hierarchy.length; level++){
      const h=ozInfo.hierarchy[level];
      lines.push(rec("11",`${h.padEnd(8," ")} N`,seq++));
      lines.push(rec("12",`Gliederung ${h}`,seq++));
      openHierarchy.push(h);
    }

    const unit=clean(row.einheit||row.unit||row.me||"St").replace(/²/g,"2").replace(/³/g,"3").slice(0,8);
    const q=qty11(row.menge ?? row.mengeDelta ?? row.quantity);
    const epValue=n(row.preis ?? row.ep ?? row.finalUnitPrice);
    const qtyValue=n(row.menge ?? row.mengeDelta ?? row.quantity);
    const totalValue=n(row.gesamt ?? row.total ?? (qtyValue * epValue));
    const body=`${ozInfo.encoded} NNN         ${q}${unit.padEnd(8," ")}`;
    lines.push(rec("21",body,seq++));
    if(includePrice) {
      const ozField = ozInfo.encoded.padEnd(9," ").slice(0,9);
      lines.push(rec("23", `${ozField}${ep11Gaeb90(epValue)} ${total12Gaeb90(totalValue)}`, seq++));
    }
    const short=clean(row.kurztext||row.text||row.title||"Position");
    lines.push(rec("25",short,seq++));
    if(ozInfo.original && !/^\d+(?:\.\d+){0,2}$/.test(ozInfo.original)){
      lines.push(rec("26",`   RLC-Original-OZ: ${ozInfo.original}`,seq++));
    }
    const long=clean(row.langtext||row.bemerkung||short);
    for(const part of splitText(long,69)) lines.push(rec("26","   "+part,seq++));
  });
  for(let level=openHierarchy.length-1; level>=0; level--){
    const h=openHierarchy[level];
    if(format === "D84") lines.push(rec("32",`${h.padEnd(12," ")}${total12Gaeb90(groupTotals.get(h)||0)}`,seq++));
    else {
      lines.push(rec("31",h,seq++));
      if(includePrice) lines.push(rec("32",`${h.padEnd(12," ")}${total12Gaeb90(groupTotals.get(h)||0)}`,seq++));
    }
  }
  lines.push(rec("99","",seq++));
  return lines.join("\r\n")+"\r\n";
}

export type GaebExportRow = {
  posNr?: unknown;
  pos?: unknown;
  position?: unknown;
  kurztext?: unknown;
  text?: unknown;
  title?: unknown;
  langtext?: unknown;
  bemerkung?: unknown;
  einheit?: unknown;
  unit?: unknown;
  me?: unknown;
  menge?: unknown;
  mengeDelta?: unknown;
  quantity?: unknown;
  preis?: unknown;
  ep?: unknown;
  finalUnitPrice?: unknown;
  gesamt?: unknown;
  total?: unknown;
  gaebItemKind?: unknown;
  gaebMarkupType?: unknown;
  gaebMarkupBase?: unknown;
  gaebAlnGroupNo?: unknown;
  gaebAlnSerNo?: unknown;
  gaebProvis?: unknown;
  gaebProvisAccpt?: unknown;
  gaebTextComplements?: any[];
  gaebImages?: any[];
  gaebSubDescriptions?: any[];
};

export type GaebCompany = {
  name?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type GaebProject = {
  code?: string | null;
  number?: string | null;
  name?: string | null;
  title?: string | null;
};

function s(value: unknown): string {
  return String(value ?? "").trim();
}

function n(value: unknown): number {
  const x = Number(value);
  return Number.isFinite(x) ? x : 0;
}

export function xmlEscape(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function clip(value: unknown, max: number): string {
  return s(value).slice(0, max);
}

function isoDate(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function isoTime(date = new Date()): string {
  return date.toISOString().slice(11, 19);
}

export function parseGaebAddress(raw: string | null | undefined): {
  street: string;
  pcode: string;
  city: string;
} | null {
  const address = s(raw).replace(/\s+/g, " ");
  if (!address) return null;
  const m = address.match(/^(.+?)(?:,\s*|\s+)(\d{5})\s+(.+)$/);
  if (!m) return null;
  const street = clip(m[1], 40);
  const pcode = clip(m[2], 20);
  const city = clip(m[3], 40);
  if (!street || !pcode || !city) return null;
  return { street, pcode, city };
}

function gaebRNoPart(raw: unknown, index: number): string {
  const normalized = s(raw)
    .replace(/[^0-9A-Za-z_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 14);
  return normalized || `P${String(index + 1).padStart(4, "0")}`;
}

type XmlOzStructure = { levelWidths:number[]; itemWidth:number; hasIndex:boolean };

type Xml84Node = {
  part: string;
  children: Map<string, Xml84Node>;
  rows: Array<{ row: GaebExportRow; item: string; index: string; sourceIndex: number }>;
};

function analyzeXmlOz(rows: GaebExportRow[]): XmlOzStructure {
  const parsed = rows.map((row, index) => {
    const raw = s(row.posNr || row.pos || row.position || String(index + 1));
    const parts = raw.split('.').map(x => x.trim()).filter(Boolean);
    if (!parts.length) throw new Error('GAEB_XML_OZ_UNGUELTIG: Leere OZ.');
    return { raw, parts };
  });
  const minLen = Math.min(...parsed.map(x => x.parts.length));
  const maxLen = Math.max(...parsed.map(x => x.parts.length));
  const hasIndex = maxLen === minLen + 1 && parsed.some(x => {
    const p=x.parts; return p.length===maxLen && /^[0-9A-Za-z]$/.test(p[p.length-1]);
  });
  const baseLen = hasIndex ? maxLen - 1 : maxLen;
  if (baseLen < 1) throw new Error('GAEB_XML_OZ_UNGUELTIG');
  const levelCount = baseLen - 1;
  if (levelCount > 5) throw new Error(`GAEB_XML_ZU_VIELE_LV_STUFEN: ${levelCount}; maximal 5.`);
  for (const x of parsed) {
    if (x.parts.length !== baseLen && !(hasIndex && x.parts.length === baseLen + 1)) {
      throw new Error(`GAEB_XML_OZ_STRUKTUR_UNEINHEITLICH: ${x.raw}`);
    }
    const core=x.parts.slice(0,baseLen);
    if (!core.every(v=>/^\d+$/.test(v))) throw new Error(`GAEB_XML_OZ_UNGUELTIG: LV-Stufen und Position müssen numerisch sein (${x.raw}).`);
    if (x.parts.length===baseLen+1 && !/^[0-9A-Za-z]$/.test(x.parts[x.parts.length-1])) throw new Error(`GAEB_XML_INDEX_UNGUELTIG: ${x.raw}`);
  }
  const levelWidths=Array.from({length:levelCount},(_,i)=>Math.max(...parsed.map(x=>x.parts[i].length)));
  const itemWidth=Math.max(...parsed.map(x=>x.parts[levelCount].length));
  const total=levelWidths.reduce((a,b)=>a+b,0)+itemWidth+(hasIndex?1:0);
  if(total>14) throw new Error(`GAEB_XML_OZ_ZU_LANG: ${total} Stellen; maximal 14.`);
  return {levelWidths,itemWidth,hasIndex};
}

function parseXmlOz(value: unknown, structure: XmlOzStructure): {levels:string[];item:string;index:string} {
  const raw=s(value);
  const parts=raw.split('.').map(x=>x.trim()).filter(Boolean);
  const base=structure.levelWidths.length+1;
  if(parts.length!==base && !(structure.hasIndex && parts.length===base+1)) throw new Error(`GAEB_XML_OZ_UNGUELTIG: ${raw}`);
  const levels=structure.levelWidths.map((width,i)=>parts[i].padStart(width,'0'));
  const item=parts[structure.levelWidths.length].padStart(structure.itemWidth,'0');
  const index=parts.length>base?parts[parts.length-1]:'';
  return {levels,item,index};
}

function xml84Item(row: GaebExportRow, item:string, index:string, sourceIndex:number, baseForMarkup:number): {xml:string,total:number} {
  const ep=n(row.preis ?? row.ep ?? row.finalUnitPrice);
  const qty=n(row.menge ?? row.mengeDelta ?? row.quantity);
  const totalRaw=row.gesamt ?? row.total;
  const hasExplicitTotal=totalRaw !== undefined && totalRaw !== null && totalRaw !== "";
  const explicitTotal=n(totalRaw);
  const indexAttr=index?` RNoIndex="${xmlEscape(index)}"`:'';
  const id=`I${String(sourceIndex+1).padStart(7,'0')}`;
  const kind=s(row.gaebItemKind);
  if(kind==='MarkupItem'){
    const markup=ep;
    const markupBaseRaw=row.gaebMarkupBase;
    const markupBase=markupBaseRaw !== undefined && markupBaseRaw !== null && markupBaseRaw !== "" ? n(markupBaseRaw) : baseForMarkup;
    const calculatedMarkupTotal=markupBase*markup/100;
    const total=hasExplicitTotal && explicitTotal > 0 ? explicitTotal : calculatedMarkupTotal;
    return {xml:`<MarkupItem ID="${id}" RNoPart="${xmlEscape(item)}"${indexAttr}><ITMarkup>${markupBase.toFixed(2)}</ITMarkup><Markup>${markup.toFixed(2)}</Markup><IT>${total.toFixed(2)}</IT></MarkupItem>`,total};
  }
  const total=hasExplicitTotal ? explicitTotal : qty*ep;
  const comps=Array.isArray(row.gaebTextComplements)?row.gaebTextComplements:[];
  const subDescr=Array.isArray(row.gaebSubDescriptions)?row.gaebSubDescriptions:[];
  let extra='';
  if(comps.length){
    extra+='<Description><CompleteText><DetailTxt>';
    for(const c of comps){
      extra+=`<TextComplement MarkLbl="${xmlEscape(c?.markLbl||'')}" Kind="Bidder"><ComplBody><span>${xmlEscape(c?.body||'')}</span></ComplBody></TextComplement>`;
    }
    extra+='</DetailTxt></CompleteText></Description>';
  }
  for(const sub of subDescr){
    const no=s(sub?.subDNo); if(no) extra+=`<SubDescr><SubDNo>${xmlEscape(no)}</SubDNo></SubDescr>`;
  }
  return {xml:`<Item ID="${id}" RNoPart="${xmlEscape(item)}"${indexAttr}><UP>${ep.toFixed(3)}</UP><IT>${total.toFixed(2)}</IT>${extra}</Item>`,total};
}

function xmlDescription(row: GaebExportRow): string {
  const shortText=clip(row.kurztext || row.text || row.title || 'Position',1000) || 'Position';
  const longText=s(row.langtext || row.bemerkung || shortText) || shortText;
  const detail=longText.split(/\r?\n+/).map(v=>v.trim()).filter(Boolean).map(v=>`<p><span>${xmlEscape(v)}</span></p>`).join('') || `<p><span>${xmlEscape(shortText)}</span></p>`;
  const outline=`<p><span>${xmlEscape(shortText)}</span></p>`;
  return `<Description><CompleteText><DetailTxt><Text>${detail}</Text></DetailTxt><OutlineText><OutlTxt><TextOutlTxt>${outline}</TextOutlTxt></OutlTxt></OutlineText></CompleteText></Description>`;
}

export function buildGaebX83Xml(args: {
  rows: GaebExportRow[];
  project: GaebProject;
  createdAt?: Date;
}): string {
  const {rows,project}=args;
  if(!Array.isArray(rows)||!rows.length) throw new Error('Keine Exportpositionen vorhanden.');
  const createdAt=args.createdAt||new Date();
  const projectCode=clip(project.code||project.number||'RLC',100)||'RLC';
  const projectName=clip(project.name||project.title||projectCode||'RLC Projekt',60)||'RLC Projekt';
  const boqName=clip(projectCode||projectName,20)||'RLC-LV';
  const structure=analyzeXmlOz(rows);
  const root:Xml84Node={part:'',children:new Map(),rows:[]};
  rows.forEach((row,sourceIndex)=>{
    const oz=parseXmlOz(row.posNr||row.pos||row.position,structure);
    let node=root;
    for(const level of oz.levels){
      if(!node.children.has(level)) node.children.set(level,{part:level,children:new Map(),rows:[]});
      node=node.children.get(level)!;
    }
    node.rows.push({row,item:oz.item,index:oz.index,sourceIndex});
  });
  let categoryIdCounter=1;
  function renderNode(node:Xml84Node):string{
    let body='';
    for(const child of node.children.values()){
      const categoryId=`C${String(categoryIdCounter++).padStart(7,'0')}`;
      body+=`<BoQCtgy ID="${categoryId}" RNoPart="${xmlEscape(child.part)}"><LblTx><p><span>${xmlEscape(child.part)}</span></p></LblTx><BoQBody>${renderNode(child)}</BoQBody></BoQCtgy>`;
    }
    if(node.rows.length){
      let list='';
      for(const entry of node.rows){
        const row=entry.row;
        const id=`I${String(entry.sourceIndex+1).padStart(7,'0')}`;
        const indexAttr=entry.index?` RNoIndex="${xmlEscape(entry.index)}"`:'';
        const kind=s(row.gaebItemKind);
        if(kind==='MarkupItem'){
          list+=`<MarkupItem ID="${id}" RNoPart="${xmlEscape(entry.item)}"${indexAttr}><MarkupType>${xmlEscape(s(row.gaebMarkupType)||'AllInCat')}</MarkupType>${xmlDescription(row)}</MarkupItem>`;
          continue;
        }
        const qty=n(row.menge ?? row.mengeDelta ?? row.quantity);
        const unit=clip(row.einheit||row.unit||row.me||'St',4)||'St';
        const provis=s(row.gaebProvis);
        const provisAccpt=s(row.gaebProvisAccpt);
        const alnGroup=s(row.gaebAlnGroupNo);
        const alnSer=s(row.gaebAlnSerNo);
        list+=`<Item ID="${id}" RNoPart="${xmlEscape(entry.item)}"${indexAttr}>${provis?`<Provis>${xmlEscape(provis)}</Provis>`:''}${provisAccpt?`<ProvisAccpt>${xmlEscape(provisAccpt)}</ProvisAccpt>`:''}<Qty>${qty.toFixed(3)}</Qty><QU>${xmlEscape(unit)}</QU>${alnGroup?`<ALNGroupNo>${xmlEscape(alnGroup)}</ALNGroupNo>`:''}${alnSer?`<ALNSerNo>${xmlEscape(alnSer)}</ALNSerNo>`:''}${xmlDescription(row)}</Item>`;
      }
      body+=`<Itemlist>${list}</Itemlist>`;
    }
    return body;
  }
  const breakdown=[
    ...structure.levelWidths.map(w=>`<BoQBkdn><Type>BoQLevel</Type><Length>${w}</Length><Num>Yes</Num></BoQBkdn>`),
    `<BoQBkdn><Type>Item</Type><Length>${structure.itemWidth}</Length><Num>Yes</Num></BoQBkdn>`,
    ...(structure.hasIndex?[`<BoQBkdn><Type>Index</Type><Length>1</Length><Num>No</Num><Alignment>left</Alignment></BoQBkdn>`]:[])
  ].join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.3"><GAEBInfo><Version>3.3</Version><VersDate>2021-05</VersDate><Date>${isoDate(createdAt)}</Date><Time>${isoTime(createdAt)}</Time><ProgSystem>RLC Bausoftware 1.0.0</ProgSystem><ProgName>RLC Bausoftware</ProgName></GAEBInfo><PrjInfo><NamePrj>${xmlEscape(projectName)}</NamePrj><LblPrj>${xmlEscape(projectCode)}</LblPrj><Cur>EUR</Cur><CurLbl/></PrjInfo><Award><DP>83</DP><AwardInfo><Cur>EUR</Cur><CurLbl/></AwardInfo><BoQ ID="BoQ1"><BoQInfo><Name>${xmlEscape(boqName)}</Name><LblBoQ>${xmlEscape(projectName)}</LblBoQ><OutlCompl>AllTxt</OutlCompl>${breakdown}</BoQInfo><BoQBody>${renderNode(root)}</BoQBody></BoQ></Award></GAEB>\n`;
}

export function buildGaebX84Xml(args: {
  rows: GaebExportRow[];
  project: GaebProject;
  company: GaebCompany;
  createdAt?: Date;
}): string {
  const { rows, project, company } = args;
  if (!Array.isArray(rows) || !rows.length) throw new Error('Keine Exportpositionen vorhanden.');
  const createdAt=args.createdAt||new Date();
  const projectCode=clip(project.code||project.number||'RLC',100)||'RLC';
  const projectName=clip(project.name||project.title||projectCode||'RLC Projekt',60)||'RLC Projekt';
  const boqName=clip(projectCode||projectName,20)||'RLC-LV';
  const companyName=clip(company.name||'',40);
  const address=parseGaebAddress(company.address);
  if(!companyName||!address) throw new Error("GAEB_STAMMDATEN_UNVOLLSTAENDIG: Firmenname und Adresse im Format 'Straße Hausnr., PLZ Ort' erforderlich.");

  const structure=analyzeXmlOz(rows);
  const root:Xml84Node={part:'',children:new Map(),rows:[]};
  rows.forEach((row,sourceIndex)=>{
    const oz=parseXmlOz(row.posNr||row.pos||row.position,structure);
    let node=root;
    for(const level of oz.levels){
      if(!node.children.has(level)) node.children.set(level,{part:level,children:new Map(),rows:[]});
      node=node.children.get(level)!;
    }
    node.rows.push({row,item:oz.item,index:oz.index,sourceIndex});
  });

  let categoryIdCounter=1;
  function renderNode(node:Xml84Node, depth:number):{xml:string,total:number}{
    let total=0; let body='';
    for(const child of node.children.values()){
      const rendered=renderNode(child,depth+1); total+=rendered.total;
      const categoryId=`C${String(categoryIdCounter++).padStart(7,'0')}`;
      body+=`<BoQCtgy ID="${categoryId}" RNoPart="${xmlEscape(child.part)}"><BoQBody>${rendered.xml}</BoQBody><Totals><Total>${rendered.total.toFixed(2)}</Total></Totals></BoQCtgy>`;
    }
    if(node.rows.length){
      let list=''; let running=0;
      const orderedRows=[...node.rows].sort((a,b)=>{
        const itemCmp=String(a.item).localeCompare(String(b.item),'de',{numeric:true,sensitivity:'base'});
        if(itemCmp!==0) return itemCmp;
        return String(a.index||'').localeCompare(String(b.index||''),'de',{numeric:true,sensitivity:'base'});
      });
      for(const entry of orderedRows){
        const built=xml84Item(entry.row,entry.item,entry.index,entry.sourceIndex,running);
        list+=built.xml; running+=built.total; total+=built.total;
      }
      body+=`<Itemlist>${list}</Itemlist>`;
    }
    return {xml:body,total};
  }
  const rendered=renderNode(root,0);
  const breakdown=[
    ...structure.levelWidths.map(w=>`<BoQBkdn><Type>BoQLevel</Type><Length>${w}</Length><Num>Yes</Num></BoQBkdn>`),
    `<BoQBkdn><Type>Item</Type><Length>${structure.itemWidth}</Length><Num>Yes</Num></BoQBkdn>`,
    ...(structure.hasIndex?[`<BoQBkdn><Type>Index</Type><Length>1</Length><Num>No</Num><Alignment>left</Alignment></BoQBkdn>`]:[])
  ].join('');
  const phone=s(company.phone)?`<Phone>${xmlEscape(clip(company.phone,20))}</Phone>`:'';
  const email=s(company.email)?`<Email>${xmlEscape(clip(company.email,256))}</Email>`:'';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA84/3.3"><GAEBInfo><Version>3.3</Version><VersDate>2021-05</VersDate><Date>${isoDate(createdAt)}</Date><Time>${isoTime(createdAt)}</Time><ProgSystem>RLC Bausoftware 1.0.0</ProgSystem><ProgName>RLC Bausoftware</ProgName></GAEBInfo><PrjInfo><NamePrj>${xmlEscape(projectName)}</NamePrj><LblPrj>${xmlEscape(projectCode)}</LblPrj></PrjInfo><Award><DP>84</DP><AwardInfo><Cur>EUR</Cur><CurLbl/></AwardInfo><CTR><Address><Name1>${xmlEscape(companyName)}</Name1><Street>${xmlEscape(address.street)}</Street><PCode>${xmlEscape(address.pcode)}</PCode><City>${xmlEscape(address.city)}</City>${phone}${email}</Address></CTR><BoQ ID="BoQ1"><BoQInfo><Name>${xmlEscape(boqName)}</Name>${breakdown}<Totals><Total>${rendered.total.toFixed(2)}</Total></Totals></BoQInfo><BoQBody>${rendered.xml}</BoQBody></BoQ></Award></GAEB>\n`;
}


export type GaebOwner = {
  name?: string | null;
  street?: string | null;
  pcode?: string | null;
  city?: string | null;
};

function fullAddressXml(name: string, street: string, pcode: string, city: string, email?: string, phone?: string): string {
  return `<Address>\n        <Name1>${xmlEscape(clip(name, 40))}</Name1>\n        <Street>${xmlEscape(clip(street, 40))}</Street>\n        <PCode>${xmlEscape(clip(pcode, 20))}</PCode>\n        <City>${xmlEscape(clip(city, 40))}</City>${phone ? `\n        <Phone>${xmlEscape(clip(phone, 20))}</Phone>` : ""}${email ? `\n        <Email>${xmlEscape(clip(email, 256))}</Email>` : ""}\n      </Address>`;
}

export function buildGaebX85X87Xml(args: {
  format: "X85" | "X86" | "X87";
  rows: GaebExportRow[];
  project: GaebProject;
  company: GaebCompany;
  owner?: GaebOwner | null;
  createdAt?: Date;
}): string {
  const { format, rows, project, company } = args;
  if (!Array.isArray(rows) || !rows.length) throw new Error("Keine Exportpositionen vorhanden.");
  const createdAt = args.createdAt || new Date();
  const phase = format.slice(1);
  const projectCode = clip(project.code || project.number || "RLC", 100) || "RLC";
  const projectName = clip(project.name || project.title || projectCode || "RLC Projekt", 60) || "RLC Projekt";
  const boqName = clip(projectCode || projectName, 20) || "RLC-LV";
  const companyName = clip(company.name || "", 40);
  const companyAddress = parseGaebAddress(company.address);
  if (!companyName || !companyAddress) throw new Error("GAEB_STAMMDATEN_UNVOLLSTAENDIG: Firmenname und Adresse erforderlich.");

  let ownerXml = "";
  if (format === "X86" || format === "X87") {
    const o = args.owner || {};
    const name = clip(o.name || "", 40), street = clip(o.street || "", 40), pcode = clip(o.pcode || "", 20), city = clip(o.city || "", 40);
    if (!name || !street || !pcode || !city) throw new Error("GAEB_AUFTRAGGEBER_UNVOLLSTAENDIG: Für X86/X87 sind Name, Straße, PLZ und Ort des Auftraggebers erforderlich.");
    ownerXml = `\n    <OWN>\n      ${fullAddressXml(name, street, pcode, city)}\n    </OWN>`;
  }
  const contractorXml = `\n    <CTR>\n      ${fullAddressXml(companyName, companyAddress.street, companyAddress.pcode, companyAddress.city, s(company.email), s(company.phone))}\n    </CTR>`;
  const structure=analyzeXmlOz(rows);
  const root:Xml84Node={part:'',children:new Map(),rows:[]};
  rows.forEach((row,sourceIndex)=>{
    const oz=parseXmlOz(row.posNr||row.pos||row.position,structure);
    let node=root;
    for(const level of oz.levels){
      if(!node.children.has(level)) node.children.set(level,{part:level,children:new Map(),rows:[]});
      node=node.children.get(level)!;
    }
    node.rows.push({row,item:oz.item,index:oz.index,sourceIndex});
  });
  let categoryIdCounter=1;
  function renderNode(node:Xml84Node):{xml:string,total:number}{
    let xml=''; let total=0;
    for(const child of node.children.values()){
      const rendered=renderNode(child); total+=rendered.total;
      const categoryId=`C${String(categoryIdCounter++).padStart(7,'0')}`;
      xml+=`<BoQCtgy ID="${categoryId}" RNoPart="${xmlEscape(child.part)}"><LblTx><p><span>${xmlEscape(child.part)}</span></p></LblTx><BoQBody>${rendered.xml}</BoQBody><Totals><Total>${rendered.total.toFixed(2)}</Total></Totals></BoQCtgy>`;
    }
    if(node.rows.length){
      let list='';
      for(const entry of node.rows){
        const row=entry.row;
        const qty=n(row.menge ?? row.mengeDelta ?? row.quantity);
        const ep=n(row.preis ?? row.ep ?? row.finalUnitPrice);
        const totalRaw=row.gesamt ?? row.total;
        const hasExplicit=totalRaw !== undefined && totalRaw !== null && totalRaw !== '';
        const itemTotal=hasExplicit?n(totalRaw):qty*ep;
        total+=itemTotal;
        const unit=clip(row.einheit || row.unit || row.me || 'St',4)||'St';
        const indexAttr=entry.index?` RNoIndex="${xmlEscape(entry.index)}"`:'';
        list+=`<Item ID="I${String(entry.sourceIndex+1).padStart(7,'0')}" RNoPart="${xmlEscape(entry.item)}"${indexAttr}><Qty>${qty.toFixed(3)}</Qty><QU>${xmlEscape(unit)}</QU><UP>${ep.toFixed(3)}</UP><IT>${itemTotal.toFixed(2)}</IT>${xmlDescription(row)}</Item>`;
      }
      xml+=`<Itemlist>${list}</Itemlist>`;
    }
    return {xml,total};
  }
  const rendered=renderNode(root);
  const breakdown=[
    ...structure.levelWidths.map(w=>`<BoQBkdn><Type>BoQLevel</Type><Length>${w}</Length><Num>Yes</Num></BoQBkdn>`),
    `<BoQBkdn><Type>Item</Type><Length>${structure.itemWidth}</Length><Num>Yes</Num></BoQBkdn>`,
    ...(structure.hasIndex?[`<BoQBkdn><Type>Index</Type><Length>1</Length><Num>No</Num><Alignment>left</Alignment></BoQBkdn>`]:[])
  ].join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA${phase}/3.3">\n  <GAEBInfo><Version>3.3</Version><VersDate>2021-05</VersDate><Date>${isoDate(createdAt)}</Date><Time>${isoTime(createdAt)}</Time><ProgSystem>RLC Bausoftware 1.0.0</ProgSystem><ProgName>RLC GAEB Export</ProgName></GAEBInfo>\n  <PrjInfo><NamePrj>${xmlEscape(projectName)}</NamePrj><LblPrj>${xmlEscape(projectCode)}</LblPrj></PrjInfo>\n  <Award><DP>${phase}</DP>${ownerXml}${contractorXml}\n    <BoQ ID="BoQ1"><BoQInfo><Name>${xmlEscape(boqName)}</Name><LblBoQ>${xmlEscape(projectName)}</LblBoQ><OutlCompl>AllTxt</OutlCompl>${breakdown}<Totals><Total>${rendered.total.toFixed(2)}</Total></Totals></BoQInfo><BoQBody>${rendered.xml}</BoQBody></BoQ>\n  </Award>\n</GAEB>\n`;
}

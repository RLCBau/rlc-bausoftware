import { InputError } from "./officeAddons";
export type BidLine = {position: string; title: string; unit: string; quantity: string; unitPrice: string};
export function decimal(value: unknown, digits: number, name: string): string {
  if (typeof value !== "string" && typeof value !== "number") throw new InputError(name + ": Zahl fehlt.");
  const s=String(value).trim().replace(",",".");
  if (!new RegExp("^\\d{1,9}(\\.\\d{1,"+digits+"})?$").test(s)) throw new InputError(name + ": ungültige Zahl.");
  const [a,b=""]=s.split(".");
  return String(BigInt(a)) + (b ? "."+b.replace(/0+$/,"") : "").replace(/\.$/,"");
}
function scale(value: string, digits: number): bigint {
  const [a,b=""]=value.split("."); return BigInt(a)*10n**BigInt(digits)+BigInt(b.padEnd(digits,"0") || "0");
}
export function lineCents(quantity: string, unitPrice: string): bigint {
  return (scale(quantity,6)*scale(unitPrice,4)+50000000n)/100000000n;
}
export function money(cents: bigint): string {return (cents/100n).toString()+"."+(cents%100n).toString().padStart(2,"0");}
function text(v: unknown, name: string, max: number, required=true): string {
  if(typeof v!=="string") {if(!required && v==null)return "";throw new InputError(name+": Text erwartet.");}
  const s=v.trim();if((required && !s)||s.length>max)throw new InputError(name+": ungültige Länge.");return s;
}
export function bidInput(body: any) {
  if(!body || typeof body!=="object" || !Array.isArray(body.positions) || body.positions.length<1 || body.positions.length>5000)throw new InputError("1 bis 5000 Angebotspositionen erforderlich.");
  const seen=new Set<string>();
  const positions:BidLine[]=body.positions.map((r:any)=>{
    const position=text(r?.position,"Position",100);
    if(seen.has(position))throw new InputError("Position doppelt: "+position);seen.add(position);
    const quantity=decimal(r.quantity,6,position+" Menge");const unitPrice=decimal(r.unitPrice,4,position+" EP");
    if(lineCents(quantity,unitPrice)>99999999999999n)throw new InputError("Positionsbetrag zu groß: "+position);
    return {position,title:text(r.title,"Kurztext",1000,false),unit:text(r.unit,"Einheit",30),quantity,unitPrice};
  });
  const discountPercent=decimal(body.discountPercent ?? "0",2,"Nachlass");
  if(Number(discountPercent)>100)throw new InputError("Nachlass muss zwischen 0 und 100 % liegen.");
  if(!["LV","MAT"].includes(body.kind))throw new InputError("Angebotsart ungültig.");
  if(!["Entwurf","Eingereicht","Archiviert"].includes(body.status))throw new InputError("Angebotsstatus ungültig.");
  return {title:text(body.title,"Angebot",250),supplier:text(body.supplier,"Anbieter",250),packageKey:text(body.packageKey,"Vergabepaket",100),
    kind:body.kind,status:body.status,discountPercent,positions,documentId:text(body.documentId,"Dokument",100,false)||null,
    notes:text(body.notes,"Bemerkung",5000,false)||null};
}
export function total(positions:BidLine[],discount: string) {
  const cents=positions.reduce((a,r)=>a+lineCents(r.quantity,r.unitPrice),0n);
  return money((cents*(10000n-scale(discount,2))+5000n)/10000n);
}
function unit(s:string) {
  return s.toLowerCase().trim().replace(/\s+/g,"").replace(/²/g,"2").replace(/³/g,"3").replace(/^qm$/,"m2").replace(/^cbm$/,"m3").replace(/^(stk\.?|stück|stueck)$/,"st");
}
export function compareBids(bids: any[], baselineId: string) {
  const baseline=bids.find(b=>b.id===baselineId);
  if(!baseline)throw new InputError("Vergleichsbasis fehlt.");
  const basis=baseline.positions as BidLine[];
  const basisPositions=new Set(basis.map(r=>r.position));
  const results=bids.map(b=>{
    const positions=b.positions as BidLine[];
    const map=new Map(positions.map(r=>[r.position,r]));
    const extra=positions.filter(r=>!basisPositions.has(r.position)).map(r=>r.position);
    const issues:string[]=[];
    const normalized:BidLine[]=[];
    const cells=basis.map(ref=>{
      const row=map.get(ref.position);
      if(!row){issues.push(ref.position+": fehlt");return {position:ref.position,comparable:false,reason:"Fehlt"};}
      if(unit(row.unit)!==unit(ref.unit)){issues.push(ref.position+": abweichende Einheit");return {position:ref.position,comparable:false,reason:"Einheit abweichend"};}
      normalized.push({...row,quantity:ref.quantity});
      return {position:ref.position,comparable:true,unitPrice:row.unitPrice,amount:money(lineCents(ref.quantity,row.unitPrice)),quantityDiff:scale(row.quantity,6)!==scale(ref.quantity,6),textDiff:row.title!==ref.title};
    });
    if(extra.length)issues.push("Zusatzpositionen: "+extra.join(", "));
    const comparable=issues.length===0;
    return {id:b.id,title:b.title,supplier:b.supplier,status:b.status,awardedAt:b.awardedAt,discountPercent:String(b.discountPercent),
      offeredTotal:total(positions,String(b.discountPercent)),normalizedTotal:comparable ? total(normalized,String(b.discountPercent)):null,comparable,issues,cells};
  });
  const ranked=results.filter(r=>r.comparable && r.status==="Eingereicht").sort((a,b)=>{
    const x=scale(a.normalizedTotal!,2),y=scale(b.normalizedTotal!,2);return x<y?-1:x>y?1:0;
  });
  return {baselineId,positions:basis,offers:results,ranking:ranked.map((r,i)=>({id:r.id,rank:i+1,total:r.normalizedTotal}))};
}

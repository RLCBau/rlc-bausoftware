
import crypto from "crypto";
import {InputError} from "./officeAddons";
const SCALE=1000000n;
export function deliveryQuantity(value:unknown):bigint{
 if(typeof value!=="string"&&typeof value!=="number")throw new InputError("Liefermenge fehlt.");
 const s=String(value).trim().replace(",",".");
 if(!/^\d{1,9}(\.\d{1,6})?$/.test(s))throw new InputError("Liefermenge: maximal sechs Nachkommastellen erforderlich.");
 const [a,b=""]=s.split(".");return BigInt(a)*SCALE+BigInt(b.padEnd(6,"0"));
}
export function quantityText(v:bigint):string{
 const a=v/SCALE,b=String(v%SCALE).padStart(6,"0").replace(/0+$/,"");return String(a)+(b?"."+b:"");
}
export function deliveryUnit(v:any):string{
 const s=String(v??"").trim().toLowerCase().replace(/[.\s]/g,"");
 const aliases:any={"m3":"m³",cbm:"m³","m³":"m³","m2":"m²",qm:"m²","m²":"m²",stk:"stk",stück:"stk",st:"stk",pcs:"stk",tonne:"t",tonnen:"t",to:"t",t:"t",meter:"m",lfm:"m",m:"m",kg:"kg"};
 return aliases[s]||s;
}
export function allocationInput(value:any,note:any,order:any){
 if(!Array.isArray(value)||value.length>2000)throw new InputError("Positionszuordnungen als Liste erforderlich.");
 if(value.length&&!order)throw new InputError("Positionszuordnung benötigt eine Bestellung.");
 const seen=new Set<number>();
 return value.map((a:any)=>{
  if(!a||!Number.isSafeInteger(a.position)||seen.has(a.position))throw new InputError("Jede Lieferscheinposition darf nur einmal zugeordnet werden.");
  seen.add(a.position);
  const source=note.rows.find((r:any)=>r.position===a.position),line=order.lines.find((l:any)=>l.id===a.orderLineId);
  if(!source||!line)throw new InputError("Liefer- oder Bestellposition nicht verfügbar.");
  const quantity=deliveryQuantity(source.quantity);
  if(quantity<=0n)throw new InputError("Nur positive Liefermengen zuordnen. Retouren gesondert klären.");
  const unit=deliveryUnit(source.unit);
  if(!unit||unit!==deliveryUnit(line.unit))throw new InputError("Einheiten stimmen nicht überein. Keine automatische Umrechnung.");
  return {position:source.position,orderLineId:line.id,quantity:quantityText(quantity),unit};
 });
}
export function reconciliation(order:any,reviews:any[],notes:any[],fingerprint:(o:any)=>string){
 const sources=new Map(notes.map(n=>[n.key,n])),current=fingerprint(order);
 const candidates=reviews.filter(r=>r.orderId===order.id);
 const totals=new Map<string,bigint>(),counts=new Map<string,number>(),excluded:any[]=[];
 const possible:any[]=[];
 for(const r of candidates){
  const n:any=sources.get(r.deliveryKey);
  let reason="";
  if(r.status!=="GEKLAERT")reason="Nicht abschließend geprüft";
  else if(!n)reason="Quelle fehlt oder ist unlesbar";
  else if(n.sourceHash!==r.sourceHash)reason="Quelle geändert";
  else if(fingerprint(r.orderSnapshot)!==current)reason="Bestellung geändert";
  else if(!Array.isArray(r.allocations)||!r.allocations.length)reason="Keine Positionszuordnung";
  let allocations:any[]=[];
  if(!reason){
   try{allocations=allocationInput(r.allocations,n,order);}
   catch{reason="Positionszuordnung ungültig";}
   const positive=n.rows.filter((x:any)=>{try{return deliveryQuantity(x.quantity)>0n;}catch{return true;}});
   if(positive.some((x:any)=>!allocations.some(a=>a.position===x.position)))reason="Positionen unvollständig zugeordnet";
  }
  if(reason)excluded.push({deliveryKey:r.deliveryKey,reason});
  else possible.push({r,n,allocations});
 }
 const identity=(n:any)=>n.sourceDocId?"id:"+n.sourceDocId:n.number&&n.supplier&&n.date?"nr:"+JSON.stringify([n.number.trim().toLowerCase(),n.supplier.trim().toLowerCase(),n.date]):"key:"+n.key;
 const duplicates=new Map<string,number>();for(const x of possible){const k=identity(x.n);duplicates.set(k,(duplicates.get(k)||0)+1);}
 let included=0;
 for(const {r,n,allocations} of possible){
  if((duplicates.get(identity(n))||0)>1){excluded.push({deliveryKey:r.deliveryKey,reason:"Möglicher doppelter Lieferschein"});continue;}
  included++;
  for(const a of allocations){totals.set(a.orderLineId,(totals.get(a.orderLineId)||0n)+deliveryQuantity(a.quantity));counts.set(a.orderLineId,(counts.get(a.orderLineId)||0)+1);}
 }
 let invalidLines=false;
 const lines=order.lines.map((l:any)=>{
  let ordered=0n,invalid=false;
  try{ordered=deliveryQuantity(l.qty);if(ordered<=0n||!deliveryUnit(l.unit))invalid=true;}catch{invalid=true;}
  if(invalid)invalidLines=true;
  const delivered=totals.get(l.id)||0n;
  return {id:l.id,name:l.name,unit:l.unit,ordered:invalid?String(l.qty):quantityText(ordered),delivered:quantityText(delivered),remaining:invalid?null:quantityText(ordered>delivered?ordered-delivered:0n),excess:invalid?null:quantityText(delivered>ordered?delivered-ordered:0n),invalid,deliveries:counts.get(l.id)||0};
 });
 const complete=lines.length>0&&!invalidLines&&!excluded.length&&lines.every((l:any)=>l.remaining==="0");
 const any=lines.some((l:any)=>l.delivered!=="0"),excess=lines.some((l:any)=>l.excess&&l.excess!=="0");
 const status=complete?(excess?"MEHRGELIEFERT":"VOLLSTAENDIG"):any?"TEILGELIEFERT":"OFFEN";
 const revisionHash=crypto.createHash("sha256").update(JSON.stringify([current,candidates.map(r=>[r.id,r.revision,r.sourceHash]),notes.map(n=>[n.key,n.sourceHash])])).digest("hex");
 return {orderId:order.id,number:order.number,status,lines,included,excluded,excess,complete,revisionHash};
}

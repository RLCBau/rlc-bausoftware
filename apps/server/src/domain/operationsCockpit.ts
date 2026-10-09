import {certificateExpiry} from "./personnelCertificate";
import {dueDates} from "./recurringLedger";
type Issue={id:string;title:string;reason:string;date:string;severity:string};
const day=(v:any)=>v instanceof Date?v.toISOString().slice(0,10):typeof v==="string"?v.slice(0,10):"";
export function expiryIssue(row:any,today:string):Issue|null{
 const expiry=certificateExpiry(row.validUntil,today);
 const reason=expiry.status==="ABGELAUFEN"?"Frist abgelaufen":expiry.status==="BALD_FAELLIG"?"Frist innerhalb von 30 Tagen":day(row.validFrom)>today?"Noch nicht gültig":"";
 return reason?{id:row.id,title:row.title,reason,date:day(row.validUntil)||day(row.validFrom),severity:expiry.status==="ABGELAUFEN"?"danger":"warning"}:null;
}
export function operationsCard(key:string,rows:any[],today:string,through:string){
 const details:Issue[]=[],counts:Record<string,number>={};
 const add=(r:any,reason:string,severity="info",date="")=>details.push({id:r.id,title:r.title||r.activity||r.number||r.machine?.name||"Vorgang",reason,severity,date});
 let label="Vorgänge",total=rows.length;
 for(const r of rows){
  counts[r.status||"AKTIV"]=(counts[r.status||"AKTIV"]||0)+1;
  if(key==="guarantees"){
   const issue=["Aktiv","Freigabe beantragt"].includes(r.status)?expiryIssue(r,today):null;
   if(issue)details.push(issue);else if(r.status==="Entwurf")add(r,"Entwurf vervollständigen");else if(r.status==="Freigabe beantragt")add(r,"Rückgabe / Freigabe prüfen","warning");
  }else if(key==="certificates"){
   const issue=r.status==="Geprüft"?expiryIssue(r,today):null;
   if(issue)details.push(issue);else if(r.status==="Ungeprüft")add(r,"Prüfung offen","warning");else if(r.status==="Abgelehnt")add(r,"Nachweis abgelehnt","danger");
  }else if(key==="bids"){if(r.status==="Entwurf")add(r,"Angebot im Entwurf");else if(!r.awardedAt)add(r,"Vergleich / Auswahl offen");}
  else if(key==="releases"){add(r,r.status==="Gemeldet"?"Bestätigung offen":"Freimeldung im Entwurf",r.status==="Gemeldet"?"warning":"info",day(r.releaseDate));}
  else if(key==="usage"){add(r,"Einsatz noch nicht gebucht","info",day(r.date));}
  else if(key==="shipments"){
   if(r.status==="Problem")add(r,"Versandproblem gemeldet","danger",day(r.expectedDate));
   else if(r.status==="Geplant"&&day(r.plannedDate)&&day(r.plannedDate)<today)add(r,"Geplantes Versanddatum überschritten","warning",day(r.plannedDate));
   else if(r.status==="Versendet"&&day(r.expectedDate)&&day(r.expectedDate)<today)add(r,"Erwartete Zustellung überschritten","warning",day(r.expectedDate));
   else add(r,r.status==="Entwurf"?"Sendung im Entwurf":r.status==="Geplant"?"Versand geplant":"Zustellung offen","info",day(r.status==="Versendet"?r.expectedDate:r.plannedDate));
  }else if(key==="planning"){add({...r,title:r.resourceType==="MACHINE"?"Geräteeinsatz":"Personaleinsatz"},r.resourceType==="MACHINE"?"Geplanter Geräteeinsatz":"Geplanter Personaleinsatz","info",day(r.date));label="Geplante Einsätze: heute und nächste 6 Tage";}
 }
 if(key==="recurring"){
  total=0;label="Nicht erzeugte Buchungstermine bis heute";
  for(const t of rows){
   const booked=new Set(t.occurrences.map((o:any)=>day(o.date))),pending=dueDates(t,today).filter(d=>!booked.has(d));
   total+=pending.length;
   if(pending.length)add(t,pending.length+" Buchungstermin(e) offen","warning",pending[0]);
  }
 }
 const weights:Record<string,number>={danger:0,warning:1,info:2};
 details.sort((a,b)=>(weights[a.severity]-weights[b.severity])||(a.date||"9999").localeCompare(b.date||"9999")||a.title.localeCompare(b.title));
 return {key,available:true,total,label,attention:details.filter(x=>x.severity!=="info").length,open:details.length,counts,items:details.slice(0,20),truncated:details.length>20,period:key==="planning"?{from:today,to:through}:null};
}

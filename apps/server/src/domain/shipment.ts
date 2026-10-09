
import {InputError} from "./officeAddons";
import {planningDate} from "./resourcePlanning";
import {ledgerText} from "./recurringLedger";
import {berlinToday} from "./machineUsage";
const date=(v:any)=>v===undefined||v===null||v===""?null:new Date(planningDate(v)+"T00:00:00Z");
export function shipmentInput(b:any){
 const packages=b.packages===null||b.packages===""||b.packages===undefined?null:Number(b.packages);
 if(packages!==null && (!["number","string"].includes(typeof b.packages)||!Number.isSafeInteger(packages)||packages<1||packages>99999))throw new InputError("Anzahl Packstücke: 1 bis 99999.");
 const plannedDate=date(b.plannedDate),expectedDate=date(b.expectedDate);
 if(expectedDate&&plannedDate&&expectedDate<plannedDate)throw new InputError("Geplante Zustellung liegt vor dem Versand.");
 return {title:ledgerText(b.title,"Bezeichnung",250,true),recipient:ledgerText(b.recipient,"Empfänger",250),address:ledgerText(b.address,"Lieferadresse",1000),carrier:ledgerText(b.carrier,"Transporteur",250),trackingNumber:ledgerText(b.trackingNumber,"Sendungsnummer",250),contents:ledgerText(b.contents,"Sendungsinhalt",5000),notes:ledgerText(b.notes,"Bemerkung",5000),packages,plannedDate,expectedDate,documentId:ledgerText(b.documentId,"Dokument",100)||null,deliveryKey:ledgerText(b.deliveryKey,"Lieferschein",350)||null};
}
export function readyForShipment(row:any){
 if(!row.recipient||!row.address||!row.carrier||(!row.contents&&!row.deliveryKey))throw new InputError("Empfänger, Adresse, Transporteur und Sendungsinhalt oder Lieferschein erforderlich.");
}
export function shipmentAction(row:any,b:any){
 const action=b.action,reason=ledgerText(b.reason,"Grund",2000);
 const actual=b.date!==undefined&&b.date!==null&&b.date!==""?date(b.date):new Date(berlinToday()+"T00:00:00Z");
 if(actual!.toISOString().slice(0,10)>berlinToday())throw new InputError("Zukünftige Ereignisse können noch nicht bestätigt werden.");
 if(action==="plan"){
  if(row.status!=="Entwurf")throw new InputError("Nur Entwürfe können geplant werden.");
  readyForShipment(row);if(!row.plannedDate)throw new InputError("Geplantes Versanddatum erforderlich.");
  return {status:"Geplant"};
 }
 if(action==="dispatch"){
  if(!["Entwurf","Geplant"].includes(row.status))throw new InputError("Sendung ist bereits versendet oder geschlossen.");
  readyForShipment(row);return {status:"Versendet",dispatchedDate:actual,dispatchedAt:new Date()};
 }
 if(action==="deliver"){
  if(!["Versendet","Problem"].includes(row.status))throw new InputError("Nur versendete Sendungen zustellen.");
  if(!row.dispatchedDate||actual!<row.dispatchedDate)throw new InputError("Zustellung liegt vor dem Versand.");
  if(b.receiptConfirmed!==true)throw new InputError("Manuelle Zustellbestätigung erforderlich.");
  return {status:"Zugestellt",deliveredDate:actual,deliveredAt:new Date(),receivedBy:ledgerText(b.receivedBy,"Entgegengenommen durch",250,true),receiptDocumentId:ledgerText(b.receiptDocumentId,"Zustellbeleg",100)||null};
 }
 if(action==="problem"||action==="resume"){
  if(action==="problem"?row.status!=="Versendet":row.status!=="Problem")throw new InputError("Statuswechsel nicht möglich.");
  if(!reason)throw new InputError("Problem- oder Klärungsgrund erforderlich.");
  if(row.dispatchedDate&&actual!<row.dispatchedDate)throw new InputError("Ereignis liegt vor dem Versand.");
  return {status:action==="problem"?"Problem":"Versendet",lastIssue:reason};
 }
 if(action==="cancel"){
  if(!["Entwurf","Geplant"].includes(row.status))throw new InputError("Nur noch nicht versendete Sendungen stornieren.");
  if(!reason)throw new InputError("Stornogrund erforderlich.");return {status:"Storniert",cancelReason:reason};
 }
 throw new InputError("Versandaktion ungültig.");
}

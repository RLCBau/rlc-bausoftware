import {InputError} from "./officeAddons";
import {planningDate,planningNotes} from "./resourcePlanning";
export function moneyText(cents:bigint):string{if(cents<0n)return "-"+moneyText(-cents);return (cents/100n).toString()+"."+(cents%100n).toString().padStart(2,"0");}
export function usageDecimal(value:unknown,name:string,maxDigits:number):bigint{
 if(typeof value!=="string" && typeof value!=="number")throw new InputError(name+" erforderlich.");
 const text=String(value).trim().replace(",",".");
 if(!new RegExp("^\\d{1,"+maxDigits+"}(?:\\.\\d{1,2})?$").test(text))throw new InputError(name+": höchstens zwei Nachkommastellen, kein negativer Wert.");
 const [whole,part=""]=text.split(".");return BigInt(whole)*100n+BigInt(part.padEnd(2,"0"));
}
export function usageAmount(hours:unknown,rate:unknown){
 const h=usageDecimal(hours,"Stunden",2),r=usageDecimal(rate,"Stundensatz",10);
 if(h<=0n || h>2400n)throw new InputError("Stunden müssen größer als 0 und höchstens 24 sein.");
 return moneyText((h*r+50n)/100n);
}
export function usageInput(body:any){
 if(!body || typeof body!=="object" || Array.isArray(body))throw new InputError("Ungültiger Geräteeinsatz.");
 const text=(v:unknown,label:string,max:number,required=false)=>{if(v!=null && typeof v!=="string")throw new InputError(label+": Text erforderlich.");const value=String(v??"").trim();if((required&&!value)||value.length>max)throw new InputError(label+": ungültige Länge.");return value;};
 const date=planningDate(body.date),hours=usageDecimal(body.hours,"Stunden",2),rate=usageDecimal(body.hourlyRate,"Stundensatz",10);
 const amount=usageAmount(body.hours,body.hourlyRate);
 return {machineId:text(body.machineId,"Gerät",100,true),date:new Date(date+"T00:00:00.000Z"),hours:moneyText(hours),hourlyRate:moneyText(rate),amount,costCenter:text(body.costCenter,"Kostenstelle",100)||null,activity:text(body.activity,"Tätigkeit",250,true),notes:planningNotes(body.notes),documentId:text(body.documentId,"Dokument",100)||null};
}
export function berlinToday(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Berlin",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}

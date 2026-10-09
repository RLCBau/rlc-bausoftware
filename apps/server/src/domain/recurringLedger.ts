
import { InputError } from "./officeAddons";
import { planningDate } from "./resourcePlanning";
export function ledgerAmount(value:unknown):string {
 if(typeof value!=="string" && typeof value!=="number")throw new InputError("Betrag erforderlich.");
 const s=String(value).trim().replace(",",".");
 if(!/^-?\d{1,12}(\.\d{1,2})?$/.test(s))throw new InputError("Betrag mit höchstens zwei Nachkommastellen erforderlich.");
 const negative=s.startsWith("-"),[a,b=""]=s.replace(/^-/,"").split(".");
 const cents=BigInt(a)*100n+BigInt(b.padEnd(2,"0"));
 if(cents===0n)throw new InputError("Betrag darf nicht null sein.");
 return (negative?"-":"")+(cents/100n)+"."+String(cents%100n).padStart(2,"0");
}
export function ledgerText(v:unknown,label:string,max:number,required=false):string {
 if(v!==undefined && v!==null && typeof v!=="string")throw new InputError(label+" ungültig.");
 const s=String(v??"").trim();
 if(s.length>max || (required && !s))throw new InputError(label+" erforderlich oder zu lang.");
 return s;
}
export function journalInput(b:any) {
 const account=ledgerText(b.account,"Konto",20,true),contraAccount=ledgerText(b.contraAccount,"Gegenkonto",20,true);
 if(!/^\d{1,10}$/.test(account)||!/^\d{1,10}$/.test(contraAccount)||account===contraAccount)throw new InputError("Unterschiedliche numerische Konten erforderlich.");
 return {account,contraAccount,amount:ledgerAmount(b.amount),text:ledgerText(b.text,"Buchungstext",1000,true),costCenter:ledgerText(b.costCenter,"Kostenstelle",100)||null};
}
export function recurringInput(b:any){
 const startDate=new Date(planningDate(b.startDate)+"T00:00:00Z"),endDate=b.endDate?new Date(planningDate(b.endDate)+"T00:00:00Z"):null;
 if(startDate.getUTCFullYear()<1900)throw new InputError("Startdatum ab 1900 erforderlich.");
 if(endDate && endDate<startDate)throw new InputError("Enddatum liegt vor Startdatum.");
 if(!["MONTHLY","QUARTERLY","YEARLY"].includes(b.frequency))throw new InputError("Intervall ungültig.");
 if(typeof b.active!=="boolean")throw new InputError("Aktivstatus erforderlich.");
 return {...journalInput(b),title:ledgerText(b.title,"Bezeichnung",250,true),startDate,endDate,frequency:b.frequency as string,active:b.active};
}
export function dueDates(template:any,through:string):string[]{
 const limit=new Date(planningDate(through)+"T00:00:00Z"),start=new Date(template.startDate),end=template.endDate?new Date(template.endDate):limit;
 const step=template.frequency==="MONTHLY"?1:template.frequency==="QUARTERLY"?3:12;
 const result:string[]=[];
 for(let i=0;i<1200;i++){
  const month=start.getUTCMonth()+i*step;
  const year=start.getUTCFullYear()+Math.floor(month/12),m=month%12;
  if(year>9999)break;
  const day=Math.min(start.getUTCDate(),new Date(Date.UTC(year,m+1,0)).getUTCDate());
  const d=new Date(Date.UTC(year,m,day));
  if(d>limit || d>end) return result;
  result.push(d.toISOString().slice(0,10));
 }
 throw new InputError("Zeitraum zu groß. Maximal 1200 Fälligkeiten je Vorlage.");
}

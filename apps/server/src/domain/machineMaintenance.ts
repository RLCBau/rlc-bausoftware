import {InputError} from "./officeAddons";
import {certificateDate,certificateExpiry} from "./personnelCertificate";
import {berlinToday,usageDecimal,moneyText} from "./machineUsage";
export function maintenanceInput(b:any,old:any={}){
 const v=(k:string,fallback:any)=>{if(b[k]!==undefined)return b[k];const value=old[k]??fallback;return value instanceof Date?value.toISOString():k==="costNet"?String(value):value;};
 const date=certificateDate(v("date",berlinToday()));if(!date)throw new InputError("Wartungsdatum erforderlich.");
 const nextService=certificateDate(v("nextService",null)),status=v("status","ERLEDIGT");
 if(!["GEPLANT","OFFEN","ERLEDIGT"].includes(status))throw new InputError("Wartungsstatus ungültig.");
 if(status==="ERLEDIGT"&&date.toISOString().slice(0,10)>berlinToday())throw new InputError("Zukünftige Wartung kann noch nicht als erledigt bestätigt werden.");
 if(nextService&&nextService<date)throw new InputError("Nächster Termin liegt vor dem Wartungsdatum.");
 const rawHours=v("hours",0);if(!["number","string"].includes(typeof rawHours)||String(rawHours).trim()===""||!Number.isFinite(Number(rawHours))||Number(rawHours)<0||Number(rawHours)>99999999)throw new InputError("Betriebsstunden ungültig.");
 const costNet=moneyText(usageDecimal(v("costNet",0),"Kosten",10));
 const text=(k:string,max:number)=>{const raw=v(k,"");if(raw!==null&&typeof raw!=="string")throw new InputError(k+": Text erforderlich.");const s=String(raw??"").trim();if(s.length>max)throw new InputError(k+": Text zu lang.");return s||null;};
 return {date,nextService,status,hours:Number(rawHours),costNet,type:text("type",250),workshop:text("workshop",250),technician:text("technician",250),notes:text("notes",5000)};
}
export function machineDeadlines(machines:any[],records:any[],meta:Record<string,any>,day=berlinToday()){
 const items:any[]=[];
 for(const m of machines){
  const rows=records.filter(r=>r.machineId===m.id),inspection=rows.filter(r=>r.status==="ERLEDIGT"&&meta[r.id]?.data?.isInspection).sort((a,b)=>b.date.getTime()-a.date.getTime())[0];
  const add=(kind:string,date:Date|null,source:string,recordId:string|null=null,extra:any={})=>items.push({id:m.id+":"+kind,machineId:m.id,machineName:m.name,serial:m.serial,projectId:m.projectId,location:m.location,kind,date:date?.toISOString().slice(0,10)||"",source,recordId,expiry:certificateExpiry(date,day),...extra});
  add("SERVICE",m.nextService||null,"MASCHINENSTAMM");
  if(inspection){const raw=meta[inspection.id].data.nextInspection;let d:Date|null=null;let invalidDate=false;try{d=certificateDate(raw);}catch{invalidDate=true;}
   add("PRUEFUNG",d,"PRUEFNACHWEIS",inspection.id,{inspectionResult:meta[inspection.id].data.inspectionResult||"",evidenceLocked:!!meta[inspection.id].lock,invalidDate});
  }else add("PRUEFUNG",null,"KEIN_ABGESCHLOSSENER_PRUEFNACHWEIS");
  for(const r of rows.filter(r=>["GEPLANT","OFFEN"].includes(r.status)))add("TERMIN:"+r.id,r.date,r.status,r.id,{title:r.type||"Wartung",isInspection:meta[r.id]?.data?.isInspection===true});
 }
 return items;
}

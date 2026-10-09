import {InputError} from "./officeAddons";
import {berlinToday} from "./machineUsage";
export function certificateDate(v:any){
 if(v===null||v===undefined||v==="")return null;
 if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(v))throw new InputError("Gültiges Ablaufdatum erforderlich.");
 const day=v.slice(0,10),d=new Date(day+"T12:00:00.000Z");
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==day||(v.length>10&&!Number.isFinite(new Date(v).getTime())))throw new InputError("Gültiges Ablaufdatum erforderlich.");
 return d;
}
export function certificateName(v:any){
 if(typeof v!=="string"||!v.trim()||v.trim().length>250)throw new InputError("Bezeichnung erforderlich, höchstens 250 Zeichen.");return v.trim();
}
export function certificateExpiry(v:Date|null,day=berlinToday()){
 if(!v)return {status:"OHNE_DATUM",days:null};
 const days=Math.round((Date.parse(v.toISOString().slice(0,10)+"T00:00:00Z")-Date.parse(day+"T00:00:00Z"))/86400000);
 return {status:days<0?"ABGELAUFEN":days<=30?"BALD_FAELLIG":"GUELTIG",days};
}

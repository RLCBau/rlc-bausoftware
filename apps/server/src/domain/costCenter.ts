import {InputError} from "./officeAddons";
import {usageDecimal,moneyText} from "./machineUsage";
export class CostCenterError extends InputError {constructor(message:string,public status=400){super(message);}}
export function costCenterInput(body:any,old:any={}){
 if(!body||typeof body!=="object"||Array.isArray(body))throw new InputError("Ungültige Kostenstelle.");
 const value=(key:string,alias:string,fallback:any)=>body[key]!==undefined?body[key]:body[alias]!==undefined?body[alias]:old[key]??fallback;
 const text=(key:string,alias:string,fallback:string,max:number,required=false)=>{const raw=value(key,alias,fallback);if(raw!=null&&typeof raw!=="string")throw new InputError(key+": Text erforderlich.");const s=String(raw??"").trim();if((required&&!s)||s.length>max)throw new InputError(key+": ungültige Länge.");return s;};
 const code=text("code","code","",100,true);if(old.id&&code!==old.code)throw new InputError("Der Kostenstellen-Code kann nicht geändert werden.");
 const rawBudget=value("budget","budget",0);const budget=moneyText(usageDecimal(body.budget===undefined&&old.budget!=null?String(old.budget):rawBudget,"Budget",12));
 const active=value("active","active",true);if(typeof active!=="boolean")throw new InputError("Aktiv muss Ja oder Nein sein.");
 return {code,description:text("description","bezeichnung","Kostenstelle",250,true),mainArea:text("mainArea","hauptbereich","Allgemein",150,true),budget,unit:text("unit","einheit","",50)||null,note:text("note","bemerkung","",5000)||null,active};
}
export function checkCostCenterRevision(body:any,old:any){
 if(body.expectedUpdatedAt===undefined)return;
 if(typeof body.expectedUpdatedAt!=="string"||!Number.isFinite(Date.parse(body.expectedUpdatedAt)))throw new InputError("Versionsangabe ungültig.");
 if(new Date(body.expectedUpdatedAt).getTime()!==old.updatedAt.getTime())throw new CostCenterError("Kostenstelle wurde inzwischen geändert. Bitte neu laden.",409);
}
